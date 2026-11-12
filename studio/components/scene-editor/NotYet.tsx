"use client";

// What the scene cannot change yet, said honestly at the foot of the panel, each with what it would take.
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { cn } from "../ui";

const ITEMS: { what: string; takes: string }[] = [
  {
    what: "Bordets storlek",
    takes: "Ett fast mått i koden (TABLE i src/scene3d-table.ts). Kräver en ny nyckel som bordet, filttrycket, relingen, urtaget och träffytan läser; dealerkanten står kvar där filmen har den.",
  },
  {
    what: "Bordets form och tryck",
    takes: "Ovalen och tryckets layout är platshållare i samma fil; ett nytt bord är ny geometri, eller en modell som läggs som föremål.",
  },
  {
    what: "Nya rum",
    takes: "En post i data/scene-rooms.json (bild, oskärpa, ljus, vridning, luft, källa och licens), en 360°-bild 2:1 under assets/scene/rooms/ och en liten bild under assets/scene/thumbs/.",
  },
  {
    what: "Nya rörelser i rummen",
    takes: "Kod i src/scene3d-room.ts: varje rum har samma tre (klocka, luft, ljusskifte). En ny rörelse är ny kod där och en ny nyckel i scenen.",
  },
  {
    what: "Dealerns eget ljus",
    takes: "Ljuset är filmens. Här går bara nivå och färgton att ändra; ett annat ljus på henne kräver nya filmer.",
  },
];

export function NotYet() {
  const [open, setOpen] = useState(false);
  return (
    <section className="px-4 py-3">
      <h2>
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 text-left text-sm text-dim hover:text-ink">
          <ChevronRight className={cn("size-4 shrink-0 text-faint transition-transform duration-150", open && "rotate-90")} />
          Går inte att ändra än
          <span className="ml-auto text-2xs tabular-nums text-faint">{ITEMS.length}</span>
        </button>
      </h2>
      {open ? (
        <ul className="mt-2 flex flex-col gap-2.5 pl-6">
          {ITEMS.map((item) => (
            <li key={item.what} className="flex flex-col gap-0.5">
              <span className="text-sm text-ink">{item.what}</span>
              <span className="text-xs leading-[17px] text-faint">{item.takes}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
