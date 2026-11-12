"use client";

// The request card in the panel: what goes to Jakob, every part editable before it goes. His own words, the kind and the
// heading; the bot's summary and suggestion set apart and marked as the bot's (they can be taken away, not rewritten);
// the view it concerns and the picture. Nothing is sent until "Skicka till Jakob" is pressed. The first time it asks
// "Vem är du?" and keeps the name in this browser.
import { ArrowLeft, Eye, Pencil, Sparkles, X } from "lucide-react";
import type { RequestKind } from "../../lib/bot-client.ts";
import { useBot } from "../bot/BotProvider";
import { contextLine } from "../bot/describe";
import { PictureMenu } from "../bot/PictureMenu";
import { Button } from "../ui/Button";
import { cn } from "../ui/cn";
import { SegmentedControl } from "../ui/SegmentedControl";
import { Skeleton } from "../ui/States";
import { TextArea, TextField } from "../ui/TextField";
import { KIND, KIND_ORDER, headingFrom } from "./status";

function BotPart({ title, text, onRemove }: { title: string; text: string; onRemove: () => void }) {
  return (
    <div className="flex flex-col gap-1 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-2xs font-semibold uppercase tracking-[0.08em] text-faint">{title}</span>
        <button type="button" onClick={onRemove} aria-label={`Ta bort ${title.toLowerCase()}`} title="Ta bort" className="ml-auto grid size-6 place-items-center rounded-xs text-faint hover:bg-overlay hover:text-ink">
          <X className="size-3.5" />
        </button>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-5 text-[#cfd6d2]">{text}</p>
    </div>
  );
}

export function RequestCard() {
  const bot = useBot()!;
  const form = bot.request!;
  const drafting = form.phase === "utkast";
  const known = bot.name.trim().length > 0;
  const tried = form.tried;
  const missingName = !known && !form.vem.trim();
  const missingWords = !form.text.trim() && !form.sammanfattning.trim();

  return (
    <div className="flex flex-col gap-4 pb-2 pt-3">
      <div className="flex items-start gap-2">
        <button type="button" onClick={bot.cancelRequest} aria-label="Tillbaka till samtalet" title="Tillbaka till samtalet" className="-ml-1.5 grid size-8 shrink-0 place-items-center rounded-md text-dim hover:bg-raised hover:text-ink">
          <ArrowLeft className="size-4" />
        </button>
        <div className="flex min-w-0 flex-col gap-0.5 pt-1">
          <h2 className="font-display text-lg font-semibold leading-6 text-ink">Till Jakob</h2>
          <p className="text-xs text-faint">Inget skickas förrän du trycker Skicka till Jakob.</p>
        </div>
      </div>

      {known ? (
        <p className="flex items-center gap-1.5 text-sm text-dim">
          Från <span className="font-medium text-ink">{bot.name}</span>
          <button
            type="button"
            onClick={() => {
              bot.updateRequest({ vem: bot.name });
              bot.setName("");
            }}
            className="text-xs text-faint underline decoration-line-strong underline-offset-2 hover:text-ink">
            byt
          </button>
        </p>
      ) : (
        <TextField
          label="Vem är du?"
          value={form.vem}
          onChange={(e) => bot.updateRequest({ vem: e.target.value })}
          placeholder="Ditt namn"
          maxLength={60}
          autoComplete="name"
          hint="Sparas i den här webbläsaren, så frågar vi bara en gång."
          error={tried && missingName ? "Skriv ditt namn, så vet Jakob vem som frågar." : undefined}
        />
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-sm text-dim">Det gäller</span>
        <SegmentedControl<RequestKind>
          label="Slag"
          value={form.typ}
          onChange={(typ) => bot.updateRequest({ typ })}
          options={KIND_ORDER.map((k) => ({ value: k, label: KIND[k].label, title: KIND[k].hint }))}
          className="self-start"
        />
      </div>

      {drafting ? (
        <div className="flex flex-col gap-1.5" aria-busy>
          <span className="text-sm text-dim">Rubrik</span>
          <Skeleton className="h-8 w-full" />
        </div>
      ) : (
        <TextField label="Rubrik" value={form.rubrik} maxLength={120} onChange={(e) => bot.updateRequest({ rubrik: e.target.value })} placeholder={headingFrom(form.text) || "Kort, vad det gäller"} />
      )}

      <TextArea
        label="Med dina ord"
        value={form.text}
        rows={3}
        maxLength={4000}
        onChange={(e) => bot.updateRequest({ text: e.target.value })}
        placeholder="Vad du ser, vad du vill, eller vad du undrar."
        error={tried && missingWords ? "Skriv några ord om vad det gäller." : undefined}
      />

      {drafting ? (
        <div className="flex flex-col gap-2 rounded-lg border border-line bg-canvas/50 px-3 py-3" aria-busy>
          <span className="flex items-center gap-1.5 text-xs text-dim">
            <Sparkles className="size-3.5 animate-pulse text-dim" /> Boten skriver ett utkast…
          </span>
          <Skeleton className="h-3 w-11/12" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-5/6" />
        </div>
      ) : form.sammanfattning || form.forslag ? (
        <div className="overflow-hidden rounded-lg border border-line bg-canvas/50">
          <div className="flex items-center gap-1.5 border-b border-line bg-raised/40 px-3 py-1.5 text-xs text-dim">
            <Sparkles className="size-3.5" /> Från boten
          </div>
          {form.sammanfattning ? <BotPart title="Sammanfattning" text={form.sammanfattning} onRemove={() => bot.updateRequest({ sammanfattning: "" })} /> : null}
          {form.forslag ? (
            <div className={cn(form.sammanfattning && "border-t border-line")}>
              <BotPart title="Förslag" text={form.forslag} onRemove={() => bot.updateRequest({ forslag: "" })} />
            </div>
          ) : null}
        </div>
      ) : form.note ? (
        <p className="text-xs text-faint">{form.note}</p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <span className="text-sm text-dim">Vyn</span>
        {form.vy ? (
          <span className="inline-flex max-w-full items-center gap-1.5 self-start rounded-full border border-line-strong bg-raised py-0.5 pl-2.5 pr-1 text-xs text-ink">
            <Eye className="size-3.5 shrink-0 text-dim" />
            <span className="truncate">{contextLine(form.vy.namn, form.vy.val, 3)}</span>
            <button type="button" aria-label="Ta bort vyn" title="Ta bort vyn" onClick={() => bot.updateRequest({ vy: null })} className="grid size-5 shrink-0 place-items-center rounded-full text-faint hover:bg-overlay hover:text-ink">
              <X className="size-3" />
            </button>
          </span>
        ) : (
          <span className="text-xs text-faint">Ingen vy följer med.</span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm text-dim">Bild</span>
        {form.bild ? (
          <div className="flex items-end gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={form.bild.url} alt="Bilden som följer med" className="max-h-36 w-auto max-w-[75%] rounded-md border border-line object-contain" />
            <div className="flex flex-col gap-1">
              {form.bild.blob.size ? (
                <button type="button" onClick={() => bot.editPicture(form.bild!, "onskemal")} className="inline-flex h-7 items-center gap-1 rounded-sm px-2 text-xs font-medium text-dim hover:bg-raised hover:text-ink">
                  <Pencil className="size-3.5" /> Rita
                </button>
              ) : null}
              <button type="button" onClick={() => bot.updateRequest({ bild: null })} className="inline-flex h-7 items-center gap-1 rounded-sm px-2 text-xs font-medium text-dim hover:bg-raised hover:text-ink">
                <X className="size-3.5" /> Ta bort
              </button>
            </div>
          </div>
        ) : (
          <PictureMenu label="Lägg till bild" busy={bot.taking} onPick={(choice) => void bot.takePicture(choice, "onskemal")} className="self-start" />
        )}
      </div>
    </div>
  );
}

/** The card's two buttons, for the bottom of the panel. */
export function RequestActions() {
  const bot = useBot()!;
  const form = bot.request!;
  const sending = form.phase === "skickar";
  return (
    <div className="flex items-center justify-end gap-2">
      <Button variant="quiet" onClick={bot.cancelRequest} disabled={sending}>
        Avbryt
      </Button>
      <Button variant="primary" loading={sending} disabled={form.phase === "utkast"} onClick={() => void bot.submitRequest()}>
        Skicka till Jakob
      </Button>
    </div>
  );
}
