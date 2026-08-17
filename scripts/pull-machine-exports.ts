import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface MachineConfig {
  id: string;
  host: string;
  user: string;
  path: string;
}

const configPath = resolve(
  process.env.SLOPMETER_MACHINE_CONFIG?.trim() ||
    `${process.env.HOME}/.config/slopmeter/machines.json`,
);
const outputDir = resolve(
  process.env.SLOPMETER_MACHINE_EXPORT_DIR?.trim() ||
    `${process.env.HOME}/.local/share/slopmeter/machine-exports`,
);

function main() {
  if (!existsSync(configPath)) {
    process.stdout.write(
      "No machine configuration found; preserving current imports.\n",
    );
    return;
  }

  const machines = JSON.parse(
    readFileSync(configPath, "utf8"),
  ) as MachineConfig[];
  mkdirSync(outputDir, { recursive: true });

  for (const machine of machines) {
    const destination = resolve(outputDir, `${machine.id}.json`);
    const temporaryPath = `${destination}.tmp`;
    try {
      execFileSync(
        "scp",
        [
          "-q",
          "-o",
          "ConnectTimeout=10",
          "-o",
          "BatchMode=yes",
          `${machine.user}@${machine.host}:${machine.path}`,
          temporaryPath,
        ],
        { stdio: "inherit" },
      );
      renameSync(temporaryPath, destination);
      process.stdout.write(`Pulled ${machine.id}\n`);
    } catch (error) {
      process.stderr.write(
        `Could not pull ${machine.id}; preserving the previous export if present. ${String(error)}\n`,
      );
    }
  }
}

main();
