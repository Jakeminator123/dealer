"use client";

import { useEffect, useState } from "react";
import { MODELS, credits, stepOf } from "../../../src/order-model.ts";
import { asApiError } from "../../lib/api.ts";
import { referenceName } from "../../lib/bordet.ts";
import { labUrl } from "../../lib/lab.ts";
import { createOrder, orderLine, orderSaveFailure, previewOrder, type CreatedOrders, type Order, type OrderPreview as Preview, type OrderPreviewInput } from "../../lib/orders.ts";
import { Button, Sheet } from "../ui";
import { PictureCard } from "./Pictures";

function values(order: Order) {
  const { model, params } = order.generation;
  return [
    MODELS[model]?.label ?? model,
    typeof params.duration === "number" ? `${params.duration} s` : null,
    params.resolution ?? params.imageSize,
    `${order.takes} ${order.takes === 1 ? "tagning" : "tagningar"}`,
    `${credits(order.cost.total)} krediter`,
  ].filter(Boolean).join(" · ");
}

function differences(previous: Order, current: Order) {
  const media = (order: Order) => order.pictures.map(({ name, sha256 }) => [name, sha256]);
  const reference = (order: Order) => order.reference.status === "FINNS" ? [order.reference.clips, order.reference.sha256] : [order.reference.status];
  return [
    previous.prompt.sha256 !== current.prompt.sha256 ? "texten" : null,
    JSON.stringify(media(previous)) !== JSON.stringify(media(current)) ? "bilderna" : null,
    JSON.stringify(reference(previous)) !== JSON.stringify(reference(current)) ? "referensfilmen" : null,
  ].filter(Boolean).join(", ");
}

/**
 * Förhandsvisa: the drafts exactly as the server would save them (text, pictures, reference film, values), before they are
 * saved; "Skapa utkast" saves them and approves nothing. `note`: one line where nothing can be approved now (orderingState).
 */
export function OrderPreview({ input, names = {}, note = null, onClose, onCreated }: { input: OrderPreviewInput; names?: Record<string, string>; note?: string | null; onClose: () => void; onCreated: (answer: CreatedOrders) => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previous, setPrevious] = useState<Preview | null>(null);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{message: string; retrySave: boolean} | null>(null);

  useEffect(() => {
    let active = true;
    void previewOrder(input).then(
      (answer) => { if (active) { setPreview(answer); setLoading(false); } },
      (cause) => { if (active) { setError({message: asApiError(cause, "Förhandsvisningen").message, retrySave: false}); setLoading(false); } },
    );
    return () => { active = false; };
  }, [input, reload]);

  const refresh = () => {
    if (error?.retrySave) return;
    if (preview) setPrevious(preview);
    setPreview(null);
    setError(null);
    setLoading(true);
    setReload((count) => count + 1);
  };

  const save = async () => {
    if (!preview || saving || (error && !error.retrySave)) return;
    setSaving(true);
    setError(null);
    try {
      onCreated(await createOrder(input, preview.revision));
    } catch (cause) {
      setError(orderSaveFailure(cause));
    } finally {
      setSaving(false);
    }
  };

  const count = preview?.orders.length ?? 0;
  return (
    <Sheet
      open
      modal
      width={920}
      className="max-sm:w-screen!"
      onOpenChange={(open) => { if (!open && !saving) onClose(); }}
      title="Förhandsvisning av beställningen"
      footer={
        <>
          <Button variant="quiet" disabled={saving} onClick={onClose}>Tillbaka</Button>
          {error && !error.retrySave ? <Button variant="secondary" onClick={refresh}>Hämta ny förhandsvisning</Button> : null}
          <Button variant="primary" disabled={!count || loading || saving || (!!error && !error.retrySave)} loading={saving} onClick={() => void save()}>
            {error?.retrySave ? "Försök spara samma utkast igen" : count > 1 ? `Skapa ${count} utkast` : "Skapa utkast"}
          </Button>
        </>
      }
    >
      {note ? <p data-ordering className="mb-4 rounded-sm bg-[#3a2a1a] px-2.5 py-1.5 text-sm text-[#f0b07a]">{note} Utkasten kan sparas, men inget kan godkännas så länge.</p> : null}
      {loading ? <p role="status" className="text-sm text-dim">Hämtar texten och bilderna …</p> : null}
      {error ? <p role="alert" className="mb-4 text-sm text-[#f0b07a]">{error.message}{error.retrySave ? " Svaret saknas; utkastet kan redan vara sparat. Försök igen med samma underlag för att få tillbaka resultatet." : ""}</p> : null}
      <div className="flex flex-col gap-8">
        {preview?.orders.map((order, i) => {
          const before = previous?.orders[i];
          const changes = before ? differences(before, order) : "";
          const reference = order.reference.status === "FINNS" ? order.reference : null;
          return (
            <section key={order.id} className="flex flex-col gap-3">
              {/* his notation and the step's name, not the title the store builds (it still says "Ankare 1 → 2.1") */}
              <h3 className="flex flex-wrap items-baseline gap-x-2 text-md font-semibold text-ink">
                <span>{names[order.dealer] ?? order.dealer}</span>
                {orderLine(order) ? <span className="font-mono">{orderLine(order)}</span> : null}
                <span className="text-sm font-normal text-dim">{stepOf(order.step.key)?.label ?? order.step.label}</span>
              </h3>
              {before && values(before) !== values(order) ? <p className="text-sm text-dim">Förra förhandsvisningen · {values(before)}</p> : null}
              <p className="text-sm tabular-nums text-ink">{values(order)}</p>
              {changes ? <p className="text-sm text-brass-hi">Ändrat underlag · {changes}</p> : null}
              <div className="grid grid-cols-2 gap-2">
                {order.pictures.map((picture) => <PictureCard key={picture.name} picture={picture} />)}
              </div>
              {reference ? (
                <div className="flex flex-col gap-1.5">
                  <p className="text-sm text-ink">Referensfilm · {referenceName({ dealer: reference.dealer ?? order.dealer, edge: reference.from?.edge ?? `READY>${reference.goesTo}`, goesTo: reference.goesTo }, names)} · {String(reference.seconds).replace(".", ",")} s</p>
                  <video src={labUrl(reference.path)} controls muted playsInline preload="metadata" className="w-full rounded-md border border-line bg-well" />
                </div>
              ) : <p className="text-sm text-dim">Ingen referensfilm</p>}
              <p className="select-text whitespace-pre-wrap rounded-lg border border-line bg-well px-4 py-3 text-sm text-ink">{order.prompt.text}</p>
            </section>
          );
        })}
      </div>
    </Sheet>
  );
}
