// <StatusChip status="planerad" />: a request's status as a chip, colour and sign (components/requests/status.ts).
// <KindChip typ="fel" />: what kind of request it is, quiet.
import type { RequestKind, RequestStatus } from "../../lib/bot-client.ts";
import { Badge, type BadgeTone } from "../ui/Badge";
import { KIND, STATUS, type Tone } from "./status";

const TONE: Record<Tone, BadgeTone> = { wait: "wait", neutral: "neutral", variant: "variant", ok: "ok", bad: "bad", remark: "remark" };

export function StatusChip({ status, size = "md" }: { status: RequestStatus; size?: "sm" | "md" }) {
  const s = STATUS[status];
  return (
    <Badge tone={TONE[s.tone]} size={size} title={s.hint}>
      <span aria-hidden>{s.sign}</span>
      {s.label}
    </Badge>
  );
}

export function KindChip({ typ }: { typ: RequestKind }) {
  return (
    <span title={KIND[typ].hint} className="inline-flex h-[22px] shrink-0 items-center rounded-sm border border-line bg-canvas/60 px-1.5 text-2xs font-medium uppercase tracking-[0.06em] text-dim">
      {KIND[typ].label}
    </span>
  );
}
