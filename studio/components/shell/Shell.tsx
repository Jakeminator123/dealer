"use client";

// The app frame around every page: the rail on the left, the view filling the rest of the window, and in the online copy
// the bot's panel as a third column on the right while it is open (components/bot). It also holds the one TooltipProvider,
// ToastProvider and BankProvider (useBank) that every view shares, and the bot's and the requests' state, which stay while
// the view changes.
import type { ReactNode } from "react";
import { BankProvider } from "../../lib/bank.ts";
import { BotLayer, DockColumn, useWide } from "../bot/BotDock";
import { BotProvider, useBot, useBotSwitch } from "../bot/BotProvider";
import { RequestsProvider } from "../requests/RequestsProvider";
import { ToastProvider } from "../ui/Toast";
import { TooltipProvider } from "../ui/Tooltip";
import { Rail } from "./Rail";

function Frame({ wide, children }: { wide: boolean; children: ReactNode }) {
  const bot = useBot();
  const docked = !!bot?.enabled && wide && bot.open;
  return (
    <div className="grid h-dvh overflow-hidden bg-canvas" style={{ gridTemplateColumns: docked ? `76px minmax(0,1fr) ${bot!.width}px` : "76px minmax(0,1fr)" }}>
      <Rail />
      <div id="innehall" className="relative min-h-0 min-w-0 overflow-auto">
        {children}
      </div>
      <DockColumn wide={wide} />
    </div>
  );
}

function WithBot({ children }: { children: ReactNode }) {
  const { enabled, fake } = useBotSwitch();
  const wide = useWide();
  return (
    <RequestsProvider enabled={enabled}>
      <BotProvider enabled={enabled} fake={fake}>
        <Frame wide={wide}>{children}</Frame>
        <BotLayer wide={wide} />
      </BotProvider>
    </RequestsProvider>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <ToastProvider>
        <BankProvider>
          <WithBot>{children}</WithBot>
        </BankProvider>
      </ToastProvider>
    </TooltipProvider>
  );
}
