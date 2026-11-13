"use client";

// The bar over the scene, left to right. His presets as chips: the one the scene is exactly now is filled, the one the
// look started from says "ändrad" when something has been changed since, and "Spara som…" saves one of his own. Then his
// ten places, Profilval 1–10 (Jakob 2026-11-13), as small numbered chips: solid when the place holds a look, a dashed
// outline when it is empty. A place is the preset profilval-<n> (lib/scene-presets.ts, slotOf) and shows only there, never
// among the named chips. A click on a filled place loads it (it becomes the look's origin, as a preset chip does); a click
// on an empty one, or on the save button after the row, opens "Spara i profilval", where he picks the place: "Spara i 4"
// fills an empty one, "Skriv över 3" a filled one against the revision last read (so no stray click in the bar writes over
// a place), and "Töm 3" empties it. When the look started from a place and has been changed since, that chip carries a
// brass dot and "Återställ" beside the row takes the look back to what the place holds, in one click. Last: how many keys
// differ from basgrund, "Jämför med basgrund" that shows the baseline while it is held (or while B is held), and
// "Återställ allt". His own presets can be taken away; the three that ship with the lab cannot. In the online copy nothing
// is saved: those buttons are not there, and the places show only when one of them holds a look.
import { Eye, Plus, RotateCcw, Save, X } from "lucide-react";
import { useState } from "react";
import { asApiError } from "../../lib/api.ts";
import { isSnapshot } from "../../lib/mode.ts";
import { ABOUT_LIMIT, LABEL_LIMIT, isShipped, slotLabel, slotName, slotOf, slotToSave, slotsOf, slugOf } from "../../lib/scene-presets.ts";
import { Button, Dialog, IconButton, Kbd, TextArea, TextField, Tooltip, cn, useToast } from "../ui";
import type { Preset } from "./presetApi.ts";

export function PresetBar({
  presets,
  listed,
  active,
  origin,
  changed,
  differ = null,
  canSave,
  comparing,
  onPick,
  onSave,
  onDelete,
  onCompare,
  onResetAll,
}: {
  presets: Preset[];
  /** The lab's list has been read (or could not be): until then a place cannot be told empty. */
  listed: boolean;
  /** The preset the scene is exactly now, if any. */
  active: string | null;
  /** The preset the look started from. */
  origin: string;
  changed: boolean;
  /** How many keys differ from basgrund; null while the scene is not there. */
  differ?: number | null;
  canSave: boolean;
  comparing: boolean;
  onPick: (name: string) => void;
  onSave: (name: string, label: string, about: string, revision: string | null) => Promise<void>;
  onDelete: (preset: Preset) => Promise<void>;
  onCompare: (on: boolean) => void;
  onResetAll: () => void;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [placing, setPlacing] = useState<{ first: number | null } | null>(null);
  const [doomed, setDoomed] = useState<Preset | null>(null);
  const [busy, setBusy] = useState(false);
  const named = presets.filter((p) => slotOf(p.name) === null);
  const slots = slotsOf(presets);
  const fromSlot = slotOf(origin);
  const showSlots = !isSnapshot || slots.some(Boolean);
  return (
    <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-line bg-canvas px-3">
      <span className="hidden pr-1 text-2xs font-semibold uppercase tracking-[0.09em] text-faint 2xl:inline">Förval</span>
      <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
        {named.map((p) => {
          const on = active === p.name;
          const from = !on && origin === p.name && changed;
          return (
            <span key={p.name} className="group/chip relative inline-flex shrink-0">
              <Tooltip content={<span className="block max-w-[300px]">{p.about || p.label}</span>} side="bottom">
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onPick(p.name)}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-[background-color,border-color,color] duration-150",
                    on
                      ? "border-brass/60 bg-brass/15 text-brass-hi"
                      : from
                        ? "border-brass/35 border-dashed text-ink hover:bg-raised"
                        : "border-line-strong text-dim hover:border-[#3a4840] hover:text-ink",
                    !p.shipped && canSave && "pr-7",
                  )}
                >
                  {p.name === "basgrund" ? <span aria-hidden className="size-1.5 rounded-full bg-current opacity-70" /> : null}
                  {p.label}
                  {from ? <span className="text-xs font-normal text-faint">· ändrad</span> : null}
                </button>
              </Tooltip>
              {!p.shipped && canSave ? (
                <button
                  type="button"
                  aria-label={`Ta bort ${p.label}`}
                  title={`Ta bort ${p.label}`}
                  onClick={() => setDoomed(p)}
                  className="absolute right-1.5 top-1/2 grid size-4.5 -translate-y-1/2 place-items-center rounded-full text-faint opacity-60 transition-opacity hover:bg-overlay hover:text-ink group-hover/chip:opacity-100"
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </span>
          );
        })}
        {canSave ? (
          <Button size="sm" variant="quiet" icon={<Plus />} onClick={() => setSaving(true)} className="shrink-0">
            Spara som…
          </Button>
        ) : null}
      </div>

      {showSlots ? (
        <div role="group" aria-label="Profilval" className="flex shrink-0 items-center gap-1 border-l border-line pl-2">
          {slots.map((p, i) => {
            const n = i + 1;
            const name = slotName(n);
            const on = !!p && (active === name || (origin === name && !changed));
            const from = !!p && !on && origin === name && changed;
            return (
              <Tooltip
                key={n}
                side="bottom"
                content={p ? <span className="block max-w-[300px]">{p.about ? `${p.label}: ${p.about}` : p.label}</span> : `${slotLabel(n)} · tom`}
              >
                <button
                  type="button"
                  aria-pressed={p ? on : undefined}
                  aria-label={p ? (from ? `${p.label}, ändrad` : p.label) : `${slotLabel(n)}, tom`}
                  disabled={!listed || (!p && !canSave)}
                  onClick={() => (p ? onPick(name) : setPlacing({ first: n }))}
                  className={cn(
                    "relative inline-flex h-7 min-w-6 items-center justify-center rounded-md border px-1 text-sm font-semibold tabular-nums transition-[background-color,border-color,color,opacity] duration-150 disabled:cursor-default disabled:opacity-45",
                    on
                      ? "border-brass/60 bg-brass/15 text-brass-hi"
                      : p
                        ? cn("bg-raised text-ink not-disabled:hover:bg-overlay", from ? "border-brass/45" : "border-line-strong not-disabled:hover:border-[#3a4840]")
                        : "border-dashed border-line-strong font-medium text-faint not-disabled:hover:text-dim",
                  )}
                >
                  {n}
                  {from ? <span aria-hidden className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-brass" /> : null}
                </button>
              </Tooltip>
            );
          })}
          {canSave ? <IconButton size="sm" label="Spara i profilval" icon={<Save />} disabled={!listed} onClick={() => setPlacing({ first: slotToSave(origin, slots) })} /> : null}
          {fromSlot && slots[fromSlot - 1] && changed ? (
            <Tooltip content={`Tillbaka till ${slotLabel(fromSlot)} som det sparades`} side="bottom">
              <Button size="sm" variant="quiet" icon={<RotateCcw />} onClick={() => onPick(origin)}>
                Återställ
              </Button>
            </Tooltip>
          ) : null}
        </div>
      ) : null}

      <div className="ml-auto flex shrink-0 items-center gap-1.5 pl-2">
        {differ ? (
          <span className="whitespace-nowrap pr-1 text-sm tabular-nums text-brass-hi" title="Reglage som skiljer sig från basgrunden; de har en mässingsprick i panelen">
            {differ} reglage skiljer sig
          </span>
        ) : null}
        <Tooltip content="Visar basgrunden så länge du håller knappen (eller B)" kbd="B">
          <Button
            size="sm"
            variant="secondary"
            icon={<Eye />}
            aria-pressed={comparing}
            disabled={active === "basgrund" || differ === null}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              onCompare(true);
            }}
            onPointerUp={() => onCompare(false)}
            onPointerCancel={() => onCompare(false)}
            onLostPointerCapture={() => onCompare(false)}
            onKeyDown={(e) => {
              if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                e.preventDefault();
                onCompare(true);
              }
            }}
            onKeyUp={(e) => {
              if (e.key === " " || e.key === "Enter") onCompare(false);
            }}
            onBlur={() => onCompare(false)}
          >
            Jämför med basgrund
          </Button>
        </Tooltip>
        <Button size="sm" variant="quiet" icon={<RotateCcw />} onClick={onResetAll} disabled={active === "basgrund" || differ === null}>
          Återställ allt
        </Button>
      </div>

      {saving ? (
        <SaveDialog
          presets={presets}
          onClose={() => setSaving(false)}
          onSave={async (name, label, about, revision) => {
            await onSave(name, label, about, revision);
            setSaving(false);
          }}
        />
      ) : null}
      {placing ? (
        <PlaceDialog
          slots={slots}
          first={placing.first}
          onClose={() => setPlacing(null)}
          onSave={async (n, was) => {
            await onSave(slotName(n), was?.label ?? slotLabel(n), was?.about ?? "", was?.revision ?? null);
            setPlacing(null);
          }}
          onEmpty={async (was) => {
            await onDelete(was);
            toast({ tone: "ok", title: `${was.label} är tömt` });
            setPlacing(null);
          }}
        />
      ) : null}
      <Dialog
        open={!!doomed}
        onOpenChange={(open) => !open && setDoomed(null)}
        title={`Ta bort ${doomed?.label ?? ""}?`}
        description="Förvalet försvinner ur labbet. Scenen på skärmen ändras inte."
        footer={
          <>
            <Button variant="quiet" onClick={() => setDoomed(null)}>
              Avbryt
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={async () => {
                if (!doomed) return;
                setBusy(true);
                try {
                  await onDelete(doomed);
                  toast({ tone: "ok", title: `${doomed.label} är borttaget` });
                  setDoomed(null);
                } catch (error) {
                  toast({ tone: "bad", title: "Kunde inte ta bort", detail: asApiError(error).message });
                } finally {
                  setBusy(false);
                }
              }}
            >
              Ta bort
            </Button>
          </>
        }
      />
    </div>
  );
}

/** "Spara i profilval": the ten places to pick from, the one offered first chosen; the main button says what it does. */
function PlaceDialog({
  slots,
  first,
  onClose,
  onSave,
  onEmpty,
}: {
  slots: (Preset | null)[];
  first: number | null;
  onClose: () => void;
  onSave: (n: number, was: Preset | null) => Promise<void>;
  onEmpty: (was: Preset) => Promise<void>;
}) {
  const [chosen, setChosen] = useState<number | null>(first);
  const [busy, setBusy] = useState<"save" | "empty" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const was = chosen ? slots[chosen - 1] : null;
  const run = async (what: "save" | "empty") => {
    if (!chosen || busy) return;
    setBusy(what);
    setError(null);
    try {
      if (what === "save") await onSave(chosen, was);
      else if (was) await onEmpty(was);
    } catch (e) {
      setError(asApiError(e, "Profilvalet").message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Spara i profilval"
      description="Alla reglage som de står nu. Föremålen på bordet och kortens material följer inte med."
      width={400}
      footer={
        <>
          {was ? (
            <Button variant="danger" className="mr-auto" loading={busy === "empty"} disabled={!!busy && busy !== "empty"} onClick={() => void run("empty")}>
              Töm {chosen}
            </Button>
          ) : null}
          <Button variant="quiet" onClick={onClose}>
            Avbryt
          </Button>
          <Button variant="primary" autoFocus loading={busy === "save"} disabled={!chosen || (!!busy && busy !== "save")} onClick={() => void run("save")}>
            {chosen ? (was ? `Skriv över ${chosen}` : `Spara i ${chosen}`) : "Välj en plats"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-5 gap-2">
        {slots.map((p, i) => {
          const n = i + 1;
          const on = chosen === n;
          return (
            <button
              key={n}
              type="button"
              aria-pressed={on}
              aria-label={p ? `${slotLabel(n)}, sparad` : `${slotLabel(n)}, tom`}
              title={p ? (p.about ? `${p.label}: ${p.about}` : p.label) : `${slotLabel(n)} · tom`}
              onClick={() => {
                setChosen(n);
                setError(null);
              }}
              className={cn(
                "inline-flex h-11 items-center justify-center rounded-md border text-md tabular-nums transition-[background-color,border-color,color] duration-150",
                p ? "font-semibold" : "border-dashed font-medium",
                on ? "border-brass bg-brass/15 text-brass-hi" : p ? "border-line-strong bg-raised text-ink hover:bg-overlay" : "border-line-strong text-faint hover:text-dim",
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
      {error ? <p className="mt-3 text-xs text-[#ef8b8b]">{error}</p> : null}
    </Dialog>
  );
}

function SaveDialog({
  presets,
  onClose,
  onSave,
}: {
  presets: Preset[];
  onClose: () => void;
  onSave: (name: string, label: string, about: string, revision: string | null) => Promise<void>;
}) {
  const [label, setLabel] = useState("");
  const [about, setAbout] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = slugOf(label);
  const existing = presets.find((p) => p.name === name) ?? null;
  const taken = isShipped(name);
  const problem = !label.trim() ? null : !name ? "Namnet behöver minst en bokstav eller siffra." : taken ? "Det namnet har ett förval som följer med labbet. Välj ett annat." : null;
  const submit = async () => {
    if (!name || taken || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(name, label.trim(), about.trim(), existing?.revision ?? null);
    } catch (e) {
      setError(asApiError(e, "Förvalet").message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Spara som förval"
      description="Alla reglage som de står nu. Föremålen på bordet och kortens material följer inte med."
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            Avbryt
          </Button>
          <Button variant="primary" loading={busy} disabled={!name || taken} onClick={() => void submit()}>
            {existing ? "Skriv över" : "Spara"}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <TextField
          label="Namn"
          autoFocus
          maxLength={LABEL_LIMIT}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Kväll i skogen"
          error={problem ?? error ?? undefined}
          hint={name ? (existing ? `Finns redan: ${existing.label} skrivs över` : `Sparas som ${name}`) : undefined}
        />
        <TextArea label="Om förvalet" rows={2} maxLength={ABOUT_LIMIT} value={about} onChange={(e) => setAbout(e.target.value)} placeholder="Valfritt: vad du ville se" />
        <p className="flex items-center gap-1.5 text-xs text-faint">
          <Kbd>Enter</Kbd> sparar
        </p>
      </form>
    </Dialog>
  );
}
