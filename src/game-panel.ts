// The console's menus: three buttons at the left of the console, Miljö (which room the table stands in), Dealer (who deals)
// and Musik (music, the room's sound, the table's sound). Each button shows what is chosen now: the room's picture and name,
// the dealer's face and name, and the track that plays. Miljö and Dealer open the same panel, on their own tab of it; Musik
// opens its own. A panel opens above the console, as Scout's console opens Utseende and Musik; an open panel closes when the
// other opens, on a press outside it, on Escape, and when the page says a round has begun.
// The page owns what the choices do; this file only shows them and says what was pressed.
export type RoomChoice = {id: string; label: string; note: string; thumb: string};
export type DealerChoice = {id: string; label: string; note: string; thumb: string};
export type TrackChoice = {id: string; label: string; note: string};
export type PanelState = {
  room: string; dealer: string; canChange: boolean; changing: boolean; // canChange: between rounds, when room and dealer may be changed
  tracks: TrackChoice[]; track: string | null; music: number; table: boolean; ambience: boolean; // music: its level 0-1; table: chips and cards are heard; ambience: the room is heard
  cards: boolean; // the drawn cards are on (the scene's key cards); off: the film's own coloured cards show
};
export type PanelHandlers = {room(id: string): void; dealer(id: string): void; music(track: string | null): void; level(music: number): void; table(on: boolean): void; ambience(on: boolean): void; cards?(on: boolean): void; open?(): void};
type Change = Pick<PanelState, 'canChange' | 'changing'>;

/** Which room card is marked, and whether a card can be pressed: the room showing is marked and cannot be chosen again; nothing can be chosen during a round or a change. */
export function roomCards(rooms: RoomChoice[], state: Pick<PanelState, 'room' | 'canChange' | 'changing'>): {id: string; chosen: boolean; disabled: boolean}[] {
  return rooms.map(r => ({id: r.id, chosen: r.id === state.room, disabled: r.id === state.room || !state.canChange || state.changing}));
}
/** What stands under the rooms. */
export function roomNote(state: Change): string {
  return state.changing ? 'Dealern byts …' : state.canChange ? 'Ett skimmer går över hela bakgrunden när rummet byts.' : 'Miljön kan bytas mellan rundorna.';
}
/** What stands under the dealers. `count`: how many dealers there are to choose between; with one, she is the one who comes back. */
export function dealerNote(state: Change, count = 2): string {
  return state.changing ? 'Dealern byts …' : !state.canChange ? 'Dealern kan bytas mellan rundorna.'
    : count < 2 ? 'Hon reser sig och går, bordet står tomt en stund, och en dealer kommer in och sätter sig. Än finns bara en dealer, så det är hon som kommer tillbaka.'
    : 'Hon reser sig och går, bordet står tomt en stund, och nästa dealer kommer in och sätter sig.';
}
/** What the Musik button says: the track that plays, else that sounds are on, else that it is quiet. */
export function musicLabel(state: Pick<PanelState, 'tracks' | 'track' | 'table' | 'ambience'>): string {
  return state.tracks.find(t => t.id === state.track)?.label ?? (state.table || state.ambience ? 'Ljud på' : 'Tyst');
}

const svg = (body: string, size = 16) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICON = {
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 12),
  play: svg('<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>'),
  quiet: svg('<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>'),
  speaker: svg('<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>'),
  swap: svg('<path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5"/>'),
  chevron: svg('<path d="M7 14.5l5-5 5 5"/>', 14),
};
const EQ = '<i></i><i></i><i></i><i></i>'; // the four bars that move while music plays

export function mountPanel(bar: HTMLElement, rooms: RoomChoice[], dealers: DealerChoice[], on: PanelHandlers) {
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] => { const n = document.createElement(tag); if (className) n.className = className; if (text) n.textContent = text; return n; };
  const html = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, inner: string): HTMLElementTagNameMap[K] => { const n = el(tag, className); n.innerHTML = inner; return n; }; // only for the fixed icons above
  const picture = (node: HTMLElement, url: string | undefined) => { node.style.backgroundImage = url ? `url("${url}")` : ''; };
  const menu = el('div', 'gp-menu'), panels = el('div', 'gp-panels');
  // A button of the console: a small picture, a caption and what is chosen now.
  const opener = (caption: string, shape: string) => { const b = el('button', 'gp-open'), pic = el('span', `gp-pic ${shape}`), now = el('b'), label = el('span', 'gp-label');
    b.type = 'button'; b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-haspopup', 'dialog'); label.append(el('small', '', caption), now); b.append(pic, label, html('span', 'gp-chev', ICON.chevron)); menu.append(b); return {b, pic, now}; };
  const roomBtn = opener('Miljö', 'room'), dealerBtn = opener('Dealer', 'face'), musicBtn = opener('Musik', 'eq'); musicBtn.pic.innerHTML = EQ;
  const tablePanel = el('section', 'gp-panel gp-table'), musicPanel = el('section', 'gp-panel gp-music'); tablePanel.hidden = musicPanel.hidden = true;
  tablePanel.setAttribute('role', 'dialog'); tablePanel.setAttribute('aria-label', 'Miljö och dealer'); musicPanel.setAttribute('role', 'dialog'); musicPanel.setAttribute('aria-label', 'Musik och ljud');
  panels.append(tablePanel, musicPanel); bar.prepend(menu); bar.append(panels);
  let state: PanelState = {room: '', dealer: '', canChange: true, changing: false, tracks: [], track: null, music: 0.6, table: false, ambience: false, cards: true};

  // ── Miljö and Dealer: one panel, two tabs ──
  const tabs = el('div', 'gp-tabs'), roomTab = el('button', 'gp-tab', 'Miljö'), dealerTab = el('button', 'gp-tab', 'Dealer'), roomPage = el('div', 'gp-page'), dealerPage = el('div', 'gp-page');
  tabs.setAttribute('role', 'tablist'); for (const t of [roomTab, dealerTab]) { t.type = 'button'; t.setAttribute('role', 'tab'); } tabs.append(roomTab, dealerTab);
  const tab = (which: 'room' | 'dealer') => { roomTab.setAttribute('aria-selected', String(which === 'room')); dealerTab.setAttribute('aria-selected', String(which === 'dealer')); roomPage.hidden = which !== 'room'; dealerPage.hidden = which !== 'dealer'; };
  roomTab.addEventListener('click', () => { tab('room'); mark(); }); dealerTab.addEventListener('click', () => { tab('dealer'); mark(); });

  const roomGrid = el('div', 'gp-rooms'), roomNodes = new Map<string, HTMLButtonElement>(), roomHint = el('p', 'gp-note');
  for (const room of rooms) { const card = el('button', 'gp-room'), thumb = el('span', 'gp-thumb'); card.type = 'button'; picture(thumb, room.thumb);
    thumb.append(html('span', 'gp-mark', `${ICON.check}Vald`), el('span', 'gp-name', room.label)); card.append(thumb, el('small', 'gp-sub', room.note));
    card.addEventListener('click', () => on.room(room.id)); roomGrid.append(card); roomNodes.set(room.id, card); }
  roomPage.append(roomGrid, roomHint);

  // Dealers: the one at the table is marked; another is pressed to send her in. The button changes to the next in the list
  // (with one dealer: she leaves and comes back).
  const dealerList = el('div', 'gp-dealers'), dealerNodes = new Map<string, HTMLButtonElement>(), change = html('button', 'gp-change', `${ICON.swap}<span>Byt dealer</span>`), changeNote = el('p', 'gp-note');
  for (const dealer of dealers) { const card = el('button', 'gp-dealer'), face = el('span', 'gp-face'), text = el('span', 'gp-who'); card.type = 'button'; picture(face, dealer.thumb);
    text.append(el('b', '', dealer.label), el('small', '', dealer.note)); card.append(face, text, el('span', 'gp-seat', 'Vid bordet'));
    card.addEventListener('click', () => on.dealer(dealer.id)); dealerList.append(card); dealerNodes.set(dealer.id, card); }
  const steps = el('ol', 'gp-steps'); for (const step of ['Hon reser sig och går', 'Bordet står tomt', 'En dealer kommer in']) steps.append(el('li', '', step));
  change.type = 'button'; change.addEventListener('click', () => { const at = dealers.findIndex(d => d.id === state.dealer); on.dealer(dealers[(at + 1) % Math.max(1, dealers.length)]?.id ?? state.dealer); });
  dealerPage.append(dealerList, steps, change, changeNote);
  tablePanel.append(tabs, roomPage, dealerPage); tab('room');

  // ── Musik: what plays now, the tracks, the level, and the two other sounds ──
  const nowEq = html('span', 'gp-pic eq big', EQ), nowName = el('b'), nowText = el('span', 'gp-label'), nowRow = el('div', 'gp-now'); nowText.append(el('small', '', 'Spelas nu'), nowName); nowRow.append(nowEq, nowText);
  const trackList = el('div', 'gp-tracks'), empty = el('p', 'gp-note', 'Musiken läses in …');
  const level = el('input'), levelValue = el('output'), levelRow = el('label', 'gp-level');
  level.type = 'range'; level.min = '0'; level.max = '100'; level.step = '1'; level.setAttribute('aria-label', 'Musikens volym'); level.addEventListener('input', () => on.level(Number(level.value) / 100));
  levelRow.append(html('span', 'gp-ico', ICON.speaker), level, levelValue);
  const toggle = (label: string, note: string, press: (next: boolean) => void) => { const b = el('button', 'gp-toggle'); b.type = 'button'; b.setAttribute('role', 'switch'); const text = el('span'); text.append(el('b', '', label), el('small', '', note)); b.append(text, el('i'));
    b.addEventListener('click', () => press(b.getAttribute('aria-checked') !== 'true')); return b; };
  const tableSound = toggle('Bordets ljud', 'Marker som klirrar och kort som landar', next => on.table(next)), roomSound = toggle('Rummets ljud', 'Sorl och ljud från miljön du har valt', next => on.ambience(next));
  // Under the rooms: the drawn cards on or off, the one choice about cards in the game (Jakob 2026-11-13: "Jag vill bara att det
  // ska bli en linje"; off shows the film's own coloured cards). How the card in her hand is shown is not a choice here.
  const cardsSwitch = toggle('Ritade kort', 'Spelkort ritas över filmens färgade kort; av visar filmens egna', next => on.cards?.(next)); roomPage.append(cardsSwitch);
  musicPanel.append(nowRow, el('h3', '', 'Musik'), trackList, empty, levelRow, el('h3', '', 'Ljud'), tableSound, roomSound);
  let shownTracks = '';
  const trackButton = (id: string | null, label: string, note: string, glyph: string) => { const b = el('button', 'gp-track'), text = el('span', 'gp-who'); b.type = 'button'; b.dataset.track = id ?? ''; b.title = note;
    text.append(el('b', '', label), el('small', '', note)); b.append(html('span', 'gp-glyph', `${glyph}<span class="gp-pic eq">${EQ}</span>`), text); b.addEventListener('click', () => on.music(id)); return b; };
  function tracks() {
    const key = state.tracks.map(t => t.id).join(); if (key === shownTracks) return; shownTracks = key; empty.hidden = state.tracks.length > 0;
    trackList.replaceChildren(trackButton(null, 'Tyst', 'Ingen musik', ICON.quiet), ...state.tracks.map(t => trackButton(t.id, t.label, t.note, ICON.play)));
  }

  // ── open and close ──
  type Menu = 'room' | 'dealer' | 'music';
  const openers: Record<Menu, HTMLButtonElement> = {room: roomBtn.b, dealer: dealerBtn.b, music: musicBtn.b};
  let open: Menu | null = null; const stage = bar.closest<HTMLElement>('#stage');
  // The buttons say which menu is open; Miljö and Dealer share a panel, so the open tab decides which of the two is marked.
  function mark() { const shown: Menu | null = open === null ? null : open === 'music' ? 'music' : roomPage.hidden ? 'dealer' : 'room'; for (const key of Object.keys(openers) as Menu[]) openers[key].setAttribute('aria-expanded', String(key === shown)); }
  function show(which: Menu | null) {
    open = which; tablePanel.hidden = which !== 'room' && which !== 'dealer'; musicPanel.hidden = which !== 'music';
    if (which === 'room' || which === 'dealer') tab(which);
    const panel = which === 'music' ? musicPanel : which ? tablePanel : null;
    // The panel stands over its button, is moved in where it would otherwise leave the console, and is no taller than the
    // room above the console (it scrolls inside). The stage is told a menu is open, so the chat's button can step aside.
    stage?.classList.toggle('menu-open', which !== null);
    if (panel && which) { const host = bar.getBoundingClientRect(), left = openers[which === 'dealer' ? 'room' : which].getBoundingClientRect().left - host.left; panel.style.left = `${Math.max(12, Math.min(left, host.width - panel.offsetWidth - 12))}px`;
      panel.style.maxHeight = `${Math.max(180, host.top - (stage?.getBoundingClientRect().top ?? 0) - 26)}px`; }
    mark(); if (which) on.open?.();
  }
  for (const key of Object.keys(openers) as Menu[]) openers[key].addEventListener('click', () => show(openers[key].getAttribute('aria-expanded') === 'true' ? null : key));
  document.addEventListener('pointerdown', event => { const at = event.target as Node; if (open && !menu.contains(at) && !panels.contains(at)) show(null); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && open) { const from = openers[open]; show(null); from.focus(); } });

  function paint() {
    const room = rooms.find(r => r.id === state.room), dealer = dealers.find(d => d.id === state.dealer), locked = !state.canChange || state.changing;
    picture(roomBtn.pic, room?.thumb); roomBtn.now.textContent = room?.label ?? '–'; picture(dealerBtn.pic, dealer?.thumb); dealerBtn.now.textContent = dealer?.label ?? '–';
    for (const card of roomCards(rooms, state)) { const node = roomNodes.get(card.id)!; node.classList.toggle('chosen', card.chosen); node.disabled = card.disabled; node.setAttribute('aria-pressed', String(card.chosen)); }
    roomHint.textContent = roomNote(state);
    for (const [id, node] of dealerNodes) { node.classList.toggle('chosen', id === state.dealer); node.disabled = id === state.dealer || locked; }
    change.disabled = locked; change.classList.toggle('busy', state.changing); steps.classList.toggle('busy', state.changing); changeNote.textContent = dealerNote(state, dealers.length);
    tracks(); for (const b of trackList.children) (b as HTMLElement).setAttribute('aria-pressed', String(((b as HTMLElement).dataset.track || null) === state.track));
    const playing = state.tracks.some(t => t.id === state.track), name = musicLabel(state);
    musicBtn.now.textContent = name; musicBtn.b.classList.toggle('playing', playing); nowRow.classList.toggle('playing', playing); nowName.textContent = playing ? name : 'Ingen musik';
    if (document.activeElement !== level) level.value = String(Math.round(state.music * 100)); levelValue.textContent = String(Math.round(state.music * 100));
    level.style.setProperty('--at', `${Math.round(state.music * 100)}%`);
    tableSound.setAttribute('aria-checked', String(state.table)); roomSound.setAttribute('aria-checked', String(state.ambience)); cardsSwitch.setAttribute('aria-checked', String(state.cards));
  }
  paint();
  return {set(next: Partial<PanelState>) { state = {...state, ...next}; paint(); }, close() { show(null); }, get state() { return state; }, get open() { return open; }};
}
