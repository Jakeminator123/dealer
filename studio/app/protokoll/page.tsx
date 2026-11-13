// Protokoll (/protokoll/?dealer=<id>): every take of every order, what was sent and how it went, and what works per
// method; computed from the orders, their receipts, the clip bank and Material (lib/ledger.ts). Only in the local lab:
// the online copy holds no orders.
import { Suspense } from "react";
import { LedgerView } from "@/components/ledger";
import { Page } from "@/components/shell";
import { EmptyState } from "@/components/ui";
import { isSnapshot } from "@/lib/mode";

export default function Protokoll() {
  if (isSnapshot)
    return (
      <Page title="Protokoll">
        <EmptyState title="Protokollet finns bara i labbet">Beställningarna och deras utfall ligger i Jakobs lokala labb.</EmptyState>
      </Page>
    );
  return (
    <Suspense fallback={<Page title="Protokoll" />}>
      <LedgerView />
    </Suspense>
  );
}
