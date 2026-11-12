"use client";

// The app frame around every page: the rail on the left and the view filling the rest of the window. It also holds the
// one TooltipProvider, ToastProvider and BankProvider (useBank) that every view shares.
import type { ReactNode } from "react";
import { BankProvider } from "../../lib/bank.ts";
import { ToastProvider } from "../ui/Toast";
import { TooltipProvider } from "../ui/Tooltip";
import { Rail } from "./Rail";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <ToastProvider>
        <BankProvider>
          <div className="grid h-dvh grid-cols-[76px_minmax(0,1fr)] overflow-hidden bg-canvas">
            <Rail />
            <div id="innehall" className="relative min-h-0 min-w-0 overflow-auto">
              {children}
            </div>
          </div>
        </BankProvider>
      </ToastProvider>
    </TooltipProvider>
  );
}
