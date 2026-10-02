"use client";

// ============================================================================
// RMIS — shared presentation primitives for the premium enterprise pass.
// PageHeader, StatusPill, KpiCard, EmptyState, SectionCard, Monogram,
// SkeletonBlocks. Pure presentation: no fetching, no business logic.
// ============================================================================

import * as React from "react";
import { ArrowLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { pillClass, type StatusVariant } from "@/lib/status-ui";

// ── PageHeader ──────────────────────────────────────────────────────────────
// The single enterprise page-header anatomy used by EVERY view (Task 35):
// optional labelled back link (detail views) → eyebrow → title row
// (title + titleAside badge) → description → meta row, with the action
// cluster right-aligned and stacked below the title below xl.
// ────────────────────────────────────────────────────────────────────────────

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  back,
  leading,
  titleAside,
  meta,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  /** Detail-view affordance: labelled back link rendered above the title. */
  back?: { label: string; onClick: () => void };
  /** Avatar / icon lockup rendered left of the title block. */
  leading?: React.ReactNode;
  /** Badge / status pill rendered inline after the title. */
  titleAside?: React.ReactNode;
  /** Secondary row under the description (pills, stamps, counts). */
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("animate-in fade-in slide-in-from-bottom-2 duration-300", className)}>
      {back ? (
        <button
          type="button"
          onClick={back.onClick}
          className="focus-ring -ml-3 mb-3 inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-sm font-medium text-stone transition-colors hover:bg-cloud hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {back.label}
        </button>
      ) : null}
      {/* Stacks below xl so wide action clusters (filters, toggles, refresh) can
          never squeeze the title into a truncated stub on tablet widths. */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          {leading ? <div className="shrink-0">{leading}</div> : null}
          <div className="min-w-0">
            {eyebrow ? (
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-pebble">
                {eyebrow}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="truncate text-2xl font-semibold tracking-[-0.02em] text-ink sm:text-[28px]">
                {title}
              </h1>
              {titleAside}
            </div>
            {description ? (
              typeof description === "string" ? (
                <p className="mt-1 text-sm text-body-gray">{description}</p>
              ) : (
                <div className="mt-1 text-sm text-body-gray">{description}</div>
              )
            ) : null}
            {meta ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">{meta}</div>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

// ── StatusPill ──────────────────────────────────────────────────────────────

export function StatusPill({
  status,
  variant,
  className,
}: {
  /** Raw stored status spelling (normalized internally). */
  status?: string | null;
  /** Explicit variant overrides status mapping. */
  variant?: StatusVariant;
  className?: string;
}) {
  const v: StatusVariant = variant ?? "neutral";
  return (
    <span className={cn(pillClass(v), className)}>
      {status ?? ""}
    </span>
  );
}

// ── Monogram (gradient avatar tile) ─────────────────────────────────────────

export function Monogram({
  children,
  warm = false,
  className,
  size = 36,
}: {
  children: React.ReactNode;
  warm?: boolean;
  className?: string;
  size?: number;
}) {
  return (
    <span
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
      className={cn("monogram", warm && "monogram-warm", className)}
    >
      {children}
    </span>
  );
}

// ── Tinted icon chip ────────────────────────────────────────────────────────

export type ChipTone = "amber" | "emerald" | "rose" | "slate" | "ink" | "gold" | "plum";

export function IconChip({
  icon: Icon,
  tone = "slate",
  size = 40,
  iconSize,
  className,
}: {
  icon: LucideIcon;
  tone?: ChipTone;
  size?: number;
  iconSize?: number;
  className?: string;
}) {
  return (
    <span
      style={{ width: size, height: size }}
      className={cn("chip", `chip-${tone}`, className)}
      aria-hidden="true"
    >
      <Icon style={{ width: iconSize ?? Math.round(size * 0.46), height: iconSize ?? Math.round(size * 0.46) }} />
    </span>
  );
}

// ── KpiCard ─────────────────────────────────────────────────────────────────

const TONE_CHIP: Record<NonNullable<KpiCardProps["tone"]>, ChipTone> = {
  ok: "emerald",
  warn: "gold",
  bad: "rose",
  info: "plum",
  neutral: "slate",
};

export type KpiCardProps = {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: "ok" | "warn" | "bad" | "info" | "neutral";
  onClick?: () => void;
  ariaLabel?: string;
  className?: string;
  /** Optional decorative trailing element (sparkline, delta, etc.). */
  aside?: React.ReactNode;
};

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  onClick,
  ariaLabel,
  className,
  aside,
}: KpiCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="pt-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-stone">{label}</p>
        {Icon ? <IconChip icon={Icon} tone={TONE_CHIP[tone]} size={40} /> : null}
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="num text-[34px] font-semibold leading-none tracking-[-0.02em] text-ink">{value}</span>
          {hint ? <span className="text-xs font-medium text-pebble">{hint}</span> : null}
        </div>
        {aside}
      </div>
    </>
  );

  const base = cn(
    "dlg-card-plain border border-black/[0.07] bg-gradient-to-b from-white to-[#fdfdfc] p-6 shadow-e2",
    onClick &&
      "group focus-ring cursor-pointer lift hover:border-ink/15",
    className
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label={ariaLabel ?? label} className={cn(base, "block w-full text-left")}>
        {body}
      </button>
    );
  }
  return <div className={base}>{body}</div>;
}

// ── StatLedger ──────────────────────────────────────────────────────────────
// The institutional stat band (Watershed / Statsig school, absorbed from the
// inspo study): ONE white ledger whose cells are separated by hairline 1px
// gaps painted with the divider color — no floating cards, no icon chips.
// The oversized tabular numeral is the hero; a stone eyebrow labels it and a
// body-gray caption quietly qualifies it. Shared by every workspace view so
// the anatomy can never drift (previously hand-rolled twice).
// ────────────────────────────────────────────────────────────────────────────

export function StatLedger({
  children,
  className,
  ariaLabel,
}: {
  children: React.ReactNode;
  className?: string;
  /** Pass "none" when the caller renders its own skeleton geometry. */
  ariaLabel?: string;
}) {
  return (
    <div
      aria-label={ariaLabel}
      className={cn(
        "dlg-card-plain grid grid-cols-2 gap-px overflow-hidden bg-[var(--divider)] xl:grid-cols-4",
        className
      )}
    >
      {children}
    </div>
  );
}

export function StatCell({
  label,
  value,
  hint,
  aside,
  onClick,
  ariaLabel,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  /** Trailing node on the numeral baseline (sparkline, delta, pill). */
  aside?: React.ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const body = (
    <>
      <p className="eyebrow">{label}</p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="num text-[44px] font-semibold leading-none tracking-[-0.02em] text-ink">{value}</p>
        {aside}
      </div>
      {hint ? <p className="mt-2 text-xs text-body-gray">{hint}</p> : null}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel ?? label}
        className="focus-ring block w-full bg-white p-5 text-left transition-colors hover:bg-fog sm:p-6"
      >
        {body}
      </button>
    );
  }
  return <div className="bg-white p-5 sm:p-6">{body}</div>;
}

/** Skeleton twin of StatLedger — identical geometry, shimmer cells. */
export function StatLedgerSkeleton({ count = 4 }: { count?: number }) {
  return (
    <StatLedger aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white p-5 sm:p-6">
          <div className="skel h-3 w-20" />
          <div className="skel mt-4 h-10 w-16" />
          <div className="skel mt-3 h-3 w-24" />
        </div>
      ))}
    </StatLedger>
  );
}

// ── EmptyState ──────────────────────────────────────────────────────────────

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  tone = "slate",
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
  tone?: ChipTone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 text-center",
        compact ? "min-h-[104px] py-6" : "min-h-[176px] py-10",
        className
      )}
    >
      <span
        className={cn(
          "chip mb-4",
          `chip-${tone}`,
          compact ? "h-10 w-10" : "h-14 w-14"
        )}
      >
        <Icon className={compact ? "h-4.5 w-4.5" : "h-6 w-6"} aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-[13px] leading-5 text-stone">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

// ── SectionCard ─────────────────────────────────────────────────────────────

const SECTION_CHIP_TONE: Record<string, ChipTone> = {};

export function SectionCard({
  title,
  description,
  actions,
  icon: Icon,
  chipTone,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  icon?: LucideIcon;
  chipTone?: ChipTone;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  // min-w-0: as a CSS-grid child the card must be allowed to shrink below the
  // min-content floor of its nowrap description, or the grid track blows out
  // and the card overflows its viewport (observed at 320–1279px).
  return (
    <section className={cn("dlg-card min-w-0 p-6", className)} aria-label={title}>
      {title || actions ? (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {Icon ? (
              <IconChip
                icon={Icon}
                tone={chipTone ?? SECTION_CHIP_TONE[title ?? ""] ?? "slate"}
                size={36}
                iconSize={16}
              />
            ) : null}
            <div className="min-w-0">
              <h2 className="truncate font-display text-lg leading-7 text-ink">{title}</h2>
              {/* Wraps below sm, truncates from sm up. Full-width nowrap (truncate
                  everywhere) gave the card a huge min-content floor that blew out
                  auto grid tracks on phones; wrapping text has none. */}
              {description ? <p className="text-xs text-stone sm:truncate">{description}</p> : null}
            </div>
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

// ── Skeleton blocks ─────────────────────────────────────────────────────────

export function SkeletonKpis({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-4 lg:grid-cols-4", className)} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="dlg-card-plain border border-black/[0.07] p-6 shadow-e1">
          <div className="flex items-start justify-between">
            <div className="skel h-3 w-20" />
            <div className="skel h-10 w-10 rounded-xl" />
          </div>
          <div className="skel mt-4 h-8 w-16" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonRows({
  rows = 6,
  className,
  rowClassName = "h-14",
}: {
  rows?: number;
  className?: string;
  rowClassName?: string;
}) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={cn("skel w-full", rowClassName)} />
      ))}
    </div>
  );
}

export function SkeletonKanban({ columns = 4, className }: { columns?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-4 xl:grid-cols-4", className)} aria-hidden="true">
      {Array.from({ length: columns }).map((_, i) => (
        /* Tinted column panel + floating card blocks (mirrors KanbanColumn) */
        <div key={i} className="flex flex-col gap-2 border border-black/[0.06] bg-fog p-2.5">
          <div className="flex items-center gap-2 px-1 pb-0.5 pt-0.5">
            <div className="skel h-2 w-2 rounded-full" />
            <div className="skel h-3.5 w-20" />
            <div className="ml-auto skel h-5 w-6" />
          </div>
          <div className="skel h-24 w-full" />
          <div className="skel h-24 w-full" />
        </div>
      ))}
    </div>
  );
}
