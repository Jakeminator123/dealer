// Material: what is what per dealer (MaterialView reads the address), its rows (Rows), a picture's tile (Tile), the
// full-window viewer with facts (MaterialViewer), the add dialog (AddDialog), the calls to the lab (client) and the films
// in numbers per seat (films).
export { MaterialView } from "./MaterialView";
export { MaterialViewer, mapHref } from "./MaterialViewer";
export { AddDialog } from "./AddDialog";
export { Tile, StateChip, coverOfEntry, tileWidth, filmLine } from "./Tile";
export { ChainStrip, OrderFrom, RoleRow, FilmsRow, ProofRow, Measures } from "./Rows";
export { seatGroups, takeCount } from "./films.ts";
export { getMedia, addPicture, setPictureState } from "./client.ts";
export { StateDecision } from "./StateDecision";
