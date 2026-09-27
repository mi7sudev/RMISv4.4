"use client";

// ============================================================================
// RMIS — shared kanban primitives (presentation only, no business logic).
// Reference design (rmis-main-ui PipelineBoard): TINTED stage columns with
// floating white cards — soft panel + inline header (stage dot + label +
// count chip), preview cards then a dashed "+ N more" expander ("Show less"
// to collapse), dashed empty column with inbox glyph. Cards carry the pastel
// initial avatar, name, match-percentage badge, position / place / relative
// applied meta rows, hairline divider and credential tag chips. Applicant
// cards are softly rounded (12px, arbitrary value) so they read as floating
// on the sharp tinted columns; columns, expanders and empty states stay square.
// ============================================================================

import * as React from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StageKey } from "@/lib/status";

// ── Stage dots (kanban board palette) ───────────────────────────────────────

/** Tiny colored dot class per pipeline stage — also reused by stage filter tabs. */
export const STAGE_DOT_CLASS: Record<StageKey | "Neutral", string> = {
  "Applied": "bg-[#3d7ef0]",
  "Under Review": "bg-[#c47f17]",
  "Shortlisted": "bg-[#2e9e5b]",
  "Rejected": "bg-[#d0454f]",
  "Neutral": "bg-[#b9b9c0]",
};

export function StageDot({ stage, className }: { stage: StageKey | "Neutral"; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("h-2 w-2 shrink-0 rounded-full", STAGE_DOT_CLASS[stage], className)}
    />
  );
}

// ── Pastel initial avatar ───────────────────────────────────────────────────

const AVATAR_PALETTE: [bg: string, fg: string][] = [
  ["#fbe3ee", "#b04a79"], // pink
  ["#efe6fc", "#7b52c9"], // purple
  ["#e2ecfc", "#3d6fc4"], // blue
  ["#eef5d8", "#6d8422"], // lime
  ["#e0f2e6", "#3d8f5f"], // green
  ["#fcefd6", "#a9741c"], // amber
  ["#def0ee", "#2f8a80"], // teal
  ["#ececf1", "#5f6072"], // slate
];

function paletteFor(name: string): [string, string] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

export function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/** Flat pastel circle with deterministic per-name color (reference board style). */
export function KanbanAvatar({ name, size = 38 }: { name: string; size?: number }) {
  const [bg, fg] = paletteFor(name);
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, background: bg, color: fg, fontSize: Math.round(size * 0.34) }}
      className="grid shrink-0 place-items-center rounded-full font-semibold"
    >
      {initialsOf(name)}
    </span>
  );
}

// ── Match-percentage badge ──────────────────────────────────────────────────

/** 100% → green, partial → amber, 0% → red; hidden when nothing is required. */
export function MatchBadge({
  metCount,
  requiredCount,
  className,
}: {
  metCount: number;
  requiredCount: number;
  className?: string;
}) {
  if (!requiredCount || requiredCount <= 0) return null;
  const pct = Math.round((metCount / requiredCount) * 100);
  const tone =
    pct >= 100
      ? "bg-[#e5f3ea] text-[#2e7d4f]"
      : pct > 0
        ? "bg-[#faf0da] text-[#a16207]"
        : "bg-[#f9e7ec] text-[#b3556a]";
  return (
    <span
      className={cn(
        "num inline-flex shrink-0 items-center rounded-none px-2 py-[3px] text-[11px] font-semibold leading-none",
        tone,
        className
      )}
      aria-label={`Meets ${pct}% of the minimum requirements`}
    >
      {pct}%
    </span>
  );
}

// ── Credential tag chips ────────────────────────────────────────────────────

const MAX_TAGS = 3;

export function KanbanTags({ tags, className }: { tags: string[]; className?: string }) {
  const visible = tags.slice(0, MAX_TAGS);
  const extra = tags.length - visible.length;
  if (visible.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {visible.map((t, i) => (
        <span
          key={`${i}-${t}`}
          className="inline-flex max-w-full items-center rounded-md bg-[#f1f1f3] px-2 py-1 text-[11px] font-medium leading-none text-[#5c5c66]"
        >
          <span className="truncate">{t}</span>
        </span>
      ))}
      {extra > 0 && (
        <span className="num inline-flex items-center rounded-md bg-[#f1f1f3] px-2 py-1 text-[11px] font-medium leading-none text-pebble">
          +{extra}
        </span>
      )}
    </div>
  );
}

// ── Card shell ──────────────────────────────────────────────────────────────

/** White applicant card: soft rounded corners + hairline elevation + hover
    lift (clickable surfaces). Only kanban applicant cards use this — columns
    and other panels stay sharp. Arbitrary radius because the global theme
    collapses the rounded-* scale to 0px (sharp-enterprise system). */
export const KANBAN_CARD =
  "rounded-[12px] border border-black/[0.07] bg-white shadow-e1 lift duration-200 hover:border-ink/15";

/** Hairline divider above the credential tags. */
export const KANBAN_DIVIDER = "mt-3 border-t border-black/[0.06] pt-2.5";

// ── Column ──────────────────────────────────────────────────────────────────

/** Cards shown per column before the "+ N more" expander (reference parity). */
const CARDS_PREVIEW = 4;

/**
 * Board column — reference PipelineBoard layout: TINTED panel (fog) with the
 * header INSIDE (stage dot + label + white count chip) and floating white
 * cards stacked below. The body never scrolls: the first CARDS_PREVIEW cards
 * render, then a dashed "+ N more" expander reveals the rest ("Show less"
 * collapses again). Empty columns show a quiet dashed box. On phones the
 * column is a snap-scroll lane card (min(320px, 85vw)); from md up the
 * grid stretches all columns to equal height.
 */
export function KanbanColumn({
  label,
  stage,
  count,
  children,
}: {
  label: string;
  /** Stage key drives the dot color; use "Neutral" for non-pipeline columns. */
  stage: StageKey | "Neutral";
  count: number;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const cards = React.Children.toArray(children);
  const shown = expanded ? cards : cards.slice(0, CARDS_PREVIEW);
  const hidden = cards.length - shown.length;

  return (
    <div className="flex w-[min(320px,85vw)] shrink-0 snap-start flex-col md:w-auto md:shrink">
      <div className="flex min-h-[280px] flex-1 flex-col border border-black/[0.06] bg-fog p-2.5 md:min-h-0">
        {/* Header — stage dot + label + count chip */}
        <div className="flex items-center gap-2 px-1 pb-2.5 pt-0.5">
          <StageDot stage={stage} />
          <h2 className="min-w-0 truncate text-[13.5px] font-semibold tracking-[-0.01em] text-ink">
            {label}
          </h2>
          <span
            className="num ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center bg-white px-1.5 text-[11px] font-semibold tabular-nums text-stone"
            aria-label={`${count} in ${label}`}
          >
            {count}
          </span>
        </div>
        {/* Body — floating white cards on the tinted panel */}
        <div className="flex flex-1 flex-col gap-2">
          {cards.length === 0 ? (
            <div className="flex min-h-28 flex-1 flex-col items-center justify-center gap-1.5 border border-dashed border-black/[0.12]">
              <Inbox className="h-5 w-5 text-pebble/70" aria-hidden="true" />
              <span className="text-xs text-pebble">No applications</span>
            </div>
          ) : (
            <>
              {shown}
              {hidden > 0 && (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  aria-expanded={false}
                  aria-label={`Show ${hidden} more cards in ${label}`}
                  className="focus-ring flex w-full items-center justify-center border border-dashed border-black/[0.15] py-2 text-xs font-medium text-stone transition-colors hover:border-ink/30 hover:text-ink"
                >
                  + {hidden} more
                </button>
              )}
              {expanded && cards.length > CARDS_PREVIEW && (
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  aria-expanded={true}
                  className="focus-ring flex w-full items-center justify-center py-1.5 text-xs font-medium text-stone transition-colors hover:text-ink"
                >
                  Show less
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
