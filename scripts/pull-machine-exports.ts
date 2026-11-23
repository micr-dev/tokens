import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

interface MachineRoute {
  host: string;
  user: string;
  path?: string;
  proxyJump?: string;
}

interface MachineConfig extends MachineRoute {
  id: string;
  source?: "opencode-ssh";
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

  let openCodeBundle: string | undefined;
  for (const machine of machines) {
    const destination = resolve(outputDir, `${machine.id}.json`);
    const routes = [machine, ...(machine.fallback ? [machine.fallback] : [])];
    let pulled = false;

    for (const [index, route] of routes.entries()) {
      const temporaryPath = `${destination}.tmp`;
      const routeLabel = index === 0 ? "direct" : "fallback";
      const sshOptions = [
        "-q",
        "-o",
        "ConnectTimeout=10",
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=accept-new",
      ];
      if (route.proxyJump) {
        sshOptions.push("-o", `ProxyJump=${route.proxyJump}`);
      }
      try {
        // ConnectTimeout only covers the handshake; a stalled transfer over a
        // flaky Tailscale/DERP path must not hang the whole publisher.
        if (machine.source === "opencode-ssh") {
          // Run the same loader remotely without installing code or copying
          // private conversation contents off the machine.
          openCodeBundle ??= execFileSync(
            "bun",
            [
              "build",
              "scripts/export-opencode-machine.ts",
              "--target=node",
              "--format=cjs",
            ],
            { encoding: "utf8" },
          );
          const output = execFileSync(
            "ssh",
            [
              ...sshOptions.filter((arg) => arg !== "-q"),
              `${route.user}@${route.host}`,
              "node",
              "-",
              machine.id,
            ],
            {
              input: openCodeBundle,
              encoding: "utf8",
              timeout: 120_000,
              killSignal: "SIGKILL",
              maxBuffer: 16 * 1024 * 1024,
            },
          );
          const envelope = JSON.parse(output) as {
            exportVersion?: number;
            machine?: string;
            payload?: { providers?: unknown[] };
          };
          if (
            envelope.exportVersion !== 1 ||
            envelope.machine !== machine.id ||
            !Array.isArray(envelope.payload?.providers)
          ) {
            throw new Error(`Invalid OpenCode export from ${machine.id}`);
          }
          writeFileSync(temporaryPath, output);
        } else {
          if (!route.path)
            throw new Error(`Missing export path for ${machine.id}`);
          execFileSync(
            "scp",
            [
              ...sshOptions,
              `${route.user}@${route.host}:${route.path}`,
              temporaryPath,
            ],
            {
              stdio: "inherit",
              timeout: 120_000,
              killSignal: "SIGKILL",
            },
          );
        }
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
