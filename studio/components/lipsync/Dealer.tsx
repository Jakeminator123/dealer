// <Dealer facts={facts} dealer="paow" name="Paow" paused={null} />: the first section of Lipsync, for the dealer chosen in
// the rail's switch. Media first: the film (and still) of the proof her mouth was chosen in, beside what is set for her
// (from the speech register: bank, rest film, voice, language; from the facts: the mouth with his yes, how the line films
// are laid, the films prepared for the renderer and for the runner). Under it, what holds and what does not yet, as the
// facts say it. Where nothing is made for her (Pamela) the section says so plainly; where no source says, "okänt".
import { CircleCheck, CircleDashed, CircleHelp, FlaskConical } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { dayWord, forDealer, groupChecks, proofHref, speechWord, voiceWord, type Check, type DealerFacts, type LipsyncAnswer, type Still } from "../../lib/lipsync.ts";
import { labUrl } from "../../lib/lab.ts";
import { Badge } from "../ui/Badge";
import { Card, Panel } from "../ui/Card";
import { StillView, Where } from "./parts";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-xs text-faint">{label}</dt>
      <dd className="min-w-0 text-sm text-ink [overflow-wrap:anywhere]">{children}</dd>
    </>
  );
}

/** A word the source does not give: muted, so that "inte gjort" and "okänt" never read as a value. */
const Missing = ({ children }: { children: ReactNode }) => <span className="text-faint">{children}</span>;

function MouthMedia({ film, still, proof }: { film: Still | null; still: Still | null; proof: string }) {
  if (!film && !still) return null;
  return (
    <figure className="flex flex-col gap-1.5">
      <div className="overflow-hidden rounded-lg border border-line bg-well">
        {film ? (
          <video src={labUrl(film.path)} poster={still?.kind === "image" ? labUrl(still.path) : undefined} controls muted playsInline loop preload="metadata" className="aspect-video w-full bg-well object-contain" />
        ) : still ? (
          <StillView still={still} className="aspect-video w-full object-contain" />
        ) : null}
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-dim">
        <span>Provet där du valde munnen. Slå på ljudet.</span>
        <Link href={proofHref(proof, film?.name ?? still?.name)} className="ml-auto inline-flex items-center gap-1 text-dim hover:text-ink [&_svg]:size-3.5">
          <FlaskConical aria-hidden />
          Öppna i Prov
        </Link>
      </figcaption>
    </figure>
  );
}

function SetFor({ facts, dealer, mine }: { facts: LipsyncAnswer; dealer: string; mine: DealerFacts | null }) {
  const speech = (pick: Parameters<typeof speechWord>[2]) => {
    const word = speechWord(facts.speech, dealer, pick);
    return word.known ? word.text : <Missing>{word.text}</Missing>;
  };
  const banks = forDealer(facts.baseImages, dealer);
  return (
    <Panel title="Inställt">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-2.5">
        <Row label="Bank">{speech((s) => s.bankId)}</Row>
        <Row label="Vilofilm">{speech((s) => s.rest)}</Row>
        <Row label="Röst">{speech(voiceWord)}</Row>
        <Row label="Språk">{speech((s) => [s.language, ...(s.voice?.languages ?? []).filter((l) => l !== s.language)].join(", "))}</Row>
        <Row label="Munnen i realtid">
          {mine?.mouth ? (
            <span className="flex flex-col gap-1">
              <span>{mine.mouth.value}</span>
              <span className="flex flex-wrap items-center gap-1.5">
                <Badge tone="ok" size="md">
                  Ditt {mine.mouth.ownerSaid || "svar"} {dayWord(mine.mouth.date)}
                </Badge>
                <code className="min-w-0 font-mono text-2xs text-faint [overflow-wrap:anywhere]">{mine.mouth.recipe}</code>
              </span>
            </span>
          ) : (
            <Missing>inte gjort</Missing>
          )}
        </Row>
        <Row label="Replikfilmerna">{mine?.lines ? mine.lines.value : <Missing>inte gjort</Missing>}</Row>
        <Row label="Filmer för renderern">
          {banks.length ? (
            <ul className="flex flex-col gap-0.5">
              {banks.map((b) => (
                <li key={b.bank}>
                  <span className="font-mono text-xs">{b.film}</span> <span className="text-dim">· {b.use}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Missing>inte gjort</Missing>
          )}
        </Row>
        <Row label="Filmer för köraren">
          {mine?.runner.length ? (
            <ul className="flex flex-col gap-0.5">
              {mine.runner.map((r) => (
                <li key={r.film}>
                  <span className="font-mono text-xs">{r.film}</span> <span className="text-dim">· {r.clip}; {r.prepared}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Missing>inte gjort</Missing>
          )}
        </Row>
      </dl>
      {mine?.mouth ? <Where className="mt-3">{mine.mouth.where}</Where> : null}
    </Panel>
  );
}

const ANSWER_ICON: Record<Check["answer"], ReactNode> = {
  ja: <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-godkand" />,
  nej: <CircleDashed aria-hidden className="mt-0.5 size-4 shrink-0 text-faint" />,
  okänt: <CircleHelp aria-hidden className="mt-0.5 size-4 shrink-0 text-anmarkning" />,
};

function Checks({ checks }: { checks: readonly Check[] }) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-3">
      {groupChecks(checks).map((group) => (
        <Panel key={group.answer} title={group.title} subtitle={String(group.checks.length)}>
          <ul className="flex flex-col divide-y divide-line">
            {group.checks.map((c) => (
              <li key={c.what} className="flex gap-2.5 py-2 first:pt-0 last:pb-0">
                {ANSWER_ICON[c.answer]}
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="text-sm font-medium text-ink">{c.what}</p>
                  {c.note ? <p className="text-xs text-dim">{c.note}</p> : null}
                  <Where>{c.where}</Where>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ))}
    </div>
  );
}

export function Dealer({ facts, dealer, name, paused }: { facts: LipsyncAnswer; dealer: string; name: string; paused: string | null }) {
  const mine = facts.dealers?.find((d) => d.dealer === dealer) ?? null;
  const proof = mine?.mouth?.proof ?? null;
  // A lab server started before films and speech were in its answer has neither: the view then shows the still and "okänt".
  const film = proof ? (facts.stills.films?.[proof] ?? null) : null;
  const still = proof ? (facts.stills.proofs[proof] ?? null) : null;
  return (
    <div className="flex flex-col gap-4">
      {mine ? (
        <p className="rounded-md border border-brass/25 bg-brass/8 px-3 py-2 text-md font-medium text-ink">{mine.summary}</p>
      ) : (
        <Card className="p-4 text-sm text-dim">Lipsync har inga uppgifter om {name}: okänt. En post för henne under dealers i data/lipsync.json behövs.</Card>
      )}
      {paused ? <p className="text-xs text-faint">Pausad: {paused}</p> : null}
      <div className={proof && (film || still) ? "grid items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]" : "flex flex-col"}>
        {proof ? <MouthMedia film={film} still={still} proof={proof} /> : null}
        <SetFor facts={facts} dealer={dealer} mine={mine} />
      </div>
      {mine ? <Checks checks={mine.checks} /> : null}
    </div>
  );
}
