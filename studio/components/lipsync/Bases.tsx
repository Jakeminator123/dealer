// <Bases facts={facts} />: Grundbilder. What the lip-sync model has as its reference for her lips: a still with the rest
// film's own mouth first (when its proof is on this machine), one card per base picture (the film, the frames, its size, the
// day it was made), what is plainly not used (keystone, anchor, his own picture), and the lips as measured with the speech
// lane's conclusion.
import { Ban } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { dayWord, measureWord, proofHref, type BaseImage, type LipsyncAnswer, type LipsMeasured, type NotUsed, type Still } from "../../lib/lipsync.ts";
import { Card, Panel } from "../ui/Card";
import { StillView, Where } from "./parts";

function BaseStill({ still }: { still: Still }) {
  return (
    <figure className="flex flex-col gap-1.5">
      <Link href={proofHref(still.proof, still.name)} aria-label="Öppna bilden i Prov" className="block overflow-hidden rounded-lg border border-line bg-well">
        {/* The strip is five mouths side by side: on a phone the first two (the rest film and A), from sm the whole. */}
        <StillView still={still} className="aspect-[8/3] w-full object-cover object-left sm:aspect-[20/3]" />
      </Link>
      <figcaption className="text-sm text-dim">Längst till vänster: vilofilmen, så som modellen ser den. Bredvid: modellens mun, inlagd i fyra storlekar (A–D).</figcaption>
      <Where>provet {still.proof}</Where>
    </figure>
  );
}

function Fact({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <>
      <dt className="text-faint">{label}</dt>
      <dd className={mono ? "min-w-0 font-mono text-ink [overflow-wrap:anywhere]" : "min-w-0 text-ink"}>{children}</dd>
    </>
  );
}

function BaseCard({ image }: { image: BaseImage }) {
  return (
    <li>
      <Card className="flex h-full flex-col gap-2.5 p-3 sm:p-4">
        <p className="text-2xs text-faint">
          <span className="font-semibold uppercase tracking-[0.06em]">{image.dealer}</span> · gjord {dayWord(image.built)}
        </p>
        <h3 className="text-md font-semibold leading-5 text-ink">{image.use}</h3>
        {image.reference ? <p className="rounded-md border border-brass/25 bg-brass/8 px-2.5 py-1.5 text-sm text-ink">{image.reference}</p> : null}
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          <Fact label="Film" mono>
            {image.film}
          </Fact>
          <Fact label="Rutor">{image.frames}</Fact>
          <Fact label="Storlek">{image.size}</Fact>
          <Fact label="Bank" mono>
            {image.bank}
          </Fact>
          <dt className="text-faint">sha256</dt>
          <dd className="min-w-0 font-mono text-2xs text-faint [overflow-wrap:anywhere]">{image.sha256}</dd>
        </dl>
        <Where className="mt-auto pt-1">{image.where}</Where>
      </Card>
    </li>
  );
}

function NotUsedPanel({ list }: { list: readonly NotUsed[] }) {
  return (
    <Panel title="Används inte som förlaga">
      <ul className="flex flex-col divide-y divide-line">
        {list.map((n) => (
          <li key={n.what} className="flex gap-2.5 py-2.5 first:pt-0 last:pb-0">
            <Ban aria-hidden className="mt-0.5 size-4 shrink-0 text-underkand/80" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-sm font-medium text-ink">{n.what}</p>
              <p className="text-sm text-dim">{n.note}</p>
              <Where>{n.where}</Where>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const MEASURES = [
  ["width", "Bredd"],
  ["upperLip", "Överläpp"],
  ["lowerLip", "Underläpp"],
] as const;

function Measured({ m }: { m: LipsMeasured }) {
  return (
    <Panel title="Läpparna, mätta" subtitle="i bildpunkter, ±2">
      <div className="flex flex-col gap-3">
        <ul className="flex flex-col divide-y divide-line text-sm">
          <li aria-hidden className="hidden pb-1.5 text-2xs text-faint sm:grid sm:grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_4.5rem] sm:gap-x-2">
            <span>Bild</span>
            {MEASURES.map(([key, word]) => (
              <span key={key} className="text-right">
                {word}
              </span>
            ))}
          </li>
          {m.rows.map((row) => (
            <li key={row.what} className="grid grid-cols-3 gap-x-2 gap-y-0.5 py-2 sm:grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_4.5rem] sm:items-baseline">
              <span className="col-span-3 text-ink sm:col-span-1">{row.what}</span>
              {MEASURES.some(([key]) => row[key] !== undefined)
                ? MEASURES.map(([key, word]) => (
                    <span key={key} className="tabular-nums text-ink sm:text-right">
                      <span className="text-2xs text-faint sm:hidden">{word} </span>
                      {measureWord(row[key])}
                    </span>
                  ))
                : null}
              {row.note ? <span className="col-span-3 text-xs text-dim sm:col-span-4">{row.note}</span> : null}
            </li>
          ))}
        </ul>
        <p className="rounded-md border border-brass/25 bg-brass/8 px-3 py-2 text-sm font-medium text-ink">{m.conclusion}</p>
        <p className="text-xs text-dim">{m.note}</p>
        <Where>{m.where}</Where>
      </div>
    </Panel>
  );
}

export function Bases({ facts }: { facts: LipsyncAnswer }) {
  return (
    <div className="flex flex-col gap-4">
      {facts.stills.base ? <BaseStill still={facts.stills.base} /> : null}
      <ul aria-label="Grundbilderna" className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {facts.baseImages.map((image) => (
          <BaseCard key={image.bank} image={image} />
        ))}
      </ul>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <NotUsedPanel list={facts.notUsedAsBase} />
        <Measured m={facts.lipsMeasured} />
      </div>
    </div>
  );
}
