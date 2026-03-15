export type ProviderId =
  | "claude"
  | "codex"
  | "cursor"
  | "opencode"
  | "pi"
  | "hermes"
  | "helios";

export const providerIds: ProviderId[] = [
  "claude",
  "codex",
  "cursor",
  "opencode",
  "pi",
  "hermes",
  "helios",
];

export const providerStatusLabel: Record<ProviderId, string> = {
  claude: "Claude code",
  codex: "Codex",
  cursor: "Cursor",
  opencode: "Open Code",
  pi: "Pi Coding Agent",
  hermes: "Hermes Agent",
  helios: "Helios",
};
