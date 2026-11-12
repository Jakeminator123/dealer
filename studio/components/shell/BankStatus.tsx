"use client";

// <BankStatus />: how the clip bank stands, for a page header: "Läser…", "109 tagningar", or that the lab does not answer.
import { useBank } from "../../lib/bank.ts";
import { cn } from "../ui/cn";
import { Spinner } from "../ui/Spinner";

export function BankStatus({ className }: { className?: string }) {
  const { graph, status, error } = useBank();
  if (status === "loading")
    return (
      <span className={cn("inline-flex items-center gap-2 text-dim", className)}>
        <Spinner size="xs" /> Läser klippbanken…
      </span>
    );
  if (status === "error")
    return (
      <span className={cn("inline-flex items-center gap-2 text-[#ef8b8b]", className)}>
        <span className="size-1.5 rounded-full bg-underkand" /> {error?.message ?? "Klippbanken kunde inte läsas."}
      </span>
    );
  const takes = graph ? Object.keys(graph.takes).length : 0;
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className={cn("size-1.5 rounded-full", error ? "bg-anmarkning" : "bg-godkand/80")} />
      {error ? "Labbet svarar inte · visar senast lästa" : `${takes} tagningar`}
    </span>
  );
}
