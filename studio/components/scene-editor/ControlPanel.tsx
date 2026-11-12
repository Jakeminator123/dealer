"use client";

// The panel beside the scene: a search field, then the catalogue's groups as folds (Miljö open, Avancerat folded away as
// calibration). A group's header says how many of its keys differ from the baseline. A search opens every group that has
// a match and shows only the matches. Things that lie on the table but are no keys (the tray's model, the shoe, the chips,
// the cards' material in the placement plan) come last in their group, under their own line: a preset does not keep them.
import { ChevronRight, Search, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type { SceneState } from "../../../src/scene3d-view.ts";
import { GROUPS, formatValue, inUse, keySpec, searchKeys, type GroupId, type KeySpec, type SceneKey } from "../../lib/scene-keys.ts";
import { IconButton, ScrollArea, TextField, cn } from "../ui";
import { KeyControl } from "./KeyControl";
import { RoomGrid, type RoomItem } from "./RoomGrid";

export type Extra = { id: string; label: string; words: string; node: ReactNode };

const fold = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function ControlPanel({
  current,
  baseline,
  differ,
  rooms,
  extras,
  onChange,
  onReset,
  footer,
}: {
  current: SceneState;
  baseline: SceneState;
  differ: ReadonlySet<SceneKey>;
  rooms: RoomItem[];
  extras: Partial<Record<GroupId, Extra[]>>;
  onChange: (key: SceneKey, value: unknown) => void;
  onReset: (key: SceneKey) => void;
  footer?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<ReadonlySet<GroupId>>(() => new Set(GROUPS.filter((g) => !g.folded).map((g) => g.id)));
  const matched = useMemo(() => searchKeys(query), [query]);
  const searching = query.trim().length > 0;
  const extraHit = (e: Extra) => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    const hay = fold(`${e.label} ${e.words}`);
    return words.every((w) => hay.includes(w));
  };
  const roomName = (id: string) => rooms.find((r) => r.id === id)?.label;
  const toggle = (id: GroupId) =>
    setOpen((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // A key that does nothing now is tucked away under the key it needs (shown again when it differs from the baseline, or in
  // a search); one whose need lies in another group stays, dimmed.
  const near = (s: KeySpec) => !!s.needs && keySpec(s.needs.key)!.group === s.group;
  const shown = (s: KeySpec) => searching || inUse(s, current) || !near(s) || differ.has(s.key);
  const groups = GROUPS.map((g) => {
    const list = matched.filter((s) => s.group === g.id && shown(s));
    const more = (extras[g.id] ?? []).filter((e) => !searching || extraHit(e));
    return { ...g, list, more, changed: [...differ].filter((k) => keySpec(k)!.group === g.id).length };
  }).filter((g) => !searching || g.list.length || g.more.length);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="relative border-b border-line px-4 py-3">
        <TextField
          size="sm"
          aria-label="Sök reglage"
          placeholder="Sök reglage, t.ex. damm eller glans"
          icon={<Search />}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQuery("");
          }}
          className={query ? "pr-8" : undefined}
        />
        {query ? (
          <IconButton label="Töm sökningen" icon={<X />} size="sm" className="absolute right-5 top-[14px] size-6" onClick={() => setQuery("")} />
        ) : null}
      </div>
      <ScrollArea className="flex-1">
        {searching && !groups.length ? <p className="px-4 py-6 text-sm text-faint">Inget reglage heter så.</p> : null}
        {groups.map((g) => {
          const expanded = searching || open.has(g.id);
          return (
            <section key={g.id} className="border-b border-line">
              <h2>
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => toggle(g.id)}
                  disabled={searching}
                  className="flex h-11 w-full items-center gap-2 px-4 text-left transition-colors duration-150 enabled:hover:bg-raised/60"
                >
                  <ChevronRight className={cn("size-4 shrink-0 text-faint transition-transform duration-150", expanded && "rotate-90")} />
                  <span className="font-display text-md font-semibold text-ink">{g.label}</span>
                  {g.id === "avancerat" ? <span className="text-xs text-faint">kalibrering</span> : null}
                  <span className="ml-auto flex items-center gap-2">
                    {g.changed ? (
                      <span className="inline-flex h-[18px] items-center gap-1 rounded-full border border-brass/35 bg-brass/12 px-1.5 text-2xs font-medium tabular-nums text-brass-hi">
                        <span aria-hidden className="size-1.5 rounded-full bg-brass" />
                        {g.changed} ändrad{g.changed === 1 ? "" : "e"}
                      </span>
                    ) : null}
                    {searching ? <span className="text-2xs tabular-nums text-faint">{g.list.length + g.more.length} träff</span> : null}
                  </span>
                </button>
              </h2>
              {expanded ? (
                <div className="divide-y divide-line/70 px-4 pb-3">
                  {g.list.map((s) =>
                    s.key === "room" ? (
                      <RoomGrid
                        key={s.key}
                        items={rooms}
                        value={String(current.room)}
                        baseLabel={roomName(String(baseline.room)) ?? String(baseline.room)}
                        differs={differ.has("room")}
                        onChange={(id) => onChange("room", id)}
                        onReset={() => onReset("room")}
                      />
                    ) : (
                      <div key={s.key} className={cn(near(s) && "ml-[2px] border-l border-line-strong/70 pl-3", !inUse(s, current) && "opacity-55")}>
                        <KeyControl
                          spec={s}
                          value={current[s.key]}
                          base={baseline[s.key]}
                          differs={differ.has(s.key)}
                          onChange={(value) => onChange(s.key, value)}
                          onReset={() => onReset(s.key)}
                        />
                      </div>
                    ),
                  )}
                  {g.more.length ? (
                    <div className="pt-3">
                      <p className="pb-1 text-2xs font-semibold uppercase tracking-[0.08em] text-faint">Utanför förvalen</p>
                      <div className="divide-y divide-line/70">
                        {g.more.map((e) => (
                          <div key={e.id}>{e.node}</div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          );
        })}
        {footer}
      </ScrollArea>
    </div>
  );
}

/** A key's value in words, for the header and the address line. */
export const valueText = (key: SceneKey, value: unknown, roomName?: (id: string) => string | undefined) => formatValue(keySpec(key)!, value, roomName);
