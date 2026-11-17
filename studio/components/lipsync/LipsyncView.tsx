"use client";

// Lipsync (/lipsync/): everything about the lip-sync on one page, read-only, in the order Jakob asked for it 2026-11-17:
// Grundbilder (what the model has as its reference, and what it does not), Kedjan (the steps from the rest film to the
// picture in the game, with the format in and out and the scale of each), Inställningar (by group, whose, locked or not),
// Var det körs (today and his RunPod), Proven (in order, with his words) and Öppet. The facts are the speech lane's register
// (data/lipsync.json) through the lab server; the header says when they were last updated. Nothing here writes. Only in
// the lab (app/lipsync/page.tsx).
import { buttonClasses } from "../ui/Button";
import { ErrorState, Skeleton } from "../ui/States";
import { dayWord } from "../../lib/lipsync.ts";
import { Page } from "../shell/Page";
import { Bases } from "./Bases";
import { Chain } from "./Chain";
import { OpenPoints, Proofs, Runs, Settings } from "./Facts";
import { Section } from "./parts";
import { refreshLipsync, useLipsync } from "./useLipsync";

const SECTIONS = [
  ["grundbilder", "Grundbilder"],
  ["kedjan", "Kedjan"],
  ["installningar", "Inställningar"],
  ["var-det-kors", "Var det körs"],
  ["proven", "Proven"],
  ["oppet", "Öppet"],
] as const;

const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

export function LipsyncView() {
  const { answer, error, status } = useLipsync();

  return (
    <Page title="Lipsync" status={answer ? <span>Uppdaterad {dayWord(answer.updated)}</span> : null}>
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-10">
        {!answer && status === "error" ? <ErrorState title="Fakta om läppsynken kunde inte läsas" error={error} onRetry={() => void refreshLipsync()} /> : null}
        {!answer && status !== "error" ? (
          <div aria-busy className="flex flex-col gap-4">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-40 w-full rounded-lg" />
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-lg" />
            ))}
          </div>
        ) : null}
        {answer ? (
          <>
            <div className="-mb-4 flex flex-col gap-3">
              <p className="text-md text-dim">Allt om läppsynken på ett ställe: vad modellen ser, hur stort det blir i varje steg och vad som är öppet. Inget ändras härifrån.</p>
              {error ? (
                <p role="status" className="text-xs text-[#ef8b8b]">
                  {error.message} Det som syns är det som lästes senast.
                </p>
              ) : null}
              <nav aria-label="Avsnitt" className="flex flex-wrap gap-1.5">
                {SECTIONS.map(([id, title]) => (
                  <button key={id} type="button" onClick={() => jump(id)} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                    {title}
                  </button>
                ))}
              </nav>
            </div>
            <Section id="grundbilder" title="Grundbilder" lead="Det modellen har som förlaga för hennes läppar, och det den inte har.">
              <Bases facts={answer} />
            </Section>
            <Section id="kedjan" title="Kedjan" lead="Från vilofilmen till bilden i spelet, steg för steg. Rutorna visar storleken in och ut; skalan står under.">
              <Chain steps={answer.steps} />
            </Section>
            <Section id="installningar" title="Inställningar" lead="Vad varje inställning står på och vems den är.">
              <Settings facts={answer} />
            </Section>
            <Section id="var-det-kors" title="Var det körs">
              <Runs runs={answer.runs} />
            </Section>
            <Section id="proven" title="Proven" lead="I ordning, med dina ord och hur det gick.">
              <Proofs facts={answer} />
            </Section>
            <Section id="oppet" title="Öppet">
              <OpenPoints open={answer.open} />
            </Section>
          </>
        ) : null}
      </div>
    </Page>
  );
}
