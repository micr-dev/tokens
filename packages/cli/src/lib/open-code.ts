import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { UsageSummary } from "../interfaces";
import {
  type DailyTotalsByDate,
  type DailyTokenTotals,
  type ModelTokenTotals,
  addDailyTokenTotals,
  addModelTokenTotals,
  createUsageSummary,
  getRecentWindowStart,
  listFilesRecursive,
  normalizeModelName,
  parseJsonTextWithLimit,
  readJsonDocument,
} from "./utils";

interface OpenCodeTokenCache {
  read?: number;
  write?: number;
}

interface OpenCodeTokens {
  input?: number;
  output?: number;
  cache?: OpenCodeTokenCache;
}

interface OpenCodeMessage {
  id: string;
  role?: string;
  providerID: string;
  modelID: string;
  time: { created: number };
  tokens?: OpenCodeTokens;
}

interface OpenCodeMessageRow {
  id: string;
  data: string;
}

interface OpenCodeDatabaseSource {
  kind: "database";
  path: string;
}

interface OpenCodeLegacySource {
  kind: "legacy";
  files: string[];
}

interface OpenCodeSlateSource {
  kind: "slate";
  files: string[];
}

type OpenCodeSource =
  | OpenCodeDatabaseSource
  | OpenCodeLegacySource
  | OpenCodeSlateSource;

interface OpenCodeSlateUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

interface OpenCodeSlateMessage {
  id: string;
  role?: string;
  model?: string;
  timestamp?: number;
  usage?: OpenCodeSlateUsage;
}

function sumOpenCodeTokens(tokens?: OpenCodeTokens): DailyTokenTotals {
  const cacheInput = tokens?.cache?.read ?? 0;
  const cacheOutput = tokens?.cache?.write ?? 0;
  const input = (tokens?.input ?? 0) + cacheInput;
  const output = (tokens?.output ?? 0) + cacheOutput;

  return {
    input,
    output,
    cache: { input: cacheInput, output: cacheOutput },
    total: input + output,
  };
}

async function parseOpenCodeFile(filePath: string) {
  return readJsonDocument<OpenCodeMessage>(filePath);
}

function getOpenCodeBaseDir() {
  const baseDir = process.env.OPENCODE_DATA_DIR?.trim()
    ? resolve(process.env.OPENCODE_DATA_DIR)
    : join(homedir(), ".local", "share", "opencode");

  return baseDir;
}

async function getOpenCodeSource(): Promise<OpenCodeSource> {
  const baseDir = getOpenCodeBaseDir();
  const databasePath = join(baseDir, "opencode.db");

  if (existsSync(databasePath)) {
    return { kind: "database", path: databasePath };
  }

  const messagesDir = join(baseDir, "storage", "message");

  return { kind: "legacy", files: await listFilesRecursive(messagesDir, ".json") };
}

// OpenCode can launch with its own XDG_DATA_HOME. Ask the installed CLI
// where it writes data instead of assuming the publisher inherits that setting.
export function parseOpenCodeDataPath(output: string) {
  return output.match(/^data\s+(.+)$/m)?.[1]?.trim();
}

async function getOpenCodeSources(): Promise<OpenCodeSource[]> {
  const baseDir = getOpenCodeBaseDir();
  const directories = new Set([baseDir]);
  if (!process.env.OPENCODE_DATA_DIR?.trim()) {
    try {
      const paths = execFileSync(process.env.OPENCODE_CLI?.trim() || "opencode", ["debug", "paths"], {
        encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"],
      });
      const nativeDir = parseOpenCodeDataPath(paths);
      if (nativeDir) directories.add(resolve(nativeDir));
    } catch (error) {
      // Older versions lack this command. Keep the default store, but report
      // other failures so a changed CLI cannot silently hide usage.
      const failure = error as NodeJS.ErrnoException & { status?: number };
      if (failure.code !== "ENOENT") {
        process.stderr.write(`Could not discover Opencode's data directory: ${failure.message}\n`);
      }
    }
  }

  const sources: OpenCodeSource[] = [];
  const slateDirectories = new Set<string>();
  for (const directory of directories) {
    const databasePath = join(directory, "opencode.db");
    if (existsSync(databasePath)) sources.push({ kind: "database", path: databasePath });

    const legacyFiles = await listFilesRecursive(join(directory, "storage", "message"), ".json");
    if (legacyFiles.length > 0) sources.push({ kind: "legacy", files: legacyFiles });

    const slateMessagesDir = join(resolve(directory, ".."), "slate", "storage", "message");
    if (!slateDirectories.has(slateMessagesDir)) {
      slateDirectories.add(slateMessagesDir);
      const slateFiles = await listFilesRecursive(slateMessagesDir, ".json");
      if (slateFiles.length > 0) sources.push({ kind: "slate", files: slateFiles });
    }
  }
  return sources;
}

async function loadSqliteModule() {
  try {
    const moduleName = "node:sqlite";

    return await import(moduleName);
  } catch {
    throw new Error(
      "OpenCode SQLite support requires a Node.js runtime that provides node:sqlite.",
    );
  }
}

async function withoutSqliteExperimentalWarning<T>(callback: () => Promise<T>) {
  const originalEmitWarning = process.emitWarning.bind(process);

  process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
    const warningText =
      typeof warning === "string" ? warning : warning.message;
    const warningType =
      warning instanceof Error ? warning.name : String(args[0] ?? "");

    if (
      warningType === "ExperimentalWarning" &&
      /sqlite/i.test(warningText)
    ) {
      return;
    }

    return Reflect.apply(originalEmitWarning, process, [
      warning,
      ...args,
    ] as Parameters<typeof process.emitWarning>);
  }) as typeof process.emitWarning;

  try {
    return await callback();
  } finally {
    process.emitWarning = originalEmitWarning;
  }
}

function parseOpenCodeMessageData(
  rowId: string,
  sourceLabel: string,
  content: string,
) {
  const message = parseJsonTextWithLimit<OpenCodeMessage>(content, sourceLabel);

  return {
    ...message,
    id: message.id || rowId,
  };
}

function isSqliteLockedError(error: unknown) {
  return error instanceof Error && /database is locked/i.test(error.message);
}

async function withDatabaseSnapshot<T>(
  databasePath: string,
  callback: (snapshotPath: string) => Promise<T>,
) {
  const snapshotDir = await mkdtemp(join(tmpdir(), "slopmeter-opencode-"));
  const snapshotPath = join(snapshotDir, "opencode.db");

  await copyFile(databasePath, snapshotPath);

  for (const suffix of ["-shm", "-wal"]) {
    const companionPath = `${databasePath}${suffix}`;

    if (!existsSync(companionPath)) {
      continue;
    }

    await copyFile(companionPath, `${snapshotPath}${suffix}`);
  }

  try {
    return await callback(snapshotPath);
  } finally {
    await rm(snapshotDir, { recursive: true, force: true });
  }
}

async function iterateOpenCodeDatabaseMessages(
  databasePath: string,
  onMessage: (message: OpenCodeMessage) => void,
) {
  await withoutSqliteExperimentalWarning(async () => {
    const { DatabaseSync } = await loadSqliteModule();
    const database = new DatabaseSync(databasePath, { readOnly: true });

    try {
      // Current OpenCode stores assistant and compaction usage in session_message.
      // Older databases store both in message with a different model shape.
      const currentSchema = database
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'session_message'",
        )
        .get();
      const statement = database.prepare(
        currentSchema
          ? "SELECT id, data FROM session_message WHERE type IN ('assistant', 'compaction') ORDER BY time_created ASC"
          : "SELECT id, data FROM message ORDER BY time_created ASC",
      );

      for (const row of statement.iterate() as Iterable<OpenCodeMessageRow>) {
        if (currentSchema) {
          const message = parseJsonTextWithLimit<
            Omit<OpenCodeMessage, "id" | "modelID" | "providerID"> & {
              model?: { id: string; providerID: string };
            }
          >(row.data, `${databasePath}:session_message:${row.id}`);
          onMessage({
            ...message,
            id: row.id,
            modelID: message.model?.id ?? "unknown",
            providerID: message.model?.providerID ?? "unknown",
          });
        } else {
          onMessage(
            parseOpenCodeMessageData(
              row.id,
              `${databasePath}:message:${row.id}`,
              row.data,
            ),
          );
        }
      }
    } finally {
      database.close();
    }
  });
}

async function loadOpenCodeDatabaseMessages(
  databasePath: string,
  onMessage: (message: OpenCodeMessage) => void,
) {
  try {
    await iterateOpenCodeDatabaseMessages(databasePath, onMessage);
  } catch (error) {
    if (!isSqliteLockedError(error)) {
      throw error;
    }

    await withDatabaseSnapshot(databasePath, async (snapshotPath) => {
      await iterateOpenCodeDatabaseMessages(snapshotPath, onMessage);
    });
  }
}

function addOpenCodeMessage(
  message: OpenCodeMessage,
  start: Date,
  end: Date,
  recentStart: Date,
  totals: DailyTotalsByDate,
  modelTotals: Map<string, ModelTokenTotals>,
  recentModelTotals: Map<string, ModelTokenTotals>,
  dedupe: Set<string>,
) {
  if (dedupe.has(message.id)) {
    return;
  }

  dedupe.add(message.id);

  const tokenTotals = sumOpenCodeTokens(message.tokens);

  if (tokenTotals.total <= 0) {
    return;
  }

  const date = new Date(message.time.created);

  if (date < start || date > end) {
    return;
  }

  const modelName = normalizeModelName(message.modelID);

  addDailyTokenTotals(totals, date, tokenTotals, modelName);
  addModelTokenTotals(modelTotals, modelName, tokenTotals);

  if (date >= recentStart) {
    addModelTokenTotals(recentModelTotals, modelName, tokenTotals);
  }
}

function sumSlateTokens(usage?: OpenCodeSlateUsage): DailyTokenTotals {
  const input = Math.max(0, Math.round(usage?.promptTokens ?? 0));
  const candidateOutput = Math.max(0, Math.round(usage?.completionTokens ?? 0));
  const recordedTotal = Math.max(0, Math.round(usage?.totalTokens ?? 0));
  const total = Math.max(recordedTotal, input + candidateOutput);

  return {
    input,
    output: Math.max(total - input, 0),
    cache: { input: 0, output: 0 },
    total,
  };
}

function addSlateMessage(
  message: OpenCodeSlateMessage,
  start: Date,
  end: Date,
  recentStart: Date,
  totals: DailyTotalsByDate,
  modelTotals: Map<string, ModelTokenTotals>,
  recentModelTotals: Map<string, ModelTokenTotals>,
  dedupe: Set<string>,
) {
  if (message.role !== "assistant" || !message.id) {
    return;
  }

  if (dedupe.has(message.id)) {
    return;
  }

  dedupe.add(message.id);

  const tokenTotals = sumSlateTokens(message.usage);

  if (tokenTotals.total <= 0) {
    return;
  }

  if (typeof message.timestamp !== "number" || !Number.isFinite(message.timestamp)) {
    return;
  }

  const date = new Date(message.timestamp);

  if (date < start || date > end) {
    return;
  }

  const modelName = normalizeModelName(message.model ?? "unknown");

  addDailyTokenTotals(totals, date, tokenTotals, modelName);
  addModelTokenTotals(modelTotals, modelName, tokenTotals);

  if (date >= recentStart) {
    addModelTokenTotals(recentModelTotals, modelName, tokenTotals);
  }
}

export async function loadOpenCodeRows(
  start: Date,
  end: Date,
): Promise<UsageSummary> {
  const sources = await getOpenCodeSources();
  const totals: DailyTotalsByDate = new Map();
  const dedupe = new Set<string>();
  const recentStart = getRecentWindowStart(end, 30);
  const modelTotals = new Map<string, ModelTokenTotals>();
  const recentModelTotals = new Map<string, ModelTokenTotals>();

  for (const source of sources) {
    if (source.kind === "database") {
      await loadOpenCodeDatabaseMessages(source.path, (message) => {
        addOpenCodeMessage(
          message,
          start,
          end,
          recentStart,
          totals,
          modelTotals,
          recentModelTotals,
          dedupe,
        );
      });

      continue;
    }

    for (const file of source.files) {
      if (source.kind === "legacy") {
        const message = await parseOpenCodeFile(file);

        addOpenCodeMessage(
          message,
          start,
          end,
          recentStart,
          totals,
          modelTotals,
          recentModelTotals,
          dedupe,
        );
        continue;
      }

      const message = await readJsonDocument<OpenCodeSlateMessage>(file);

      addSlateMessage(
        message,
        start,
        end,
        recentStart,
        totals,
        modelTotals,
        recentModelTotals,
        dedupe,
      );
    }
  }

  return createUsageSummary(
    "opencode",
    totals,
    modelTotals,
    recentModelTotals,
    end,
  );
}
