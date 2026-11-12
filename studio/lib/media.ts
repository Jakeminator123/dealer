// Material (/material/): what is what per dealer. The register data/media-roles.json gives a role to a file, to one frame
// of a film or to a pattern of files; the lab server (tools/media-roles.ts, GET /api/media) adds what it finds on disk and
// which films of the bank start or end on each picture. This module is the shared, pure part: the shapes, the roles in
// the order of the chain, the check of the register, the key a job's first or last picture is matched by, and the rules
// for a picture added from the studio. No DOM, no network, no fs; tests in studio/tests/media.test.ts and
// tools/media-roles.test.ts.

// ── Roles ───────────────────────────────────────────────────────────────────
/** Jakob's chain, in its order: from the first picture of a new dealer to the films, then what stands beside it. */
export const ROLES = ["ingangsbild", "keystone", "ankare-1", "ankare-2.1", "ankare-2.2", "landning", "film", "referens", "prov", "arbetsmaterial"] as const;
export type Role = (typeof ROLES)[number];
export const isRole = (value: unknown): value is Role => typeof value === "string" && (ROLES as readonly string[]).includes(value);

export const ROLE_LABEL: Record<Role, string> = {
  ingangsbild: "Ingångsbild",
  keystone: "Keystone",
  "ankare-1": "Ankare 1",
  "ankare-2.1": "Ankare 2.1",
  "ankare-2.2": "Ankare 2.2",
  landning: "Landningar",
  film: "Filmer",
  referens: "Referenser",
  prov: "Prov",
  arbetsmaterial: "Övrigt",
};

/** One line under the role's name: what it is, in Jakob's words of 2026-11-12. */
export const ROLE_ABOUT: Record<Role, string> = {
  ingangsbild: "Vilken bild som helst som en ny dealer börjar från.",
  keystone: "Förlagan i hög upplösning, stående och sittande. Spelas aldrig.",
  "ankare-1": "Vila. Bankens ruta (1764 × 1174, grönt) som filmer börjar och slutar på.",
  "ankare-2.1": "Nyp vid skons fönster.",
  "ankare-2.2": "Handen över kortet i skons öppning.",
  landning: "Kortet på sin plats: givar slutar här, returer börjar här.",
  film: "Bankens filmer: ett steg mellan två ankare.",
  referens: "Färdiga filmer att jämföra mot.",
  prov: "Provmappar om dealern.",
  arbetsmaterial: "Annat som filmer börjar eller slutar på, och mellanbilder.",
};

/** A picture's state where it has one. Without one, nothing is said. */
export const STATES = ["gäller", "kandidat", "ersatt"] as const;
export type State = (typeof STATES)[number];
export const isState = (value: unknown): value is State => typeof value === "string" && (STATES as readonly string[]).includes(value);

// ── The register (data/media-roles.json) ────────────────────────────────────
export type Source = { from: string; when?: string };

/**
 * One thing with a role. path: the file (relative to the repo, "assets/…" or "output/…"; an absolute path names a file
 * outside the repo, which the lab never hands out). frame: one frame of the film at path (fps given, 30 when not).
 * pattern: many files ("assets/frames/*\/*.png"), with path as the one picture shown. proof: a proof folder's id.
 * still: for a whole film, the frame its tile shows. card: the card on the table ("P4.C1"). node: the graph's node the
 * picture stands for ("IDLE", "READY-B", "LAND(P4.C1)"). link: a page of the studio that plays it ("/?runda=v6-filmen").
 */
export type Entry = {
  id: string;
  role: Role;
  name: string;
  path?: string;
  frame?: number;
  fps?: number;
  still?: number;
  pattern?: string;
  proof?: string;
  card?: string;
  node?: string;
  state?: State;
  note?: string;
  source?: Source;
  link?: string;
};

/** One ledger of a dealer's work folder: how many films it made and how many were judged usable. */
export type Ledger = { file: string; films: number; usable: number; note: string };
/** Films that lie outside the bank, in a work folder: counted per ledger. */
export type Outside = { path: string; note: string; ledgers: Ledger[] };

export type Dealer = {
  name: string;
  /** What is missing in a role, said plainly; shown on the role's row whether or not it has entries. */
  missing?: Partial<Record<Role, string>>;
  /** Where the dealer's films come from: the bank's job file (ids with this prefix), or null when none are in the bank. */
  films?: { from: string | null; prefix?: string; note: string };
  outside?: Outside | null;
  entries: Entry[];
};

/** One source of measures and coordinates, and what it decides. */
export type Measure = { id: string; name: string; decides: string; file: string; link: string | null };

export type Register = { schemaVersion: 1; about?: string; dealers: Record<string, Dealer>; measures: Measure[] };

// ── Checks ──────────────────────────────────────────────────────────────────
export const ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
export const CARD = /^(?:P[1-7]\.C[12]|D\.C[1-3])$/;
const INSIDE = /^(?:assets|output)\/(?:[A-Za-z0-9][A-Za-z0-9._-]*\/)*[A-Za-z0-9][A-Za-z0-9._-]*$/;
const OUTSIDE = /^[A-Za-z]:\/(?:[^/\\]+\/)*[^/\\]+$/;

/** A file in the repo the lab may hand out ("assets/…", "output/…"); anything else is outside. */
export const isInside = (path: string): boolean => INSIDE.test(path) && !path.split("/").includes("..");
/** A picture or a film by its name. */
export const kindOfPath = (path: string): "image" | "video" | "folder" | "other" =>
  /\.(?:png|jpe?g)$/i.test(path) ? "image" : /\.mp4$/i.test(path) ? "video" : /\.[a-z0-9]+$/i.test(path) ? "other" : "folder";

/** Reads a register: the register itself when it holds, and every problem found, in words. */
export function validateRegister(value: unknown): { register: Register | null; errors: string[] } {
  const errors: string[] = [];
  const v = value as Partial<Register> | null;
  if (!v || typeof v !== "object") return { register: null, errors: ["Registret är inte ett objekt."] };
  if (v.schemaVersion !== 1) errors.push("schemaVersion ska vara 1.");
  if (!v.dealers || typeof v.dealers !== "object" || Array.isArray(v.dealers)) return { register: null, errors: [...errors, "dealers saknas."] };
  const ids = new Set<string>();
  for (const [dealerId, dealer] of Object.entries(v.dealers)) {
    const at = `dealers.${dealerId}`;
    if (!/^[a-z0-9]+$/.test(dealerId)) errors.push(`${at}: dealerns id får bara ha a–z och 0–9.`);
    if (!dealer || typeof dealer !== "object") {
      errors.push(`${at}: inte ett objekt.`);
      continue;
    }
    if (typeof dealer.name !== "string" || !dealer.name.trim()) errors.push(`${at}: namn saknas.`);
    for (const role of Object.keys(dealer.missing ?? {})) if (!isRole(role)) errors.push(`${at}.missing: okänd roll ${role}.`);
    if (!Array.isArray(dealer.entries)) {
      errors.push(`${at}: entries saknas.`);
      continue;
    }
    dealer.entries.forEach((e, i) => {
      const where = `${at}.entries[${i}]${e && typeof e.id === "string" ? ` (${e.id})` : ""}`;
      if (!e || typeof e !== "object") return void errors.push(`${where}: inte ett objekt.`);
      if (typeof e.id !== "string" || !ID.test(e.id)) errors.push(`${where}: id ska vara a–z, 0–9 och bindestreck.`);
      else if (ids.has(e.id)) errors.push(`${where}: id finns redan.`);
      else ids.add(e.id);
      if (!isRole(e.role)) errors.push(`${where}: okänd roll ${String(e.role)}.`);
      if (typeof e.name !== "string" || !e.name.trim() || e.name.length > 80) errors.push(`${where}: namnet saknas eller är för långt.`);
      if (e.path !== undefined && (typeof e.path !== "string" || (!isInside(e.path) && !OUTSIDE.test(e.path)))) errors.push(`${where}: sökvägen ska ligga under assets/ eller output/, eller vara en hel sökväg utanför repot.`);
      if (e.frame !== undefined && (!Number.isInteger(e.frame) || e.frame < 0 || !e.path || kindOfPath(e.path) !== "video")) errors.push(`${where}: en ruta ska vara ett heltal ≥ 0 i en film.`);
      if (e.fps !== undefined && (typeof e.fps !== "number" || !(e.fps > 0) || e.fps > 240)) errors.push(`${where}: fps ska vara ett tal över 0.`);
      if (e.still !== undefined && (!Number.isInteger(e.still) || e.still < 0 || e.frame !== undefined || !e.path || kindOfPath(e.path) !== "video")) errors.push(`${where}: still är rutan en hel film visas med.`);
      if (e.pattern !== undefined && (typeof e.pattern !== "string" || !isInside(e.pattern.replaceAll("*", "x")) || !e.path)) errors.push(`${where}: ett mönster ska ligga i repot och ha en bild (path) att visa.`);
      if (e.proof !== undefined && (typeof e.proof !== "string" || !ID.test(e.proof))) errors.push(`${where}: proof ska vara en provmapps namn.`);
      if (e.card !== undefined && (typeof e.card !== "string" || !CARD.test(e.card))) errors.push(`${where}: kortet skrivs som P4.C1 eller D.C2.`);
      if (e.state !== undefined && !isState(e.state)) errors.push(`${where}: tillståndet ska vara gäller, kandidat eller ersatt.`);
      if (e.note !== undefined && (typeof e.note !== "string" || e.note.length > 400)) errors.push(`${where}: noten är för lång.`);
      if (e.link !== undefined && (typeof e.link !== "string" || !e.link.startsWith("/"))) errors.push(`${where}: en länk börjar med /.`);
      if (e.source !== undefined && (typeof e.source !== "object" || typeof e.source?.from !== "string")) errors.push(`${where}: source ska ha from.`);
      if (!e.path && !e.proof && e.role !== "film") errors.push(`${where}: varken fil (path) eller prov (proof).`);
    });
    const out = dealer.outside;
    if (out && (typeof out.path !== "string" || !Array.isArray(out.ledgers))) errors.push(`${at}.outside: path och ledgers krävs.`);
  }
  if (!Array.isArray(v.measures)) errors.push("measures saknas.");
  return { register: errors.length ? null : (v as Register), errors };
}

// ── A job's first and last picture ──────────────────────────────────────────
/** A first or last picture as data/clip-jobs.json writes it: a file, or one frame of a film. */
export type JobPicture = { file?: { path?: unknown; sha256?: unknown }; frame?: { video?: unknown; index?: unknown } } | null | undefined;
export type JobLike = { id: string; from?: unknown; to?: unknown; first?: JobPicture; last?: JobPicture };

/** The key a picture is matched by: "file:<path>" or "frame:<film>#<index>". */
export function pictureKey(picture: JobPicture): string | null {
  if (picture?.file && typeof picture.file.path === "string") return `file:${picture.file.path}`;
  if (picture?.frame && typeof picture.frame.video === "string" && Number.isInteger(picture.frame.index)) return `frame:${picture.frame.video}#${picture.frame.index as number}`;
  return null;
}

/** The same key for an entry of the register (null for a proof folder or a pattern without a picture of its own). */
export function entryKey(entry: Pick<Entry, "path" | "frame" | "pattern">): string | null {
  if (!entry.path || entry.pattern) return null;
  return entry.frame !== undefined ? `frame:${entry.path}#${entry.frame}` : `file:${entry.path}`;
}

export type Use = { job: string; side: "first" | "last"; from: string; to: string };

/** For every picture the job file names: the jobs that start (first) or end (last) on it, in the file's order. */
export function usesOf(jobs: readonly JobLike[]): Map<string, Use[]> {
  const out = new Map<string, Use[]>();
  for (const job of jobs) {
    for (const side of ["first", "last"] as const) {
      const key = pictureKey(job[side]);
      if (!key) continue;
      const list = out.get(key) ?? [];
      list.push({ job: job.id, side, from: String(job.from ?? ""), to: String(job.to ?? "") });
      out.set(key, list);
    }
  }
  return out;
}

/** The pictures the job file names that no entry of the register gives a role. */
export function unassigned(register: Register, jobs: readonly JobLike[]): string[] {
  const known = new Set(Object.values(register.dealers).flatMap((d) => d.entries.map(entryKey).filter((k): k is string => !!k)));
  return [...usesOf(jobs).keys()].filter((key) => !known.has(key));
}

// ── The answer of GET /api/media ────────────────────────────────────────────
/** What the lab found for one entry: whether it is there, where the page may load it from, its size, and who uses it. */
export type Found = {
  exists: boolean;
  /** The address the page loads the picture or film from (relative to the lab's root); null outside the repo or when missing. */
  served: string | null;
  inside: boolean;
  width: number | null;
  height: number | null;
  bytes: number | null;
  /** For a film or a frame of one: its frames per second and length in frames, as read from the file. */
  fps: number | null;
  frames: number | null;
  /** For a pattern: how many files match. */
  count: number | null;
  /** The jobs of the bank that start or end on this picture. edge: the graph's edge id, for a link to the map. */
  usedBy: (Use & { edge: string })[];
};
/** An entry with what was found; fps is the film's own as read from the file, else the register's. */
export type EntryAnswer = Omit<Entry, "fps"> & Found;
export type DealerAnswer = Omit<Dealer, "entries"> & { id: string; entries: EntryAnswer[]; bank: { jobs: number; derived: number; edits: number } };
export type MediaAnswer = {
  schemaVersion: 1;
  readable: boolean;
  /** '"<sha256>"' of the register as read. */
  revision: string | null;
  problems: string[];
  dealers: DealerAnswer[];
  measures: Measure[];
  /** Pictures the job file names that the register gives no role (should be none). */
  unassigned: string[];
};

// ── Adding a picture ────────────────────────────────────────────────────────
/** The roles a picture can be added in from the studio. */
export const UPLOAD_ROLES = ["ingangsbild", "keystone", "ankare-1", "ankare-2.1", "ankare-2.2"] as const satisfies readonly Role[];
export type UploadRole = (typeof UPLOAD_ROLES)[number];
export const isUploadRole = (value: unknown): value is UploadRole => typeof value === "string" && (UPLOAD_ROLES as readonly string[]).includes(value);
/** The bank's frame: an anchor should be exactly this size. */
export const ANCHOR_SIZE = { width: 1764, height: 1174 } as const;
/** The largest picture the lab takes: a 4K PNG is about 17 MB; room for 6000 × 4000. */
export const UPLOAD_LIMIT = 40 * 1024 * 1024;
export const NAME_LIMIT = 40;
export const TITLE_LIMIT = 60;
export const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export type ImageType = "png" | "jpeg";

/** A folder name from what was typed: "Sittande B, ljusare" → "sittande-b-ljusare". Å, ä, ö become a, a, o. */
export function slugName(text: string): string {
  return text
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, NAME_LIMIT)
    .replace(/-+$/g, "");
}

/** The folder name for a dealer's picture: what was typed, without the dealer's own name in front ("paow-vila" → "vila"). */
export function folderName(title: string, dealer: string): string {
  const slug = slugName(title);
  return slug.startsWith(`${dealer}-`) ? slug.slice(dealer.length + 1) : slug === dealer ? "" : slug;
}

/** Where an added picture is kept: a keystone or an ingångsbild under assets/keystones/, an anchor under assets/anchors/. */
export function uploadTarget(dealer: string, role: UploadRole, name: string, type: ImageType): { id: string; dir: string; file: string; path: string } {
  const id = `${dealer}-${name}`;
  const dir = role === "ingangsbild" || role === "keystone" ? `assets/keystones/${id}` : `assets/anchors/${id}`;
  const base = role === "ingangsbild" ? "ingangsbild" : role === "keystone" ? "keystone" : "anchor";
  const file = `${base}.${type === "png" ? "png" : "jpg"}`;
  return { id, dir, file, path: `${dir}/${file}` };
}

/** What the page warns about before sending: an anchor that is not the bank's frame. */
export function sizeWarning(role: Role, width: number, height: number): string | null {
  if (!role.startsWith("ankare")) return null;
  if (width === ANCHOR_SIZE.width && height === ANCHOR_SIZE.height) return null;
  return `Ett ankare ska vara ${ANCHOR_SIZE.width} × ${ANCHOR_SIZE.height} (bankens ruta). Den här är ${width} × ${height}.`;
}

// ── The chain at a glance ───────────────────────────────────────────────────
/** The roles of the chain itself, from the first picture to the films. */
export const CHAIN: readonly Role[] = ["ingangsbild", "keystone", "ankare-1", "ankare-2.1", "ankare-2.2", "landning", "film"];
export type RoleStatus = "gäller" | "finns" | "kandidat" | "saknas";

/**
 * How a role stands for a dealer: something that holds (gäller), something without a state (finns), only candidates, or
 * nothing usable (saknas: nothing there, only replaced pictures, or the register says what is missing and nothing holds).
 * Films count the bank's takes: none in the bank is saknas.
 */
export function roleStatus(dealer: { missing?: Partial<Record<Role, string>>; entries: readonly Pick<Entry, "role" | "state">[] }, role: Role, bankTakes = 0): RoleStatus {
  if (role === "film") return bankTakes > 0 ? "finns" : "saknas";
  const list = dealer.entries.filter((e) => e.role === role);
  if (list.some((e) => e.state === "gäller")) return "gäller";
  if (list.some((e) => e.state === "kandidat")) return "kandidat";
  if (dealer.missing?.[role]) return "saknas";
  return list.some((e) => e.state !== "ersatt") ? "finns" : "saknas";
}

// ── Words ───────────────────────────────────────────────────────────────────
/** "används av 1 film" / "används av 15 filmer" / "används inte av någon film". */
export const usedWords = (n: number): string => (n === 0 ? "används inte av någon film" : `används av ${n} ${n === 1 ? "film" : "filmer"}`);
/** "1764 × 1174". */
export const sizeWords = (w: number | null, h: number | null): string | null => (w && h ? `${w} × ${h}` : null);
