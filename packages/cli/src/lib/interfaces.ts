export type ProviderId =
  | "codex"
  | "nanoclaw"
  | "omp"
  | "opencode"
  | "claude"
  | "hermes"
  | "droid"
  | "pi"
  | "agy"
  | "gemini"
  | "cursor"
  | "helios";

export const providerIds: ProviderId[] = [
  "codex",
  "nanoclaw",
  "omp",
  "opencode",
  "claude",
  "hermes",
  "droid",
  "pi",
  "agy",
  "gemini",
  "cursor",
  "helios",
];

export const providerStatusLabel: Record<ProviderId, string> = {
  codex: "Codex",
  nanoclaw: "NanoClaw",
  omp: "OMP",
  opencode: "Open Code",
  claude: "Claude Code",
  hermes: "Hermes Agent",
  droid: "Droid",
  pi: "Pi Coding Agent",
  agy: "Antigravity CLI",
  gemini: "Gemini CLI (legacy)",
  cursor: "Cursor",
  helios: "Helios",
};
