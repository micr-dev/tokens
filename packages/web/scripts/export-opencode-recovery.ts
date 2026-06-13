import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import {
  buildOpenCodeRecoveryExportMessageFromJsonlRecord,
  buildOpenCodeRecoveryExportPayload,
  buildOpenCodeRecoveryExportPayloadFromMessages,
  DEFAULT_OPENCODE_RECOVERY_SOURCE_DB_PATH,
  type OpenCodeRecoveryExportMessage,
  type OpenCodeRecoveryMergedMessageRow,
  summarizeOpenCodeRecoveryExportPayload,
} from "./lib/opencode-recovery";
import { loadT3PublishedSummary } from "./lib/t3-chat";

const DEFAULT_OUTPUT_PATH =
  "/home/ubuntu/.local/share/opencode/recovery/t3-chat-export-opencode-recovered.json";
const DEFAULT_EXTRA_JSONL_PATH =
  "/home/ubuntu/.local/share/opencode/recovery/all-recovered-messages-clean.jsonl";

function resolvePath(pathValue: string) {
  return resolve(pathValue);
}

function getExtraJsonlPaths() {
  const configured = process.env.SLOPMETER_WEB_OPENCODE_RECOVERY_EXTRA_JSONL_PATHS?.trim();

  if (!configured) {
    return existsSync(DEFAULT_EXTRA_JSONL_PATH) ? [DEFAULT_EXTRA_JSONL_PATH] : [];
  }

  return configured
    .split(/[,:\n]/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map(resolvePath);
}

async function withoutSqliteExperimentalWarning<T>(callback: () => Promise<T>) {
  const originalEmitWarning = process.emitWarning.bind(process);

  process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
    const warningText = typeof warning === "string" ? warning : warning.message;
    const warningType =
      warning instanceof Error ? warning.name : String(args[0] ?? "");

    if (warningType === "ExperimentalWarning" && /sqlite/i.test(warningText)) {
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

async function readRecoveryRows(sourceDbPath: string) {
  return withoutSqliteExperimentalWarning(async () => {
    const { DatabaseSync } = await import("node:sqlite");
    const database = new DatabaseSync(sourceDbPath, { readOnly: true });

    try {
      return [
        ...database
          .prepare(
            `SELECT source_file, id, session_id, time_created, time_created_utc, role, model_id, provider_id, data
         FROM merged_messages
         ORDER BY time_created ASC, id ASC`,
          )
          .iterate(),
      ] as OpenCodeRecoveryMergedMessageRow[];
    } finally {
      database.close();
    }
  });
}

function readExtraJsonlMessages(paths: string[]) {
  const messages: OpenCodeRecoveryExportMessage[] = [];
  const loadedPaths: string[] = [];

  for (const path of paths) {
    if (!existsSync(path)) {
      continue;
    }

    const lines = readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const sourceName = basename(path);

    loadedPaths.push(path);

    for (const line of lines) {
      const record = JSON.parse(line) as Parameters<
        typeof buildOpenCodeRecoveryExportMessageFromJsonlRecord
      >[0];
      const message = buildOpenCodeRecoveryExportMessageFromJsonlRecord(
        record,
        sourceName,
      );

      if (!message) {
        continue;
      }

      messages.push(message);
    }
  }

  return {
    messages,
    loadedPaths,
  };
}

async function main() {
  const sourceDbPath = resolvePath(
    process.env.SLOPMETER_WEB_OPENCODE_RECOVERY_SOURCE_DB?.trim() ||
      DEFAULT_OPENCODE_RECOVERY_SOURCE_DB_PATH,
  );
  const outputPath = resolvePath(
    process.env.SLOPMETER_WEB_OPENCODE_RECOVERY_IMPORT_PATH?.trim() ||
      DEFAULT_OUTPUT_PATH,
  );
  const extraJsonlPaths = getExtraJsonlPaths();
  const rows = await readRecoveryRows(sourceDbPath);
  const dbPayload = buildOpenCodeRecoveryExportPayload(
    rows,
    basename(sourceDbPath),
  );
  const extraJsonl = readExtraJsonlMessages(extraJsonlPaths);
  const payload = buildOpenCodeRecoveryExportPayloadFromMessages([
    ...dbPayload.messages,
    ...extraJsonl.messages,
  ]);
  const exportSummary = summarizeOpenCodeRecoveryExportPayload(payload);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  const validation = await loadT3PublishedSummary(
    outputPath,
    new Date("2000-01-01T00:00:00.000Z"),
    new Date("2100-01-01T00:00:00.000Z"),
    "opencode",
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        sourceDbPath,
        outputPath,
        scannedRows: rows.length,
        exportedMessages: exportSummary.messageCount,
        firstCreatedAt: exportSummary.firstCreatedAt,
        lastCreatedAt: exportSummary.lastCreatedAt,
        dayCount: exportSummary.dayCount,
        extraJsonlPaths: extraJsonl.loadedPaths,
        extraJsonlMessages: extraJsonl.messages.length,
        validation: validation
          ? {
              provider: validation.provider,
              days: validation.daily.length,
              totalTokens: validation.daily.reduce(
                (sum, row) => sum + row.total,
                0,
              ),
              topModel: validation.insights.mostUsedModel?.name ?? null,
            }
          : null,
      },
      null,
      2,
    )}\n`,
  );
}

await main();
