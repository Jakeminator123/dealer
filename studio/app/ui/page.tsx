"use client";

// The kit on one page (/studio/ui/, not in the menu): every primitive in its states, the chips, take cards from the real
// bank, and the decision bar in demo mode (it cannot write from here). How the main agent and the builders see what exists.
import { ArrowUpRight, Film, Inbox, Pause, Play, Search, SkipBack, SkipForward, Star, Trash2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type { Take } from "../../../src/clip-graph.ts";
import { BankStatus, Page } from "@/components/shell";
import { DecisionBar, ProofChip, TakeCard, TakeThumb, VerdictChip } from "@/components/takes";
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  IconButton,
  Kbd,
  Panel,
  SegmentedControl,
  Select,
  Sheet,
  Skeleton,
  Slider,
  Spinner,
  Switch,
  Tabs,
  TextArea,
  TextField,
  Tooltip,
  buttonClasses,
  cn,
  useToast,
} from "@/components/ui";
import { useBank } from "@/lib/bank";
import { edgeName, formatJakob, nodeName, parseJakob, takeName } from "@/lib/names";
import { VERDICTS, verdictOf, type Verdict } from "@/lib/verdict";

const SECTIONS = [
  ["farger", "Färger och typ"],
  ["knappar", "Knappar"],
  ["val", "Val och fält"],
  ["marken", "Märken"],
  ["lagen", "Lägen"],
  ["overlagg", "Överlägg"],
  ["tagningar", "Tagningar"],
  ["beslut", "Beslut"],
] as const;

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <div className="mb-4 flex items-baseline gap-3">
        <h2 className="font-display text-xl font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        {note ? <p className="text-sm text-faint">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] items-center gap-4 py-2.5">
      <span className="text-xs text-faint">{label}</span>
      <div className={cn("flex flex-wrap items-center gap-2.5", className)}>{children}</div>
    </div>
  );
}

const SWATCHES: [string, string, string][] = [
  ["canvas", "#0B0F0D", "bg-canvas"],
  ["well", "#070A09", "bg-well"],
  ["surface", "#121815", "bg-surface"],
  ["raised", "#19211D", "bg-raised"],
  ["overlay", "#212B26", "bg-overlay"],
  ["line", "#1E2722", "bg-line"],
  ["line-strong", "#2D3933", "bg-line-strong"],
  ["faint", "#7A867F", "bg-faint"],
  ["dim", "#8E9A93", "bg-dim"],
  ["ink", "#E8ECE9", "bg-ink"],
  ["brass", "#D9B96A", "bg-brass"],
];
const VERDICT_SWATCHES: [string, string, string][] = [
  ["primar", "#D9B96A", "bg-primar"],
  ["godkand", "#4FB27F", "bg-godkand"],
  ["variant", "#7F9CF5", "bg-variant"],
  ["vantar", "#A3B1C2", "bg-vantar"],
  ["underkand", "#E06C6C", "bg-underkand"],
  ["anmarkning", "#E39B5B", "bg-anmarkning"],
];

function Swatch({ name, hex, className }: { name: string; hex: string; className: string }) {
  return (
    <div className="flex w-[92px] flex-col gap-1.5">
      <div className={cn("h-12 rounded-md border border-white/8", className)} />
      <div className="flex flex-col">
        <span className="text-xs text-ink">{name}</span>
        <span className="font-mono text-2xs text-faint">{hex}</span>
      </div>
    </div>
  );
}

/** One take per verdict, from the real bank, to show cards and chips on. */
function useSamples(): Take[] {
  const { graph } = useBank();
  return useMemo(() => {
    if (!graph) return [];
    const all = Object.values(graph.takes).filter((t) => t.stage === "DONE");
    const pick: Take[] = [];
    const want: [Verdict, (t: Take) => boolean][] = [
      ["godkand", (t) => !!t.media.first && t.kind === "DEAL"],
      ["variant", (t) => !!t.segment],
      ["vantar", (t) => t.kind !== "IDLE"],
      ["underkand", () => true],
      ["godkand", (t) => t.kind === "RETURN"],
      ["godkand", (t) => t.kind === "IDLE"],
    ];
    for (const [verdict, extra] of want) {
      const found = all.find((t) => !pick.includes(t) && verdictOf(t).verdict === verdict && extra(t));
      if (found) pick.push(found);
    }
    return pick;
  }, [graph]);
}

export default function Kit() {
  const toast = useToast();
  const { graph, status, error, reload } = useBank();
  const samples = useSamples();
  const [mode, setMode] = useState<"3d" | "flat">("3d");
  const [speed, setSpeed] = useState<number>(1);
  const [on, setOn] = useState(true);
  const [off, setOff] = useState(false);
  const [gloss, setGloss] = useState(0.42);
  const [room, setRoom] = useState<string | null>("salong");
  const [tab, setTab] = useState<"vantar" | "godkanda" | "underkanda">("vantar");
  const [round, setRound] = useState("A2.1 - P4C1 - A2.1 - P4C2 - A2.1");
  const [note, setNote] = useState("Handen glider fint, men kortet landar lite snett.");
  const [dialog, setDialog] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const parsed = parseJakob(round);
  const demoTake = samples[0] ?? null;
  const sheetEdge = demoTake && graph ? graph.edge[demoTake.edge] : null;

  return (
    <Page
      title="Komponenter"
      status={<BankStatus />}
      actions={
        <a href="/lab.html" className={buttonClasses({ variant: "quiet", size: "sm" })}>
          Gamla labbet <ArrowUpRight />
        </a>
      }
    >
      <div className="flex flex-col gap-14">
        <nav aria-label="Avsnitt" className="-mb-6 flex flex-wrap gap-1">
          {SECTIONS.map(([id, label]) => (
            <Button key={id} variant="quiet" size="sm" onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              {label}
            </Button>
          ))}
        </nav>

        <Section id="farger" title="Färger och typ" note="Brass är den enda accenten. Domens färg står alltid med ett tecken.">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Panel title="Ytor och text">
              <div className="flex flex-wrap gap-3">
                {SWATCHES.map(([name, hex, cls]) => (
                  <Swatch key={name} name={name} hex={hex} className={cls} />
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                {VERDICT_SWATCHES.map(([name, hex, cls]) => (
                  <Swatch key={name} name={name} hex={hex} className={cls} />
                ))}
              </div>
            </Panel>
            <Panel title="Typskala" subtitle="Segoe UI Variable · tabellsiffror">
              <div className="flex flex-col gap-2.5">
                <div className="font-display text-2xl font-semibold tracking-[-0.015em]">2xl 26 · Spela rundan</div>
                <div className="font-display text-xl font-semibold tracking-[-0.01em]">xl 20 · Granska tagningar</div>
                <div className="text-lg font-semibold">lg 17 · A2.1 → P4C1</div>
                <div className="text-md">md 15 · Giv 02 spelas nu</div>
                <div className="text-base">base 14 · Brödtext, anteckningar och listor.</div>
                <div className="text-sm text-dim">sm 13 · Etiketter och knappar</div>
                <div className="text-xs text-faint">xs 12 · Fakta: Wan 3 · 4,0 s · 120 rutor · 10 nov</div>
                <div className="text-2xs text-faint">2xs 11 · Märken och tidskoder 0:03,12</div>
              </div>
            </Panel>
          </div>
        </Section>

        <Section id="knappar" title="Knappar" note="Primär (brass) bara för vyns huvudhandling.">
          <Panel>
            <Row label="Varianter">
              <Button variant="primary" icon={<Play />}>
                Spela
              </Button>
              <Button>Jämför mot primär</Button>
              <Button variant="quiet">Avbryt</Button>
              <Button variant="danger" icon={<Trash2 />}>
                Ta bort
              </Button>
            </Row>
            <Row label="Fokus">
              <Button variant="primary" className="kit-focus">
                Spela
              </Button>
              <Button className="kit-focus">Jämför</Button>
              <Button variant="quiet" className="kit-focus">
                Avbryt
              </Button>
            </Row>
            <Row label="Vald / avstängd">
              <Button aria-pressed>Visar kortspår</Button>
              <Button variant="quiet" aria-pressed>
                Loop
              </Button>
              <Button variant="primary" disabled>
                Spela
              </Button>
              <Button disabled>Jämför</Button>
              <Button variant="danger" disabled>
                Ta bort
              </Button>
            </Row>
            <Row label="Arbetar">
              <Button variant="primary" loading>
                Sparar
              </Button>
              <Button loading>Läser</Button>
            </Row>
            <Row label="Storlekar">
              <Button size="sm">Liten</Button>
              <Button size="md">Mellan</Button>
              <Button size="lg" variant="primary" icon={<Play />}>
                Stor
              </Button>
            </Row>
            <Row label="Bara ikon">
              <IconButton label="Ett steg bakåt" kbd="," icon={<SkipBack />} />
              <IconButton label="Spela" kbd="Mellanslag" variant="primary" icon={<Play />} />
              <IconButton label="Paus" icon={<Pause />} variant="secondary" />
              <IconButton label="Ett steg framåt" kbd="." icon={<SkipForward />} />
              <IconButton label="Sök" size="sm" icon={<Search />} />
              <IconButton label="Ladda" loading icon={<Film />} variant="secondary" />
              <IconButton label="Avstängd" disabled icon={<Star />} variant="secondary" />
            </Row>
          </Panel>
        </Section>

        <Section id="val" title="Val och fält">
          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Val">
              <Row label="Segment">
                <SegmentedControl
                  label="Visning"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: "3d", label: "3D" },
                    { value: "flat", label: "Inte 3D" },
                  ]}
                />
                <SegmentedControl
                  label="Hastighet"
                  size="sm"
                  value={speed}
                  onChange={setSpeed}
                  options={[
                    { value: 0.25, label: "0,25×" },
                    { value: 0.5, label: "0,5×" },
                    { value: 1, label: "1×" },
                  ]}
                />
                <SegmentedControl label="Avstängd" disabled value="a" onChange={() => {}} options={[{ value: "a", label: "A" }, { value: "b", label: "B" }]} />
              </Row>
              <Row label="Brytare" className="gap-6">
                <Switch checked={on} onChange={setOn} label="Kortspår" hint="Ritas över filmen" />
                <Switch checked={off} onChange={setOff} label="Loop" />
                <Switch checked disabled onChange={() => {}} label="Låst" />
                <Switch size="sm" checked={on} onChange={setOn} aria-label="Liten brytare" />
              </Row>
              <Row label="Reglage">
                <div className="flex w-full max-w-md flex-col gap-4">
                  <Slider label="Glans" value={gloss} onChange={setGloss} />
                  <Slider label="Böj (avstängd)" value={0.2} onChange={() => {}} disabled />
                </div>
              </Row>
              <Row label="Lista">
                <Select
                  aria-label="Rum"
                  className="w-56"
                  value={room}
                  onChange={setRoom}
                  options={[
                    { value: "salong", label: "Salong", hint: "byggt" },
                    { value: "panorama", label: "Las Vegas", hint: "360°" },
                    { value: "skog", label: "Skog", hint: "360°" },
                    { value: "plat", label: "V6-plåten", hint: "dagens" },
                  ]}
                />
                <Select aria-label="Tom" className="w-40" value={null} onChange={() => {}} options={[{ value: "a", label: "A" }]} />
                <Select aria-label="Avstängd" className="w-40" value="a" disabled onChange={() => {}} options={[{ value: "a", label: "Avstängd" }]} />
              </Row>
              <Row label="Flikar">
                <Tabs
                  label="Granskning"
                  value={tab}
                  onChange={setTab}
                  className="w-full"
                  items={[
                    { value: "vantar", label: "Väntar", count: 19 },
                    { value: "godkanda", label: "Godkända", count: 58 },
                    { value: "underkanda", label: "Underkända", count: 36 },
                  ]}
                />
              </Row>
            </Panel>
            <Panel title="Fält">
              <div className="flex flex-col gap-5">
                <TextField
                  label="Runda"
                  value={round}
                  onChange={(event) => setRound(event.target.value)}
                  error={parsed.errors.length ? parsed.errors.join(" ") : undefined}
                  hint={parsed.steps.length ? `${parsed.steps.length} filmer: ${parsed.steps.map((s) => edgeName(s)).join(" · ")}` : "Skriv ankare och kort: A2.1 - P4C1 - A2.1"}
                />
                <div className="grid grid-cols-2 gap-4">
                  <TextField label="Med ikon" icon={<Search />} placeholder="Sök tagning…" />
                  <TextField label="Fokus" className="border-brass/70 ring-3 ring-brass/15" defaultValue="P4C1" />
                  <TextField label="Fel" defaultValue="A2 - P4C1" error="”A2” kan vara A2.1 (nyp) eller A2.2 (hand över): skriv vilken." />
                  <TextField label="Avstängd" defaultValue="Kan inte ändras" disabled />
                </div>
                <TextArea label="Anteckning" value={note} onChange={(event) => setNote(event.target.value)} maxLength={1500} counter hint="Sparas med beslutet" />
              </div>
            </Panel>
          </div>
        </Section>

        <Section id="marken" title="Märken" note="Tecken och färg, aldrig bara färg. Streckad kant: en granskare, inte Jakob.">
          <Panel>
            <Row label="Jakobs beslut">
              {VERDICTS.map((v) => (
                <VerdictChip key={v} verdict={v} />
              ))}
            </Row>
            <Row label="Av granskare">
              {VERDICTS.filter((v) => v !== "vantar").map((v) => (
                <VerdictChip key={v} verdict={v} byJakob={false} />
              ))}
            </Row>
            <Row label="Små">
              {VERDICTS.map((v) => (
                <VerdictChip key={v} verdict={v} size="sm" />
              ))}
              <span className="w-2" />
              {VERDICTS.filter((v) => v !== "vantar").map((v) => (
                <VerdictChip key={v} verdict={v} size="sm" byJakob={false} />
              ))}
            </Row>
            <Row label="Mer">
              <VerdictChip verdict="underkand" detail="sekundär" />
              <VerdictChip verdict="vantar" detail="renderas" />
            </Row>
            <Row label="Prov">
              <ProofChip verdict="ok" />
              <ProofChip verdict="remarks" />
              <ProofChip verdict="failed" />
              <ProofChip verdict="unreviewed" />
            </Row>
            <Row label="Räknare">
              <Badge>109</Badge>
              <Badge tone="brass">19 väntar</Badge>
              <Badge tone="ok">31 klara</Badge>
              <Badge tone="variant">8 varianter</Badge>
              <Badge tone="wait">2 saknas</Badge>
              <Badge tone="bad">1 lucka</Badge>
              <Badge tone="remark">ingen primär</Badge>
              <Badge size="md" tone="brass">
                0/33 primära
              </Badge>
            </Row>
            <Row label="Tangenter">
              <Kbd>Mellanslag</Kbd>
              <Kbd>,</Kbd>
              <Kbd>.</Kbd>
              <Kbd>X</Kbd>
              <Kbd>Esc</Kbd>
            </Row>
            <Row label="Namn">
              <span className="text-sm text-ink">{nodeName("IDLE")}</span>
              <span className="text-faint">·</span>
              <span className="text-sm text-ink">{nodeName("READY")}</span>
              <span className="text-faint">·</span>
              <span className="text-sm text-ink">{nodeName("READY-B")}</span>
              <span className="text-faint">·</span>
              <span className="text-sm text-ink">{edgeName("READY>P4.C1")}</span>
              <span className="text-faint">·</span>
              <span className="text-sm text-ink">{edgeName("IDLE>REVEAL(D.C2)")}</span>
              <span className="text-faint">·</span>
              <span className="text-sm text-dim">{formatJakob(parsed.steps)}</span>
            </Row>
          </Panel>
        </Section>

        <Section id="lagen" title="Lägen" note="Läser, tomt och fel: varje vy visar ett av dem i stället för innehåll.">
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Läser">
              <div className="flex items-center gap-4 pb-4">
                <Spinner size="xs" />
                <Spinner size="sm" />
                <Spinner size="md" />
                <Spinner size="lg" className="text-brass" />
              </div>
              <div className="flex max-w-[220px] flex-col gap-2.5">
                <Skeleton className="aspect-[3/2] w-full rounded-lg" />
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </Panel>
            <Panel title="Tomt">
              <EmptyState compact icon={<Inbox />} title="Inget väntar" action={<Button size="sm">Visa godkända</Button>}>
                Alla filmer har ditt beslut.
              </EmptyState>
            </Panel>
            <Panel title="Fel">
              <ErrorState compact title="Labbet svarar inte" error="Klippbanken: Labbet svarar inte. Starta det med START.cmd." onRetry={() => void reload()} />
            </Panel>
          </div>
        </Section>

        <Section id="overlagg" title="Överlägg">
          <Panel>
            <Row label="Öppna">
              <Button onClick={() => setDialog(true)}>Dialog</Button>
              <Button onClick={() => setSheet(true)}>Sidopanel</Button>
              <Button onClick={() => toast({ tone: "ok", title: "Primär · sparat", detail: "Giv 01 är nu godkänd i stället för Primär." })}>Toast: sparat</Button>
              <Button onClick={() => toast({ tone: "bad", title: "Inte sparat", detail: "Posten har ändrats sedan den lästes." })}>Toast: fel</Button>
              <Button onClick={() => toast({ title: "Läser om klippbanken" })}>Toast: info</Button>
              <Tooltip content="Spela i scenen" kbd="Mellanslag">
                <Button variant="quiet">Hovra här</Button>
              </Tooltip>
            </Row>
          </Panel>
          <Dialog
            open={dialog}
            onOpenChange={setDialog}
            title="Återställa beslutet?"
            description="Giv 02 väntar då på ditt beslut igen, och anteckningen tas bort."
            footer={
              <>
                <Button variant="quiet" onClick={() => setDialog(false)}>
                  Avbryt
                </Button>
                <Button variant="danger" onClick={() => setDialog(false)}>
                  Återställ
                </Button>
              </>
            }
          />
          <Sheet
            open={sheet}
            onOpenChange={setSheet}
            title={sheetEdge ? edgeName(sheetEdge) : "A2.1 → P4C1"}
            subtitle={sheetEdge ? `${sheetEdge.takes.length} tagningar` : "Kanten"}
            footer={<Button onClick={() => setSheet(false)}>Klar</Button>}
          >
            <div className="flex flex-col gap-3">
              {sheetEdge
                ? sheetEdge.takes.map((t) => (
                    <TakeCard key={t.id} take={t} layout="row" selected={chosen === t.id} onSelect={() => setChosen(t.id)} />
                  ))
                : <Skeleton className="h-24" />}
            </div>
          </Sheet>
        </Section>

        <Section id="tagningar" title="Tagningar" note="Ur den riktiga klippbanken. Hovra över en bild för att skrubba i filmen.">
          {status === "error" ? (
            <ErrorState error={error} onRetry={() => void reload()} />
          ) : !samples.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="flex flex-col gap-2.5 rounded-lg border border-line bg-surface pb-3">
                  <Skeleton className="aspect-[3/2] w-full rounded-b-none rounded-t-[11px]" />
                  <Skeleton className="mx-3 h-3.5 w-2/3" />
                  <Skeleton className="mx-3 h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
                {samples.map((t) => (
                  <TakeCard
                    key={t.id}
                    take={t}
                    selected={chosen === t.id}
                    onSelect={() => setChosen(t.id)}
                    extra={<span className="text-faint">{edgeName(graph!.edge[t.edge])}</span>}
                    actions={
                      <>
                        <Button size="sm" variant="quiet">
                          Jämför
                        </Button>
                        <Button size="sm" variant="quiet" icon={<Play />}>
                          Spela
                        </Button>
                      </>
                    }
                  />
                ))}
              </div>
              <div className="grid items-start gap-4 lg:grid-cols-2">
                <Panel title="Rad" subtitle="layout=&quot;row&quot;, i listor och sidopaneler">
                  <div className="flex flex-col gap-2">
                    {samples.slice(0, 3).map((t) => (
                      <TakeCard key={t.id} take={t} layout="row" selected={chosen === t.id} onSelect={() => setChosen(t.id)} />
                    ))}
                  </div>
                </Panel>
                <Panel title="Bild ur filmen" subtitle="still=&quot;film&quot;: landningsrutan i stället för first.png">
                  <div className="grid grid-cols-2 gap-3">
                    {samples.slice(0, 2).map((t) => (
                      <div key={t.id} className="flex flex-col gap-1.5">
                        <TakeThumb take={t} still="film" />
                        <span className="text-xs text-faint">{takeName(t, graph!.edge[t.edge].takes)} · ruta {t.landingFrame ?? "mitten"}</span>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>
            </div>
          )}
        </Section>

        <Section id="beslut" title="Beslut" note="Demoläge: knapparna svarar men ingenting sparas härifrån.">
          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title={demoTake ? takeName(demoTake, graph!.edge[demoTake.edge].takes) : "Tagning"} subtitle={demoTake ? edgeName(graph!.edge[demoTake.edge]) : undefined}>
              {demoTake ? <DecisionBar take={demoTake} demo /> : <Skeleton className="h-28" />}
            </Panel>
            <Panel title="Inte klar" subtitle="en film som renderas: inget kan väljas">
              {demoTake ? <DecisionBar take={{ ...demoTake, stage: "ORDERED", revision: null }} /> : <Skeleton className="h-28" />}
            </Panel>
          </div>
        </Section>
      </div>
    </Page>
  );
}
