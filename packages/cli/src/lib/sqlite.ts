import { existsSync } from "node:fs";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Checks whether an error is a SQLite "database is locked" error.
 *
 * @param error - The error to check.
 * @returns True if the error indicates a locked database.
 */
export function isSqliteLockedError(error: unknown) {
  return error instanceof Error && /database is locked/i.test(error.message);
}

/**
 * Creates a temporary snapshot of a SQLite database (including WAL/SHM files),
 * runs a callback with the snapshot path, and cleans up afterward.
 *
 * @typeParam T - Return type of the callback.
 * @param databasePath - Path to the original SQLite database.
 * @param label - Label for the temp directory name.
 * @param callback - Async function receiving the snapshot file path.
 * @returns The callback's return value.
 */
export async function withSqliteSnapshot<T>(
  databasePath: string,
  label: string,
  callback: (snapshotPath: string) => Promise<T>,
) {
  const snapshotDir = await mkdtemp(join(tmpdir(), `slopmeter-${label}-`));
  const snapshotPath = join(snapshotDir, "snapshot.db");

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
