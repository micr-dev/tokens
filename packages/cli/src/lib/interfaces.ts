export type ProviderId =
  | "claude"
  | "codex"
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
  gemini: "Gemini CLI",
  cursor: "Cursor",
  opencode: "Open Code",
  pi: "Pi Coding Agent",
  droid: "Droid",
  hermes: "Hermes Agent",
  helios: "Helios",
};
