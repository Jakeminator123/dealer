"use client";

// Kön's frame: the same as the rest of Scen & bord (the page's title, the toolbar row with the view's menu at its left), with
// what Kön shows now in the page's status and actions and its own row beside the menu (the row wraps rather than hides).
import type { ReactNode } from "react";
import { Page } from "../shell";

export function QueueFrame({ menu, status, actions, bar, children }: { menu: ReactNode; status?: ReactNode; actions?: ReactNode; bar?: ReactNode; children: ReactNode }) {
  return (
    <Page title="Scen & bord" full status={status} actions={actions}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line px-3 py-1.5">
          {menu}
          {bar ? (
            <>
              <span aria-hidden className="h-5 w-px shrink-0 bg-line" />
              {bar}
            </>
          ) : null}
        </div>
        <div data-queue className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          <div className="mx-auto w-full max-w-[1680px] px-6 pb-10 pt-5">{children}</div>
        </div>
      </div>
    </Page>
  );
}
