// The marks on the blue side of the doll's card: Kortplan's own (src/placement-model.ts CARD_MARK and CARD_RGB), in card widths
// and as colours. Jakob 2026-11-24: the doll's card and Kortplan's are one kind of card, "så att det inte blir två olika typer
// av kort": a yellow side that carries nothing, and a blue side with a small pink cross in its middle and a small red circle
// in one corner. Written out here because the 3D page is served only this folder and the table's lens;
// dealer3d/tests/card-marks.test.ts holds the numbers equal to Kortplan's.
export const CARD_MARKS = {cross: {arm: 0.17, stroke: 0.07, colour: 0xff78c8}, dot: {radius: 0.075, inset: 0.2, colour: 0xe11e23}} as const;
