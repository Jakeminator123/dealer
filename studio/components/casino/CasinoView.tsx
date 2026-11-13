"use client";

// Casino: blackjack as at the casino, with the look calibrated in Scen. The lab's own game page (game.html: the game engine
// behind /api/game, the overlay with chips and buttons, the console's menus) plays in a frame as large as the window
// allows, with the chosen preset and keys (src/game-look.ts reads them). The plain game.html keeps its own look; here any
// preset can be played. The address carries the look and the table (lib/casino.ts), so a calibrated look can be sent as a
// link. In the online copy the game page runs the engine itself (cloud/studio/game-local.ts), so the view plays there too. The game plays the
// dealer chosen in the rail (?dealer=, passed on to the game page, src/game-page.ts), with her own films only: a step she has no
// film for is cut or laid without a hand, never played with another dealer's film. The address's ?dealer= is the rail's word:
// it is neither a look key nor dropped when the view writes its address.
import { Expand, Plus, SlidersHorizontal, SquareStack } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { asApiError } from "../../lib/api.ts";
import { useBank } from "../../lib/bank.ts";
import { casinoSearch, freshTable, gameSrc, readCasino, scenHref, type CasinoLook } from "../../lib/casino.ts";
import { useViewContext } from "../../lib/context.ts";
import { DEALER_PARAM, withDealer, withoutDealer } from "../../lib/dealer.ts";
import { SHIPPED } from "../../lib/scene-presets.ts";
import { listPresets, type Preset } from "../scene-editor/presetApi.ts";
import { Page } from "../shell";
import { Button, Select, Spinner, buttonClasses, useToast } from "../ui";

const shipped = (): Preset[] => SHIPPED.map((p) => ({ ...p, shipped: true, revision: null }));
/** The view's address with a new look, the address's ?dealer= kept as it stands. */
const write = (search: string) => window.history.replaceState(null, "", `${window.location.pathname}${withDealer(search, new URLSearchParams(window.location.search).get(DEALER_PARAM))}`);

export function CasinoView() {
  const { status } = useBank();
  // The game is not started before it is known whose studio this is.
  if (status === "loading")
    return (
      <Page title="Casino" full>
        <div className="grid h-full place-items-center bg-[#060706]">
          <Spinner size="sm" label="Läser klippbanken" />
        </div>
      </Page>
    );
  return <Casino />;
}

function Casino() {
  const params = useSearchParams();
  const { dealer, dealers } = useBank();
  const name = dealers.find((d) => d.id === dealer)?.name ?? dealer;
  // The address without the rail's word for the dealer, which is no look key.
  const query = withoutDealer(params.toString()).slice(1);
  const toast = useToast();
  // The look the address asks for. A choice here writes the address, and the look and the frame follow it.
  const look = useMemo(() => readCasino(new URLSearchParams(query)), [query]);
  const [dropped] = useState(() => readCasino(new URLSearchParams(query)).ignored);
  const go = (next: CasinoLook) => write(casinoSearch(next));
  // The address says it all (preset, keys, table) from the start, so that it can be sent as it stands.
  useEffect(() => {
    const want = casinoSearch(look);
    if (withoutDealer(window.location.search) !== want) write(want);
  }, [look]);

  // ── presets: the three that ship at once, his own when the lab answers ──
  const [presets, setPresets] = useState<Preset[]>(shipped);
  useEffect(() => {
    let gone = false;
    listPresets().then(
      (answer) => !gone && setPresets(answer.presets),
      (error) => !gone && toast({ tone: "bad", title: "Förvalen kunde inte läsas", detail: asApiError(error).message }),
    );
    return () => {
      gone = true;
    };
  }, [toast]);
  const options = useMemo(() => {
    const list = presets.map((p) => ({ value: p.name, label: p.label, hint: p.shipped ? undefined : "eget" }));
    return list.some((o) => o.value === look.forval) ? list : [...list, { value: look.forval, label: look.forval, hint: "finns inte" }];
  }, [presets, look.forval]);

  // ── the game in the frame: a new address loads it anew (a new element, so the studio's back button is not the frame's) ──
  // The dealer is the rail's: the game page reads it as its own word (?dealer=), so another dealer is another game in the frame.
  const src = `${gameSrc(look)}&${new URLSearchParams({ [DEALER_PARAM]: dealer })}`;
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);

  const changed = Object.keys(look.patch).length;
  // The drawn cards (the scene's key cards): the address's word, else the preset's, else on. Off shows the film's own coloured cards.
  const cardsOn = look.patch.cards ?? presets.find((p) => p.name === look.forval)?.state?.cards ?? true;
  useViewContext({ vy: "Casino", val: { forval: look.forval, bord: look.table, dealer: name } });

  return (
    <Page
      title="Casino"
      full
      status={
        <>
          <span className={changed ? "text-brass-hi" : undefined}>{changed ? `${changed} reglage utöver förvalet` : "som förvalet"}</span>
          <span>·</span>
          <span>{name}</span>
          <span>·</span>
          <span className="tabular-nums">bord {look.table}</span>
          {dropped.length ? <span className="text-faint">· okänt i adressen: {dropped.join(", ")}</span> : null}
        </>
      }
      actions={
        <>
          <Select size="sm" aria-label="Förval" className="w-40" value={look.forval} options={options} onChange={(forval) => go({ forval, patch: {}, table: look.table, ignored: [] })} />
          <Link href={scenHref(look)} className={buttonClasses({ variant: "quiet", size: "sm" })} title="Öppna samma look i Scen och kalibrera den vidare">
            <SlidersHorizontal /> Kalibrera i Scen
          </Link>
          <Button size="sm" variant={cardsOn ? "quiet" : "secondary"} icon={<SquareStack />} aria-pressed={cardsOn} title="Ritade kort på eller av: av visar filmens egna färgade kort, och inget ritas över dem" onClick={() => go({ ...look, patch: { ...look.patch, cards: !cardsOn } })}>
            Ritade kort: {cardsOn ? "på" : "av"}
          </Button>
          <Button size="sm" variant="quiet" icon={<Plus />} title="Ett nytt bord: ny spelomgång med nytt saldo och ny sko" onClick={() => go({ ...look, table: freshTable() })}>
            Nytt bord
          </Button>
          <Button size="sm" variant="secondary" icon={<Expand />} title="Spelet över hela skärmen; Esc går tillbaka" onClick={() => void frame.current?.requestFullscreen?.().catch(() => {})}>
            Helskärm
          </Button>
        </>
      }
    >
      <div className="absolute inset-0 bg-[#060706]">
        <iframe
          key={src}
          ref={frame}
          src={src}
          title="Blackjack"
          allow="fullscreen; autoplay"
          allowFullScreen
          onLoad={() => setLoaded(src)}
          className="absolute inset-0 size-full border-0"
        />
        {loaded !== src ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[#060706]">
            <span className="flex items-center gap-2 text-sm text-dim">
              <Spinner size="sm" label="Dukar bordet" /> Dukar bordet…
            </span>
          </div>
        ) : null}
      </div>
    </Page>
  );
}
