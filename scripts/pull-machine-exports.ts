import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface MachineRoute {
  host: string;
  user: string;
  path: string;
  proxyJump?: string;
}

interface MachineConfig extends MachineRoute {
  id: string;
  fallback?: MachineRoute;
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
    const routes = [machine, ...(machine.fallback ? [machine.fallback] : [])];
    let pulled = false;

    for (const [index, route] of routes.entries()) {
      const temporaryPath = `${destination}.tmp`;
      const routeLabel = index === 0 ? "direct" : "fallback";
      const scpArgs = [
        "-q",
        "-o",
        "ConnectTimeout=10",
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=accept-new",
      ];
      if (route.proxyJump) {
        scpArgs.push("-o", `ProxyJump=${route.proxyJump}`);
      }
      scpArgs.push(`${route.user}@${route.host}:${route.path}`, temporaryPath);

      try {
        execFileSync("scp", scpArgs, { stdio: "inherit" });
        renameSync(temporaryPath, destination);
        process.stdout.write(`Pulled ${machine.id} via ${routeLabel} route\n`);
        pulled = true;
        break;
      } catch (error) {
        process.stderr.write(
          `Could not pull ${machine.id} via ${routeLabel} route; trying the next route. ${String(error)}\n`,
        );
      }
    }

    if (!pulled) {
      process.stderr.write(
        `Could not pull ${machine.id} through any route; preserving the previous export if present.\n`,
      );
    }
  }
}

main();
