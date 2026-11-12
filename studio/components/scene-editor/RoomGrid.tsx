"use client";

// The rooms as pictures: the 360° rooms of the register (data/scene-rooms.json, with the menu's pictures under
// assets/scene/thumbs/), then the built rooms. A room the game does not have yet carries "Labb": it is tried here until
// Jakob lets it into the game. The V6 plate (Kuliss, V6-plåt) shows the plate itself.
import type { RegisterRoom } from "../../../src/scene3d-room.ts";
import { labUrl } from "../../lib/lab.ts";
import { BUILT_ROOMS, keySpec } from "../../lib/scene-keys.ts";
import { Tooltip, cn } from "../ui";
import { KeyRow } from "./KeyControl";

export type RoomItem = { id: string; label: string; thumb: string; game: boolean; note: string };

export function roomItems(rooms: readonly RegisterRoom[]): RoomItem[] {
  const built: Record<string, { thumb: string; note: string; game: boolean }> = {
    hall: { thumb: "assets/scene/thumbs/room-hall.jpg", note: "Byggd spelhall med automater och låg rök", game: true },
    salong: { thumb: "assets/scene/thumbs/room-salong.jpg", note: "Byggd salong med äkta djup", game: true },
    kuliss: { thumb: "assets/scene/room.png", note: "V6-plåten som ett plan bakom dealern", game: false },
    plat: { thumb: "assets/scene/room.png", note: "V6-plåten fast i rutan, som V6 i dag", game: false },
  };
  return [
    ...rooms.map((r) => ({ id: r.id, label: r.label, thumb: `assets/scene/thumbs/room-${r.id}.jpg`, game: r.game, note: r.note })),
    ...["hall", "salong", "kuliss", "plat"].map((id) => ({ id, label: BUILT_ROOMS.find((b) => b.value === id)!.label, ...built[id] })),
  ];
}

export function RoomGrid({
  items,
  value,
  baseLabel,
  differs,
  onChange,
  onReset,
}: {
  items: RoomItem[];
  value: string;
  baseLabel: string;
  differs: boolean;
  onChange: (id: string) => void;
  onReset: () => void;
}) {
  const spec = keySpec("room")!;
  const current = items.find((r) => r.id === value);
  return (
    <KeyRow label={spec.label} help={spec.help} who={spec.who} differs={differs} value={current?.label ?? value} onReset={onReset} resetLabel={`Återställ till basgrund: ${baseLabel}`}>
      <div role="radiogroup" aria-label="Rum" className="grid grid-cols-3 gap-1.5">
        {items.map((room) => {
          const on = room.id === value;
          return (
            <Tooltip key={room.id} content={`${room.note}${room.game ? "" : " · bara i labbet"}`}>
              <button
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={room.label}
                onClick={() => onChange(room.id)}
                className={cn(
                  "group/room relative aspect-[16/10] overflow-hidden rounded-md border bg-well text-left transition-[border-color,box-shadow] duration-150",
                  on ? "border-brass shadow-[0_0_0_1px_var(--color-brass)]" : "border-line hover:border-line-strong",
                )}
              >
                <img src={labUrl(room.thumb)} alt="" loading="lazy" decoding="async" className={cn("absolute inset-0 size-full object-cover transition-opacity duration-150", on ? "opacity-100" : "opacity-75 group-hover/room:opacity-100")} />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-1.5 pb-1 pt-3 text-2xs font-medium leading-3 text-white">
                  {room.label}
                </span>
                {!room.game ? <span className="absolute right-1 top-1 rounded-xs bg-black/65 px-1 text-[10px] leading-[14px] text-dim">Labb</span> : null}
              </button>
            </Tooltip>
          );
        })}
      </div>
    </KeyRow>
  );
}
