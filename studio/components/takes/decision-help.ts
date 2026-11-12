// The quiet line of help under the decision buttons (Jakob 2026-11-12: "unsure what the difference is between Variant and
// Godkänd"): what each choice does to what is played, in the order of the buttons, and for the rest step (A1 → A1) how the
// calm loop and the gestures share it. Words as the graph decides (src/clip-graph.ts rank, pickIdle). Pure; tests in
// studio/tests/decision-help.test.ts.

export type HelpPart = { word: string; text: string };

export const DECISION_HELP: readonly HelpPart[] = [
  { word: "Primär", text: "spelas först i sitt steg" },
  { word: "Godkänd", text: "kan bli filmen som spelas" },
  { word: "Variant", text: "godkänd som omväxling, spelas bara ibland eller när den väljs" },
  { word: "Underkänd", text: "spelas aldrig" },
];

/** The rest step (A1 → A1): the calm loop is the base, the gestures are variants picked at random between its turns. */
export const REST_HELP = "I vilan är den lugna loopen grunden; gester är varianter som slumpas in mellan.";

/** The help for a take of this step (its id as the graph writes it, "IDLE>IDLE" for the rest). */
export function decisionHelp(edge: string): { parts: readonly HelpPart[]; rest: string | null } {
  return { parts: DECISION_HELP, rest: edge === "IDLE>IDLE" ? REST_HELP : null };
}
