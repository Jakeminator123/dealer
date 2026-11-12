"use client";

// <AddDialog open onOpenChange dealers dealer onAdded />: "Lägg till bild": dealer, role (ingångsbild, keystone or one of
// the three anchors), a name and the file. The picture and its size are shown before anything is sent, an anchor that is
// not the bank's frame is warned about, and the folder it will get is said. It is sent on the click (POST /api/media),
// lands as a candidate, and is never written over another picture.
import { ImagePlus, TriangleAlert } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { asApiError } from "../../lib/api.ts";
import { ROLE_LABEL, UPLOAD_LIMIT, UPLOAD_ROLES, folderName, sizeWarning, uploadTarget, type Entry, type UploadRole } from "../../lib/media.ts";
import { formatBytes } from "../../lib/proofs.ts";
import { Button, Dialog, SegmentedControl, Select, TextField, cn, useToast } from "../ui";
import { addPicture } from "./client.ts";

type Picked = { file: File; url: string; width: number; height: number } | null;

export function AddDialog({
  open,
  onOpenChange,
  dealers,
  dealer: initialDealer,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealers: readonly { id: string; name: string }[];
  dealer: string;
  onAdded: (entry: Entry, dealer: string) => void;
}) {
  const toast = useToast();
  const fileId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [dealer, setDealer] = useState(initialDealer);
  const [role, setRole] = useState<UploadRole>("keystone");
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<Picked>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A fresh dialog each time it opens, for the dealer on screen.
  useEffect(() => {
    if (!open) return;
    setDealer(initialDealer);
    setTitle("");
    setPicked(null);
    setProblem(null);
  }, [open, initialDealer]);
  useEffect(() => () => void (picked && URL.revokeObjectURL(picked.url)), [picked]);

  const choose = (file: File | undefined) => {
    setProblem(null);
    if (!file) return;
    if (file.type !== "image/png" && file.type !== "image/jpeg") return setProblem("Bara PNG eller JPEG.");
    if (file.size > UPLOAD_LIMIT) return setProblem(`Bilden är ${formatBytes(file.size)}; högst ${UPLOAD_LIMIT / 1048576} MB.`);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setPicked({ file, url, width: img.naturalWidth, height: img.naturalHeight });
      setTitle((t) => t || file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " "));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setProblem("Bilden gick inte att läsa.");
    };
    img.src = url;
  };

  const name = folderName(title, dealer);
  const target = picked && name ? uploadTarget(dealer, role, name, picked.file.type === "image/png" ? "png" : "jpeg") : null;
  const warning = picked ? sizeWarning(role, picked.width, picked.height) : null;
  const ready = !!picked && !!name && !busy;

  const send = async () => {
    if (!picked || !name) return;
    setBusy(true);
    setProblem(null);
    try {
      const { entry } = await addPicture(picked.file, { dealer, role, name, title: title.trim() });
      toast({ tone: "ok", title: "Bilden är tillagd", detail: `${entry.name} · ${ROLE_LABEL[entry.role]} · kandidat` });
      onOpenChange(false);
      onAdded(entry, dealer);
    } catch (error) {
      setProblem(asApiError(error, "Bilden").message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      width={560}
      title="Lägg till bild"
      description={`PNG eller JPEG, högst ${UPLOAD_LIMIT / 1048576} MB. Den blir kandidat tills du säger annat, och ingen bild skrivs över.`}
      footer={
        <>
          <Button variant="quiet" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button variant="primary" disabled={!ready} loading={busy} onClick={() => void send()}>
            Lägg till
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-dim">Dealer</span>
            <SegmentedControl label="Dealer" value={dealer} onChange={setDealer} options={dealers.map((d) => ({ value: d.id, label: d.name }))} />
          </div>
          <Select label="Roll" value={role} onChange={(v) => setRole(v as UploadRole)} options={UPLOAD_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} className="w-44" />
        </div>
        <TextField
          label="Namn"
          value={title}
          maxLength={60}
          placeholder="Till exempel: Sittande B, ljusare"
          onChange={(event) => setTitle(event.target.value)}
          hint={target ? <span className="font-mono">{target.path}</span> : "Mappens namn görs av det du skriver."}
        />
        <input ref={input} id={fileId} type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(event) => choose(event.target.files?.[0])} />
        {picked ? (
          <div className="flex gap-4">
            <button type="button" onClick={() => input.current?.click()} className="relative h-44 w-64 shrink-0 overflow-hidden rounded-md border border-line bg-well" aria-label="Välj en annan bild">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local file before it is sent */}
              <img src={picked.url} alt="" className="size-full object-contain" />
            </button>
            <div className="flex min-w-0 flex-col gap-1.5 text-sm">
              <span className="truncate text-ink" title={picked.file.name}>
                {picked.file.name}
              </span>
              <span className="text-lg font-semibold tabular-nums text-ink">
                {picked.width} × {picked.height}
              </span>
              <span className="text-dim">{formatBytes(picked.file.size)}</span>
              <button type="button" onClick={() => input.current?.click()} className="mt-auto w-fit text-xs text-brass-hi hover:underline">
                Välj en annan
              </button>
            </div>
          </div>
        ) : (
          <label
            htmlFor={fileId}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              choose(event.dataTransfer.files?.[0]);
            }}
            className="flex h-36 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line-strong bg-well text-dim transition-colors hover:border-brass/60 hover:text-ink"
          >
            <ImagePlus className="size-6" />
            <span className="text-sm">Välj en bild, eller släpp den här</span>
          </label>
        )}
        {warning ? (
          <p className="flex items-start gap-2 rounded-md border border-anmarkning/35 bg-anmarkning/10 px-3 py-2 text-sm text-[#f0b07a]">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            {warning}
          </p>
        ) : null}
        {problem ? (
          <p role="alert" className={cn("rounded-md border border-underkand/35 bg-underkand/10 px-3 py-2 text-sm text-[#ef8b8b]")}>
            {problem}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
