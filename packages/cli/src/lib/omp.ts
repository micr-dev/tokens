import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { UsageSummary } from "../interfaces";
import {
  type DailyTotalsByDate,
  type ModelTokenTotals,
  addDailyTokenTotals,
  addModelTokenTotals,
  createUsageSummary,
  getRecentWindowStart,
  listFilesRecursive,
  normalizeModelName,
  readJsonLines,
} from "./utils";

interface OmpUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
}

interface OmpRecord {
  timestamp?: string;
  message?: {
    role?: string;
    model?: string;
    usage?: OmpUsage;
  };
}

function getOmpSessionsDir() {
  const agentDir = process.env.OMP_AGENT_DIR?.trim()
    ? resolve(process.env.OMP_AGENT_DIR)
    : join(homedir(), ".omp", "agent");

  return join(agentDir, "sessions");
}

function positive(value?: number) {
  return Number.isFinite(value) && value && value > 0 ? Math.round(value) : 0;
}

export async function loadOmpRows(
  start: Date,
  end: Date,
): Promise<UsageSummary> {
  const totals: DailyTotalsByDate = new Map();
  const modelTotals = new Map<string, ModelTokenTotals>();
  const recentModelTotals = new Map<string, ModelTokenTotals>();
  const sessionsDir = getOmpSessionsDir();

  if (!existsSync(sessionsDir)) {
    return createUsageSummary("omp", totals, modelTotals, recentModelTotals, end);
  }

  const recentStart = getRecentWindowStart(end, 30);
  const files = await listFilesRecursive(sessionsDir, ".jsonl");

  for (const file of files) {
    for await (const record of readJsonLines<OmpRecord>(file)) {
      const message = record.message;

      if (message?.role !== "assistant" || !message.usage || !record.timestamp) {
        continue;
      }

      const date = new Date(record.timestamp);

      if (Number.isNaN(date.getTime()) || date < start || date > end) {
        continue;
      }

      const cacheInput = positive(message.usage.cacheRead);
      const cacheOutput = positive(message.usage.cacheWrite);
      const input = positive(message.usage.input) + cacheInput;
      const output = positive(message.usage.output) + cacheOutput;
      const total = Math.max(positive(message.usage.totalTokens), input + output);

      if (total <= 0) {
        continue;
      }

      const model = normalizeModelName(message.model ?? "unknown");
      const tokenTotals = {
        input,
        output: total - input,
        cache: { input: cacheInput, output: cacheOutput },
        total,
      };

      addDailyTokenTotals(totals, date, tokenTotals, model);
      addModelTokenTotals(modelTotals, model, tokenTotals);

      if (date >= recentStart) {
        addModelTokenTotals(recentModelTotals, model, tokenTotals);
      }
    }
  }

  return createUsageSummary("omp", totals, modelTotals, recentModelTotals, end);
}