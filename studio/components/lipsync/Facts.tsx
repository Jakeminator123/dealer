// The sections of Lipsync after the chain. <Settings />: every setting by its group, with its value, whose it is and a
// lock where it sits in the other team's sealed renderer (the file's lockNote says what that means), read-only.
// <Proofs />: the chosen dealer's proofs in order with his own words, the outcome and the way into Prov (where they run
// today is in Ways.tsx). <OpenPoints />: what is open and what it holds up.
import { CornerDownRight, FlaskConical, Lock } from "lucide-react";
import Link from "next/link";
import { dayWord, forDealer, groupSettings, isOurs, outcomeTone, ownerWord, proofHref, type LipsyncAnswer, type OpenPoint, type ProofFact, type Setting, type Still } from "../../lib/lipsync.ts";
import { Badge } from "../ui/Badge";
import { Card, Panel } from "../ui/Card";
import { SEALED, StillView, Where } from "./parts";

function SettingRow({ setting }: { setting: Setting }) {
  return (
    <li className="grid gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_auto] sm:items-start">
      <span className="text-sm text-dim">{setting.name}</span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-md font-medium text-ink [overflow-wrap:anywhere]">{setting.value}</span>
        <Where>{setting.where}</Where>
      </div>
      <span className="mt-1 flex flex-wrap items-center gap-1.5 sm:mt-0 sm:justify-end">
        <Badge tone={isOurs(setting.owner) ? "ok" : "variant"} size="md">
          {ownerWord(setting.owner)}
        </Badge>
        {setting.locked ? (
          <Badge tone="neutral" size="md" icon={<Lock aria-hidden />} title={SEALED}>
            Låst
          </Badge>
        ) : null}
      </span>
    </li>
  );
}

export function Settings({ facts }: { facts: LipsyncAnswer }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-start gap-2 rounded-md border border-variant/25 bg-variant/8 px-3 py-2 text-sm text-dim">
        <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-[#9db3f8]" />
        <span>{facts.lockNote}</span>
      </p>
      {groupSettings(facts.settings).map(({ group, settings }) => (
        <Panel key={group} title={group} flush>
          <ul className="divide-y divide-line">
            {settings.map((setting) => (
              <SettingRow key={setting.name} setting={setting} />
            ))}
          </ul>
        </Panel>
      ))}
    </div>
  );
}

function ProofRow({ n, proof, still }: { n: number; proof: ProofFact; still: Still | null }) {
  const href = proofHref(proof.id, still?.name);
  return (
    <li>
      <Card className="flex gap-3 p-3 sm:gap-4">
        {still ? (
          <Link href={href} aria-label={`Öppna ${proof.id} i Prov`} className="block w-24 shrink-0 self-start overflow-hidden rounded-md border border-line bg-well sm:w-44">
            <StillView still={still} className="aspect-video w-full object-cover" />
          </Link>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="flex flex-wrap items-center gap-x-2 text-2xs text-faint">
            <span className="font-semibold tabular-nums text-dim">{n}</span>
            <span>{dayWord(proof.date)}</span>
            <span className="min-w-0 font-mono [overflow-wrap:anywhere]">{proof.id}</span>
          </p>
          <p className="text-sm text-ink">{proof.what}</p>
          {proof.ownerSaid ? (
            <blockquote className="border-l-2 border-brass/50 pl-2.5 text-sm italic text-ink">
              <span className="sr-only">Du sa: </span>”{proof.ownerSaid}”
            </blockquote>
          ) : (
            <p className="text-xs text-faint">Inga ord från dig om det här provet.</p>
          )}
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <Badge tone={outcomeTone(proof.outcome)} size="md" className="h-auto min-h-[22px] min-w-0 max-w-full shrink whitespace-normal py-0.5">
              <span className="sr-only">Utfall: </span>
              {proof.outcome}
            </Badge>
            <Link href={href} className="ml-auto inline-flex items-center gap-1 text-xs text-dim hover:text-ink [&_svg]:size-3.5">
              <FlaskConical aria-hidden />
              Öppna i Prov
            </Link>
          </div>
        </div>
      </Card>
    </li>
  );
}

export function Proofs({ facts, dealer, name }: { facts: LipsyncAnswer; dealer: string; name: string }) {
  const proofs = forDealer(facts.proofs, dealer);
  if (!proofs.length) return <p className="text-sm text-faint">Inga prov för {name}: inte gjort.</p>;
  return (
    <ol className="flex flex-col gap-3">
      {proofs.map((proof, i) => (
        <ProofRow key={proof.id} n={i + 1} proof={proof} still={facts.stills.proofs[proof.id] ?? null} />
      ))}
    </ol>
  );
}

export function OpenPoints({ open }: { open: readonly OpenPoint[] }) {
  return (
    <Card className="overflow-hidden">
      <ol className="divide-y divide-line">
        {open.map((point, i) => (
          <li key={point.what} className="flex gap-3 px-4 py-3">
            <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-line-strong text-2xs font-semibold tabular-nums text-dim">
              {i + 1}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-sm text-ink">{point.what}</p>
              <p className="flex items-start gap-1.5 text-xs text-dim">
                <CornerDownRight aria-hidden className="mt-px size-3.5 shrink-0 text-faint" />
                <span>{point.blocks}</span>
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
