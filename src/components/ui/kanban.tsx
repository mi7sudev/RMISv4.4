"use client";

// ============================================================================
// RMIS — shared kanban primitives (presentation only, no business logic).
// Bevel edition (upload/PROPOSED-RMIS-DESIGN.md): pale Cloud Card columns
// (16px radius, no border), floating white applicant cards (16px radius,
// image-lift shadow on hover), capsule count chips and tag chips. Stage dots
// and pastel avatars stay as the only color moments — data-category accents
// per the spec. Business logic untouched.
// ============================================================================

import * as React from "react";
import { Building2, Clock, Inbox, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StageKey } from "@/lib/status";
import { STAGE_VARIANT, type StatusVariant } from "@/lib/status-ui";
import { StatusDot } from "@/components/ui/shell";

// ── Stage dots (kanban board palette) ───────────────────────────────────────

/** Stage → functional status variant. The disc always carries its shape-coded
 *  glyph (bare color-only dots read as ambiguous — QA 2026-02), and shares the
 *  exact hue+glyph mapping of the analytics funnel and pipeline headers. */
const STAGE_VARIANT_WITH_NEUTRAL: Record<StageKey | "Neutral", StatusVariant> = {
  ...STAGE_VARIANT,
  "Neutral": "neutral",
};

export function StageDot({ stage, className }: { stage: StageKey | "Neutral"; className?: string }) {
  return <StatusDot variant={STAGE_VARIANT_WITH_NEUTRAL[stage]} className={className} />;
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
      ? "bg-ok-bg text-ok"
      : pct > 0
        ? "bg-warn-bg text-warn"
        : "bg-bad-bg text-bad";
  return (
    <span
      className={cn(
        "num inline-flex shrink-0 items-center rounded-full px-2 py-[3px] text-[11px] font-semibold leading-none",
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
          className="inline-flex max-w-full items-center rounded-full bg-[#f1f3f7] px-2 py-1 text-[11px] font-medium leading-none text-stone"
        >
          <span className="truncate">{t}</span>
        </span>
      ))}
      {extra > 0 && (
        <span className="num inline-flex items-center rounded-full bg-[#f1f3f7] px-2 py-1 text-[11px] font-medium leading-none text-stone">
          +{extra}
        </span>
      )}
    </div>
  );
}

// ── Card shell ──────────────────────────────────────────────────────────────

/** White applicant card: 24px radius (Bevel card geometry), hairline elevation,
    hover lift with the spec image-lift shadow. */
export const KANBAN_CARD =
  "rounded-2xl bg-white shadow-e1 lift duration-200";

/** Hairline divider above the credential tags. */
export const KANBAN_DIVIDER = "mt-3 border-t border-black/[0.06] pt-2.5";

// ── Shared card body ────────────────────────────────────────────────────────

/**
 * The ONE applicant card body for every staff kanban board (job workspace
 * pipeline, candidate registry, review queue): pastel avatar + name + position
 * + place/applied meta row + match badge, then the credential tags over the
 * hairline divider. `action` (review queue's profile quick-action) renders
 * anchored top-right inside the divider row and keeps that divider visible
 * even when the card has no tags. Pure presentation — the card shell, click
 * wiring and aria-labels stay with the caller.
 */
export function KanbanCardBody({
  name,
  position,
  placeOfAssignment,
  appliedLabel,
  match,
  tags,
  action,
}: {
  name: string;
  /** Position title (humanized by the caller where needed). */
  position: string;
  placeOfAssignment: string | null;
  /** Preformatted applied-age label, e.g. "Applied 3d ago". */
  appliedLabel: string;
  match?: { metCount: number; requiredCount: number };
  tags: string[];
  action?: React.ReactNode;
}) {
  return (
    <>
      <div className="flex items-start gap-2.5">
        <KanbanAvatar name={name} />
        <div className="min-w-0 flex-1">
          <p className="min-w-0 truncate text-sm font-semibold text-ink">{name}</p>
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-stone">
            <Building2 className="h-3.5 w-3.5 shrink-0 text-pebble" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{position}</span>
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-stone">
            {placeOfAssignment && (
              <>
                <MapPin className="h-3.5 w-3.5 shrink-0 text-pebble" aria-hidden />
                <span className="min-w-0 truncate">{placeOfAssignment}</span>
                <span className="shrink-0 text-pebble" aria-hidden>·</span>
              </>
            )}
            <Clock className="h-3.5 w-3.5 shrink-0 text-pebble" aria-hidden />
            <span className="shrink-0 whitespace-nowrap text-pebble">{appliedLabel}</span>
          </p>
        </div>
        {match ? <MatchBadge metCount={match.metCount} requiredCount={match.requiredCount} /> : null}
      </div>
      {(action || tags.length > 0) && (
        <div className={cn(KANBAN_DIVIDER, action && "relative flex items-center")}>
          <KanbanTags tags={tags} className={cn(action && "min-w-0 flex-1 pr-8")} />
          {action}
        </div>
      )}
    </>
  );
}

// ── Column ──────────────────────────────────────────────────────────────────

/** Cards shown per column before the "+ N more" expander (reference parity). */
const CARDS_PREVIEW = 4;

/**
 * Board column — Bevel pipeline column: pale Cloud Card panel (16px radius via
 * rounded-xl, no border, no shadow — the surface is the elevation) with the
 * header INSIDE (stage dot + label + white capsule count chip) and floating
 * white cards stacked below. The body never scrolls: the first CARDS_PREVIEW
 * cards render, then a "+ N more" expander reveals the rest ("Show less"
 * collapses again). Empty columns show a quiet dashed inset. On phones the
 * column is a snap-scroll lane card (min(320px, 85vw)); from md up the grid
 * stretches all columns to equal height.
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
      <div className="flex min-h-[280px] flex-1 flex-col rounded-xl bg-cloud p-2.5 md:min-h-0">
        {/* Header — stage dot + label + count chip */}
        <div className="flex items-center gap-2 px-1 pb-2.5 pt-0.5">
          <StageDot stage={stage} />
          <h2 className="min-w-0 truncate text-[13.5px] font-semibold tracking-[-0.01em] text-ink">
            {label}
          </h2>
          <span
            className="num ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-semibold tabular-nums text-stone shadow-e1"
            aria-label={`${count} in ${label}`}
          >
            {count}
          </span>
        </div>
        {/* Body — floating white cards on the pale panel */}
        <div className="flex flex-1 flex-col gap-2">
          {cards.length === 0 ? (
            <div className="flex min-h-28 flex-1 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#d5dce8] bg-white/45">
              <Inbox className="h-5 w-5 text-ash" aria-hidden="true" />
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
                  className="focus-ring flex w-full items-center justify-center rounded-xl border border-dashed border-[#c9d3e2] bg-white/45 py-2 text-xs font-medium text-stone transition-colors hover:border-ink/25 hover:bg-white hover:text-ink"
                >
                  + {hidden} more
                </button>
              )}
              {expanded && cards.length > CARDS_PREVIEW && (
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  aria-expanded={true}
                  className="focus-ring flex w-full items-center justify-center rounded-xl py-1.5 text-xs font-medium text-stone transition-colors hover:text-ink"
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
