"use client";

// The online copy's first visit: once per browser, "Välkommen till dealerstudion", three lines on what this is, and four
// ways in: play a round, the map, the proofs, ask or give feedback (opens the panel). Words from lib/guide.ts.
import { ArrowRight, FlaskConical, MessageCircleQuestion, Play, Workflow } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { FRAGA, WELCOME, guideOf } from "../../lib/guide.ts";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { useBot } from "./BotProvider";
import { KEYS, readText, writeText } from "./storage";

const HINT: Record<string, string> = {
  spela: "Dealern delar ut, i 3D eller som film",
  karta: "Varje steg mellan två lägen, med omdöme",
  prov: "Jämförelser och kontaktark",
  fraga: "Boten svarar; Jakob får dina önskemål",
};

function Way({ icon, title, hint, href, onClick }: { icon: ReactNode; title: string; hint: string; href?: string; onClick: () => void }) {
  const body = (
    <>
      <span className="grid size-9 shrink-0 place-items-center rounded-md border border-line-strong bg-well text-dim transition-colors group-hover:text-ink [&_svg]:size-[18px]">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium text-ink">{title}</span>
        <span className="text-xs text-dim">{hint}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-faint transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-dim" />
    </>
  );
  const cls = "group flex items-center gap-3 rounded-lg border border-line bg-raised/50 px-3 py-3 text-left transition-colors hover:border-line-strong hover:bg-raised";
  return href ? (
    <Link href={href} onClick={onClick} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

export function Welcome() {
  const bot = useBot()!;
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (bot.enabled && readText(KEYS.welcome) !== "1") setOpen(true);
  }, [bot.enabled]);
  const close = () => {
    writeText(KEYS.welcome, "1");
    setOpen(false);
  };
  const way = (vy: string) => guideOf(vy)?.kort ?? vy;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o ? setOpen(true) : close())}
      title={WELCOME.rubrik}
      width={600}
      footer={
        <>
          <span className="mr-auto text-xs text-faint">{bot.underlag ? `Kopia från ${bot.underlag}` : null}</span>
          <Button variant="secondary" onClick={close}>
            Börja titta
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 pb-1">
        <div className="flex flex-col gap-1.5 text-[14.5px] leading-[22px]">
          {WELCOME.rader.map((line, i) => (
            <p key={i} className={i === 0 ? "text-ink" : "text-dim"}>
              {line}
            </p>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Way icon={<Play />} title={way("scen")} hint={HINT.spela} href="/" onClick={close} />
          <Way icon={<Workflow />} title={way("karta")} hint={HINT.karta} href="/karta/" onClick={close} />
          <Way icon={<FlaskConical />} title={way("prov")} hint={HINT.prov} href="/prov/" onClick={close} />
          <Way
            icon={<MessageCircleQuestion />}
            title={FRAGA.kort}
            hint={HINT.fraga}
            onClick={() => {
              close();
              bot.setOpen(true);
            }}
          />
        </div>
      </div>
    </Dialog>
  );
}
