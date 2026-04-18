/**
 * Identifier for a locally-installed AI coding tool provider.
 * Excludes aggregated pseudo-providers ("all", "t3") which are not backed by local data.
 */
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

/** Ordered list of all supported provider identifiers. */
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

/** Human-readable display names for each provider, used in CLI output. */
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
