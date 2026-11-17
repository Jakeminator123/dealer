"use client";

// Lipsync (/lipsync/): everything about the lip sync on one page, read-only, for the dealer chosen in the rail's switch
// (Jakob 2026-11-17: "så att vi vid beställning av nya videor eller arbete med lipsync förstår och kan ställa in vad som
// stämmer och inte stämmer för just den dealern"). First her part (Dealer.tsx: the mouth with his yes in motion, what is set,
// what holds and what not yet), then Så görs munnen (Ways.tsx: the three ways and how a job gets to each), what a new film
// or dealer needs, and after them the facts as they were (Grundbilder, Kedjan, Inställningar, Proven, Licenser, Öppet).
// The facts are data/lipsync.json and data/speech.json through the lab server; the header says when they were last
// updated. Nothing here writes. Only in the lab (app/lipsync/page.tsx).
import { buttonClasses } from "../ui/Button";
import { ErrorState, Skeleton } from "../ui/States";
import { useBank } from "../../lib/bank.ts";
import { dayWord } from "../../lib/lipsync.ts";
import { Page } from "../shell/Page";
import { Bases } from "./Bases";
import { Chain } from "./Chain";
import { Dealer } from "./Dealer";
import { OpenPoints, Proofs, Settings } from "./Facts";
import { Section } from "./parts";
import { refreshLipsync, useLipsync } from "./useLipsync";
import { Licences, Ways, WhenNewPanel } from "./Ways";

const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

export function LipsyncView() {
  const { answer, error, status } = useLipsync();
  const { dealer, dealers } = useBank();
  const chosen = dealers.find((d) => d.id === dealer);
  const name = chosen?.name ?? (dealer || "dealern");

  const sections = [
    ["dealern", name],
    ["sa-gors-munnen", "Så görs munnen"],
    ["ny-film", "Ny film eller dealer"],
    ["grundbilder", "Grundbilder"],
    ["kedjan", "Kedjan"],
    ["installningar", "Inställningar"],
    ["proven", "Proven"],
    ["licenser", "Licenser"],
    ["oppet", "Öppet"],
  ] as const;

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
              <p className="text-md text-dim">Läppsynken för {name}: var munnen görs, vad som är inställt och vad som stämmer. Byt dealer i menyn. Inget ändras härifrån.</p>
              {error ? (
                <p role="status" className="text-xs text-[#ef8b8b]">
                  {error.message} Det som syns är det som lästes senast.
                </p>
              ) : null}
              <nav aria-label="Avsnitt" className="flex flex-wrap gap-1.5">
                {sections.map(([id, title]) => (
                  <button key={id} type="button" onClick={() => jump(id)} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                    {title}
                  </button>
                ))}
              </nav>
            </div>
            <Section id="dealern" title={name} lead="Munnen, vad som är inställt för henne, och vad som stämmer och inte än.">
              <Dealer facts={answer} dealer={dealer} name={name} paused={chosen?.paused ?? null} />
            </Section>
            <Section id="sa-gors-munnen" title="Så görs munnen" lead="Tre sätt: hur ett jobb kommer dit, vad det kostar och hur långt det har kommit.">
              <Ways ways={answer.ways} runs={answer.runs} />
            </Section>
            <Section id="ny-film" title="Ny film eller dealer" lead="Det som behövs innan hon kan tala över en ny film, eller innan en ny dealer kan tala.">
              <WhenNewPanel whenNew={answer.whenNew} />
            </Section>
            <Section id="grundbilder" title="Grundbilder" lead={`Det modellen har som förlaga för ${name}s läppar, och det den inte har.`}>
              <Bases facts={answer} dealer={dealer} name={name} />
            </Section>
            <Section id="kedjan" title="Kedjan" lead="Från vilofilmen till bilden i spelet, steg för steg, för replikfilmerna. Rutorna visar storleken in och ut; skalan står under.">
              <Chain steps={answer.steps} />
            </Section>
            <Section id="installningar" title="Inställningar" lead="Vad varje inställning står på och vems den är.">
              <Settings facts={answer} />
            </Section>
            <Section id="proven" title="Proven" lead="I ordning, med dina ord och hur det gick.">
              <Proofs facts={answer} dealer={dealer} name={name} />
            </Section>
            <Section id="licenser" title="Licenser" lead="Delarna köraren är byggd av, och om licensen tillåter kommersiellt bruk.">
              <Licences licences={answer.licences} />
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
