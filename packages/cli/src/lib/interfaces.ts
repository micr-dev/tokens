export type ProviderId =
  | "claude"
  | "codex"
  | "agy"
  | "gemini"
  | "cursor"
  | "opencode"
  | "pi"
  | "droid"
  | "hermes"
  | "helios";

export const providerIds: ProviderId[] = [
  "claude",
  "codex",
  "agy",
  "gemini",
  "cursor",
  "opencode",
  "pi",
  "droid",
  "hermes",
  "helios",
];

export const providerStatusLabel: Record<ProviderId, string> = {
  claude: "Claude code",
  codex: "Codex",
  agy: "Antigravity CLI",
  gemini: "Gemini CLI (legacy)",
  cursor: "Cursor",
  opencode: "Open Code",
  pi: "Pi Coding Agent",
  droid: "Droid",
  hermes: "Hermes Agent",
  helios: "Helios",
};
