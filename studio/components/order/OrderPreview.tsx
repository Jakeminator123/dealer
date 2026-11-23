"use client";

// The server's exact draft before it is saved (POST /api/orders/preview): the text, the pictures, the reference film and the
// values, as Bordet's guide Ny film shows them in Hur and Skicka (components/bordet/NewFilm.tsx). usePreview reads it again
// a moment after the order's body changes; useDraftSave saves it ("Spara utkastet") and approves nothing. An uncertain save
// (no answer: the draft may already be saved) is retried with the same body and revision, never a new one.
import { useEffect, useState } from "react";
import { MODELS, credits } from "../../../src/order-model.ts";
import { asApiError } from "../../lib/api.ts";
import { referenceName } from "../../lib/bordet.ts";
import { labUrl } from "../../lib/lab.ts";
import { createOrder, orderSaveFailure, picturesInOrder, previewOrder, type CreatedOrders, type NewOrderInput, type Order, type OrderPreview as Preview } from "../../lib/orders.ts";
import { PictureCard } from "./Pictures";

/** "Kling 2.1 · 5 s · 1080p · 2 tagningar · 128 krediter": what the draft is made with, and its price. */
export function previewValues(order: Order): string {
  const { model, params } = order.generation;
  return [
    MODELS[model]?.label ?? model,
    typeof params.duration === "number" ? `${params.duration} s` : null,
    params.resolution ?? params.imageSize,
    `${order.takes} ${order.takes === 1 ? "tagning" : "tagningar"}`,
    `${credits(order.cost.total)} krediter`,
  ].filter(Boolean).join(" · ");
}

/** A moment after the last change, so that a click through the recipe's choices asks the server once. */
const SETTLE_MS = 350;

/** The draft as the server would save it, for `input` (null: nothing to read). loading: an answer for this input is on its way. */
export function usePreview(input: NewOrderInput | null): { preview: Preview | null; error: string | null; loading: boolean; reload: () => void } {
  const key = input ? JSON.stringify(input) : null;
  const [round, setRound] = useState(0);
  const [got, setGot] = useState<{ key: string; round: number; preview: Preview | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!key) return;
    let live = true;
    const wait = setTimeout(() => {
      void previewOrder(JSON.parse(key) as NewOrderInput).then(
        (preview) => live && setGot({ key, round, preview, error: null }),
        (cause) => live && setGot({ key, round, preview: null, error: asApiError(cause, "Förhandsvisningen").message }),
      );
    }, SETTLE_MS);
    return () => {
      live = false;
      clearTimeout(wait);
    };
  }, [key, round]);
  const now = got && got.key === key && got.round === round ? got : null;
  return { preview: now?.preview ?? null, error: now?.error ?? null, loading: !!key && !now, reload: () => setRound((n) => n + 1) };
}

/** Saving a previewed draft. failure.frozen: the body and revision an uncertain save is retried with. */
export function useDraftSave(onCreated: (answer: CreatedOrders) => void) {
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<{ message: string; frozen: { input: NewOrderInput; revision: string } | null } | null>(null);
  const save = async (input: NewOrderInput, revision: string) => {
    if (saving) return;
    const use = failure?.frozen ?? { input, revision };
    setSaving(true);
    setFailure(null);
    try {
      onCreated(await createOrder(use.input, use.revision));
    } catch (cause) {
      const f = orderSaveFailure(cause);
      setFailure({ message: f.message, frozen: f.retrySave ? use : null });
    } finally {
      setSaving(false);
    }
  };
  return { save, saving, failure };
}

/** The pictures the draft sends (not a reference picture), large, each with what it is and where it comes from. */
export function PreviewPictures({ order }: { order: Order }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {picturesInOrder(order.pictures)
        .filter((p) => p.goesAs !== "referenceImage")
        .map((picture) => (
          <PictureCard key={picture.name} picture={picture} />
        ))}
    </div>
  );
}

/** Everything the draft sends: its values and price, the pictures, the reference film and the text word for word. */
export function PreviewOrder({ order, names }: { order: Order; names: Record<string, string> }) {
  const reference = order.reference.status === "FINNS" ? order.reference : null;
  return (
    <section data-preview className="flex flex-col gap-3">
      <p data-values className="text-sm tabular-nums text-ink">{previewValues(order)}</p>
      <PreviewPictures order={order} />
      {reference ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm text-ink">
            Referensfilm · {referenceName({ dealer: reference.dealer ?? order.dealer, edge: reference.from?.edge ?? `READY>${reference.goesTo}`, goesTo: reference.goesTo }, names)} · {String(reference.seconds).replace(".", ",")} s
          </p>
          <video src={labUrl(reference.path)} controls muted playsInline preload="metadata" className="w-full rounded-md border border-line bg-well" />
        </div>
      ) : (
        <p className="text-sm text-dim">Ingen referensfilm</p>
      )}
      <p className="select-text whitespace-pre-wrap rounded-lg border border-line bg-well px-4 py-3 text-sm text-ink">{order.prompt.text}</p>
    </section>
  );
}
