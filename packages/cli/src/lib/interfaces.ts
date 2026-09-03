export type ProviderId =
  | "codex"
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
