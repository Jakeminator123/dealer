// The table chat as a dummy (game.html?chatt=1): the look and the feel of a chat beside the table, with nothing behind
// it. Nothing is sent anywhere and nobody answers for real: the dealer's lines come from what happens in the round, two
// made-up players say something now and then, and what the player writes is answered from a short list. It is here so that
// the controls can be judged with a chat in the picture; a real chat is Scout's.
//
// The first half is the dummy's script and has no page in it (tools/game-view.test.ts runs it under Node).
export type ChatLine = {who: 'dealer' | 'player' | 'other' | 'note'; name: string; text: string};
export const DEALER_NAME = 'Pamela';
// What the dealer says when the round enters a phase (the overlay's phases); a phase without a line is passed in silence.
export const DEALER_LINES: Record<string, string[]> = {
  BETTING: ['Lägg era insatser.', 'Varsågoda, insatser.', 'Ny runda. Lägg era insatser.'],
  DEALING: ['Inga fler insatser.', 'Tack, inga fler insatser.'],
  INSURANCE: ['Försäkring?'],
  DEALER: ['Dealern spelar.'],
};
const OTHERS: [string, string][] = [['Alex', 'Lycka till alla!'], ['Sam', 'Snyggt bord.'], ['Alex', 'Kom igen nu …'], ['Sam', 'Den satt.'], ['Alex', 'Bra spelat!'], ['Sam', 'En runda till.']];
const REPLIES = ['Tack! Lycka till.', 'Roligt att du är här.', 'Det ordnar vi.', 'Lycka till med nästa hand.'];
/** The dealer's line for a phase, the n:th time it is entered; null when she says nothing there. */
export function dealerLine(phase: string, n: number): string | null { const lines = DEALER_LINES[phase]; return lines ? lines[((n % lines.length) + lines.length) % lines.length] : null; }
/** What is said back to something the player wrote: the same answer for the same count, so the dummy can be tested. */
export const replyTo = (count: number) => REPLIES[((count % REPLIES.length) + REPLIES.length) % REPLIES.length];
/** One of the made-up players' lines, in turn. */
export const otherLine = (count: number): ChatLine => { const [name, text] = OTHERS[((count % OTHERS.length) + OTHERS.length) % OTHERS.length]; return {who: 'other', name, text}; };
/** A written message as it is shown: trimmed, at most 140 characters; null when there is nothing to show. */
export function cleanMessage(text: string): string | null { const t = text.replace(/\s+/g, ' ').trim().slice(0, 140); return t ? t : null; }

// ── the page ────────────────────────────────────────────────────────────────
export function mountChat(host: HTMLElement) {
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] => { const n = document.createElement(tag); if (className) n.className = className; if (text) n.textContent = text; return n; };
  const root = el('div', 'gc'), toggle = el('button', 'gc-toggle'), panel = el('div', 'gc-panel'), list = el('div', 'gc-list'), form = el('form', 'gc-form'), input = el('input'), send = el('button', '', 'Skicka'), unread = el('span', 'gc-unread');
  toggle.type = 'button'; toggle.append(el('span', '', 'Chatt'), unread); toggle.setAttribute('aria-expanded', 'false');
  input.type = 'text'; input.placeholder = 'Skriv till bordet …'; input.maxLength = 140; input.setAttribute('aria-label', 'Meddelande'); send.type = 'submit';
  form.append(input, send); panel.append(el('div', 'gc-head', 'Bordets chatt · attrapp, inget skickas'), list, form); panel.hidden = true; root.append(panel, toggle); host.append(root);
  let missed = 0, written = 0, others = 0, timer = 0; const phases: Record<string, number> = {};
  function add(line: ChatLine) {
    const row = el('div', `gc-row ${line.who}`); if (line.who !== 'note') row.append(el('b', '', line.name)); row.append(el('span', '', line.text)); list.append(row);
    while (list.children.length > 60) list.firstElementChild!.remove();
    list.scrollTop = list.scrollHeight; if (panel.hidden && line.who !== 'player') { missed++; unread.textContent = String(missed); }
  }
  toggle.addEventListener('click', () => { panel.hidden = !panel.hidden; toggle.setAttribute('aria-expanded', String(!panel.hidden)); if (!panel.hidden) { missed = 0; unread.textContent = ''; list.scrollTop = list.scrollHeight; input.focus(); } });
  form.addEventListener('submit', event => { event.preventDefault(); const text = cleanMessage(input.value); input.value = ''; if (!text) return;
    add({who: 'player', name: 'Du', text}); const n = written++; window.setTimeout(() => add({who: 'dealer', name: DEALER_NAME, text: replyTo(n)}), 1300); });
  // the keys the game listens to must not reach it while the player writes
  input.addEventListener('keydown', event => event.stopPropagation());
  add({who: 'note', name: '', text: `Välkommen till bordet. ${DEALER_NAME} är din dealer.`});
  const chatter = () => { timer = window.setTimeout(() => { add(otherLine(others++)); chatter(); }, 22000 + (others * 7919) % 15000); }; chatter();
  return {
    root,
    /** The round has entered a phase: the dealer says her line for it. */
    phase(phase: string) { const n = phases[phase] = (phases[phase] ?? -1) + 1, text = dealerLine(phase, n); if (text) add({who: 'dealer', name: DEALER_NAME, text}); },
    /** Something the dealer says about the round (how it ended). */
    say(text: string) { add({who: 'dealer', name: DEALER_NAME, text}); },
    destroy() { clearTimeout(timer); root.remove(); },
  };
}
