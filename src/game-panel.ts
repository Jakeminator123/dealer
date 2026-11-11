// The console's two menus: Bord (which room the table stands in, and who deals) and Musik (music, the room's sound, the
// table's sound). Each is a button in the console that opens a panel above it, as Scout's console opens Utseende and Musik;
// an open panel closes when another opens, on a press outside it, on Escape, and when the page says a round has begun.
// The page owns what the choices do; this file only shows them and says what was pressed.
export type RoomChoice = {id: string; label: string; note: string; thumb: string};
export type DealerChoice = {id: string; label: string; note: string; thumb: string};
export type TrackChoice = {id: string; label: string; note: string};
export type PanelState = {
  room: string; dealer: string; canChange: boolean; changing: boolean; // canChange: between rounds, when room and dealer may be changed
  tracks: TrackChoice[]; track: string | null; music: number; table: boolean; ambience: boolean; // music: its level 0-1; table: chips and cards are heard; ambience: the room is heard
};
export type PanelHandlers = {room(id: string): void; dealer(id: string): void; music(track: string | null): void; level(music: number): void; table(on: boolean): void; ambience(on: boolean): void; open?(): void};

/** Which room card is marked, and whether a card can be pressed: the room showing is marked and cannot be chosen again; nothing can be chosen during a round or a change. */
export function roomCards(rooms: RoomChoice[], state: Pick<PanelState, 'room' | 'canChange' | 'changing'>): {id: string; chosen: boolean; disabled: boolean}[] {
  return rooms.map(r => ({id: r.id, chosen: r.id === state.room, disabled: r.id === state.room || !state.canChange || state.changing}));
}
/** What the dealer row says under its button. */
export function dealerNote(state: Pick<PanelState, 'canChange' | 'changing'>): string {
  return state.changing ? 'Dealern byts …' : state.canChange ? 'Hon reser sig och går, och en dealer kommer in och sätter sig.' : 'Dealern kan bytas mellan rundorna.';
}

const ICON = {
  table: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9a9 9 0 0 0 18 0Z"/><path d="M3 9h18"/><circle cx="12" cy="5" r="2"/></svg>',
  music: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>',
};

export function mountPanel(bar: HTMLElement, rooms: RoomChoice[], dealers: DealerChoice[], on: PanelHandlers) {
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] => { const n = document.createElement(tag); if (className) n.className = className; if (text) n.textContent = text; return n; };
  const menu = el('div', 'gp-menu'), panels = el('div', 'gp-panels');
  const opener = (icon: string, label: string) => { const b = el('button', 'gp-open'); b.type = 'button'; b.innerHTML = icon; b.append(el('span', '', label)); b.setAttribute('aria-expanded', 'false'); menu.append(b); return b; };
  const tableBtn = opener(ICON.table, 'Bord'), musicBtn = opener(ICON.music, 'Musik');
  const tablePanel = el('section', 'gp-panel'), musicPanel = el('section', 'gp-panel'); tablePanel.hidden = musicPanel.hidden = true;
  panels.append(tablePanel, musicPanel); bar.prepend(menu); bar.append(panels);
  let state: PanelState = {room: '', dealer: '', canChange: true, changing: false, tracks: [], track: null, music: 0.6, table: false, ambience: false};

  // ── Bord: rooms, then dealers ──
  const roomGrid = el('div', 'gp-rooms'), roomNodes = new Map<string, HTMLButtonElement>();
  for (const room of rooms) { const card = el('button', 'gp-room'); card.type = 'button'; card.title = room.note;
    const picture = el('span', 'gp-thumb'); picture.style.backgroundImage = `url("${room.thumb}")`; card.append(picture, el('span', 'gp-name', room.label), el('span', 'gp-mark', 'Vald'));
    card.addEventListener('click', () => on.room(room.id)); roomGrid.append(card); roomNodes.set(room.id, card); }
  const dealerRow = el('div', 'gp-dealers'), change = el('button', 'gp-change', 'Byt dealer'), changeNote = el('p', 'gp-note'); change.type = 'button';
  for (const dealer of dealers) { const card = el('div', 'gp-dealer'), face = el('span', 'gp-face'); face.style.backgroundImage = `url("${dealer.thumb}")`;
    const text = el('span', 'gp-who'); text.append(el('b', '', dealer.label), el('small', '', dealer.note)); card.append(face, text); dealerRow.append(card); }
  change.addEventListener('click', () => on.dealer(state.dealer)); dealerRow.append(change);
  tablePanel.append(el('h3', '', 'Miljö'), roomGrid, el('h3', '', 'Dealer'), dealerRow, changeNote);

  // ── Musik: tracks, level, and the two other sounds ──
  const trackList = el('div', 'gp-tracks'), level = el('input'), levelRow = el('label', 'gp-level'), empty = el('p', 'gp-note', 'Musiken läses in …');
  level.type = 'range'; level.min = '0'; level.max = '100'; level.step = '1'; level.addEventListener('input', () => on.level(Number(level.value) / 100)); levelRow.append(el('span', '', 'Volym'), level);
  const toggle = (label: string, note: string, press: (next: boolean) => void) => { const b = el('button', 'gp-toggle'); b.type = 'button'; b.setAttribute('role', 'switch'); const text = el('span'); text.append(el('b', '', label), el('small', '', note)); b.append(text, el('i'));
    b.addEventListener('click', () => press(b.getAttribute('aria-checked') !== 'true')); return b; };
  const tableSound = toggle('Bordets ljud', 'Marker som klirrar och kort som landar', next => on.table(next)), roomSound = toggle('Rummets ljud', 'Sorl och ljud från miljön du har valt', next => on.ambience(next));
  musicPanel.append(el('h3', '', 'Musik'), trackList, empty, levelRow, el('h3', '', 'Ljud'), tableSound, roomSound);
  let shownTracks = '';
  function tracks() {
    const key = state.tracks.map(t => t.id).join(); if (key === shownTracks) return; shownTracks = key; empty.hidden = state.tracks.length > 0;
    const quiet = el('button', 'gp-track'); quiet.type = 'button'; quiet.dataset.track = ''; quiet.append(el('b', '', 'Tyst'), el('small', '', 'Ingen musik')); quiet.addEventListener('click', () => on.music(null));
    trackList.replaceChildren(quiet, ...state.tracks.map(t => { const b = el('button', 'gp-track'); b.type = 'button'; b.dataset.track = t.id; b.append(el('b', '', t.label), el('small', '', t.note)); b.addEventListener('click', () => on.music(t.id)); return b; }));
  }

  // ── open and close ──
  const pairs: [HTMLButtonElement, HTMLElement][] = [[tableBtn, tablePanel], [musicBtn, musicPanel]];
  function show(which: HTMLElement | null) {
    for (const [button, panel] of pairs) { const open = panel === which; panel.hidden = !open; button.setAttribute('aria-expanded', String(open));
      if (open) panel.style.left = `${Math.max(12, button.getBoundingClientRect().left - bar.getBoundingClientRect().left)}px`; }
    if (which) on.open?.();
  }
  for (const [button, panel] of pairs) button.addEventListener('click', () => show(panel.hidden ? panel : null));
  document.addEventListener('pointerdown', event => { const at = event.target as Node; if (!menu.contains(at) && !panels.contains(at)) show(null); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') show(null); });

  function paint() {
    for (const card of roomCards(rooms, state)) { const node = roomNodes.get(card.id)!; node.classList.toggle('chosen', card.chosen); node.disabled = card.disabled; }
    change.disabled = !state.canChange || state.changing; changeNote.textContent = dealerNote(state);
    tracks(); for (const b of trackList.children) (b as HTMLElement).setAttribute('aria-pressed', String(((b as HTMLElement).dataset.track || null) === state.track));
    if (document.activeElement !== level) level.value = String(Math.round(state.music * 100));
    tableSound.setAttribute('aria-checked', String(state.table)); roomSound.setAttribute('aria-checked', String(state.ambience));
    musicBtn.classList.toggle('on', state.track !== null || state.table || state.ambience);
  }
  paint();
  return {set(next: Partial<PanelState>) { state = {...state, ...next}; paint(); }, close() { show(null); }, get state() { return state; }};
}
