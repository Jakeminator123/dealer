"use client";

// The bar over the scene: the presets as chips (the one the scene is exactly now is filled; the one the look started from
// says "ändrad" when something has been changed since), "Spara som…" for his own, "Jämför med basgrund" that shows the
// baseline while it is held (or while B is held), and "Återställ allt". His own presets can be taken away; the three that
// ship with the lab cannot. In the online copy nothing is saved and those buttons are not there.
import { Eye, Plus, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { asApiError } from "../../lib/api.ts";
import { ABOUT_LIMIT, LABEL_LIMIT, isShipped, slugOf } from "../../lib/scene-presets.ts";
import { Button, Dialog, Kbd, TextArea, TextField, Tooltip, cn, useToast } from "../ui";
import type { Preset } from "./presetApi.ts";

export function PresetBar({
  presets,
  active,
  origin,
  changed,
  canSave,
  comparing,
  onPick,
  onSave,
  onDelete,
  onCompare,
  onResetAll,
}: {
  presets: Preset[];
  /** The preset the scene is exactly now, if any. */
  active: string | null;
  /** The preset the look started from. */
  origin: string;
  changed: boolean;
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
  const [doomed, setDoomed] = useState<Preset | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-line bg-canvas px-3">
      <span className="pr-1 text-2xs font-semibold uppercase tracking-[0.09em] text-faint">Förval</span>
      <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
        {presets.map((p) => {
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
      <div className="ml-auto flex shrink-0 items-center gap-1.5 pl-2">
        <Tooltip content="Visar basgrunden så länge du håller knappen (eller B)" kbd="B">
          <Button
            size="sm"
            variant="secondary"
            icon={<Eye />}
            aria-pressed={comparing}
            disabled={active === "basgrund"}
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
        <Button size="sm" variant="quiet" icon={<RotateCcw />} onClick={onResetAll} disabled={active === "basgrund"}>
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
