"use client";

// <ComingSoon title="Karta" icon={<Workflow />} />: the stand-in for a view that is being built: the page frame, the bank's
// loading and error states, and an empty state that points to the old lab meanwhile.
import { ArrowUpRight, Hammer } from "lucide-react";
import type { ReactNode } from "react";
import { useBank } from "../../lib/bank.ts";
import { buttonClasses } from "../ui/Button";
import { EmptyState, ErrorState, Skeleton } from "../ui/States";
import { BankStatus } from "./BankStatus";
import { Page } from "./Page";

export function ComingSoon({ title, icon = <Hammer />, children }: { title: string; icon?: ReactNode; children?: ReactNode }) {
  const { status, error, reload } = useBank();
  return (
    <Page title={title} status={<BankStatus />} full>
      {status === "loading" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4 p-6" aria-busy>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2.5 rounded-lg border border-line bg-surface p-0 pb-3">
              <Skeleton className="aspect-[3/2] w-full rounded-b-none rounded-t-[11px]" />
              <Skeleton className="mx-3 h-3.5 w-2/3" />
              <Skeleton className="mx-3 h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : status === "error" ? (
        <ErrorState className="h-full pb-[10vh]" title="Klippbanken kunde inte läsas" error={error} onRetry={() => void reload()} />
      ) : (
        <EmptyState
          className="h-full pb-[10vh]"
          icon={icon}
          title="Byggs just nu"
          action={
            <a href="/lab.html?gamla=1" className={buttonClasses({ variant: "secondary" })}>
              Gamla labbet <ArrowUpRight />
            </a>
          }
        >
          {children ?? <>{title} får sin nya form inom kort. Under tiden finns den i gamla labbet.</>}
        </EmptyState>
      )}
    </Page>
  );
}
