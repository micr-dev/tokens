import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { CliDailyRow } from "./interfaces";

export function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDailyTotal(totals: Map<string, number>, date: string, amount: number): void {
  totals.set(date, (totals.get(date) ?? 0) + amount);
}

export function totalsToRows(totals: Map<string, number>): CliDailyRow[] {
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, totalTokens]) => ({ date, totalTokens }));
}

export function listFilesRecursive(rootDir: string, extension: string): string[] {
  if (!existsSync(rootDir)) {
    return [];
  }

  const files: string[] = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    if (!currentDir) {
      continue;
    }

    const entries = readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (entry.isFile() && fullPath.endsWith(extension)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}
