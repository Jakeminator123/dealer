"use client";

// <DecisionsEntry />: the start page's way to Beslut, at the top: "5 beslut väntar", in brass, while anything waits for
// Jakob's answer; nothing when nothing does, and nothing in the online copy (it has no Beslut).
import { ListChecks } from "lucide-react";
import Link from "next/link";
import { useBank } from "../../lib/bank.ts";
import { dealerHref } from "../../lib/dealer.ts";
import { entryLine, waitingCount } from "../../lib/decisions.ts";
import { isSnapshot } from "../../lib/mode.ts";
import { buttonClasses } from "../ui/Button";
import { Tooltip } from "../ui/Tooltip";
import { useDecisions } from "./useDecisions";

export function DecisionsEntry() {
  const { answer } = useDecisions();
  const { dealer } = useBank();
  const waiting = answer ? waitingCount(answer.decisions) : 0;
  if (isSnapshot || waiting === 0) return null;
  return (
    <Tooltip content="Det som väntar på ditt svar, ett kort per sak">
      <Link href={dealerHref("/beslut/", dealer)} className={buttonClasses({ variant: "primary", size: "sm" })}>
        <ListChecks />
        {entryLine(waiting)}
      </Link>
    </Tooltip>
  );
}
