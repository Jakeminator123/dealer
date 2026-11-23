// What game.html sets by itself when no look is asked for (src/game-page.ts), and the words of its address that are its own.
// Pure and small: the page reads it at once, while the look (src/game-look.ts) is read only when the address asks for one.
// The studio's base preset basgrund is a copy of this look (studio/lib/scene-presets.ts BASE); tools/casino-default.test.ts
// holds the two together.

/** The scene as the game sets it: a wide window's framing, the first room (its blur is the room's own, data/scene-rooms.json),
 *  the tray and the drawn cards on, and a room changed under a shimmer. */
export const GAME_OWN = {format: 'fill', room: 'panorama', tray: true, cards: true, pitch: -8, zoom: 0.84, roomShift: 'shimmer'} as const;

/** The address's words that are the game's and never a key of the look; the Casino writes some of them into its frame
 *  (studio/lib/casino.ts gameSrc). trad: the one tree the game plays, komposition: the trees put together (src/game-page.ts). */
export const OWN_WORDS: readonly string[] = ['table', 'tema', 'bricka', 'chatt', 'robot', 'inbaddad', 'dealer', 'intro', 'diagnos', 'geometri', 'dealTempo', 'trad', 'komposition'];
