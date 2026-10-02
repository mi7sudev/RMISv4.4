"use client";

// ============================================================================
// RMIS — Admin command center (spec §7.12, `#/operations`). Needs-attention
// KPI tiles (total headline), active recruitment list, recent activity, and the
// overview aside. Data: /api/admin/stats + /api/jobs + /api/evaluator/queue;
// 30 s silent poll + focus refresh.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Briefcase, CalendarClock, ChartColumn, ClipboardCheck, Clock,
  Inbox, LayoutDashboard, RefreshCw, ShieldAlert, UserRound, UserX, type LucideIcon,
} from "lucide-react";
import {
  EmptyState, IconChip, Monogram, PageHeader, SkeletonRows, StatusPill, type ChipTone,
} from "@/components/ui/shell";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, deadlineState, formatDate, fullName } from "@/lib/client";
import { navigate } from "@/lib/router";
import { getStatusMeta, stageForStatus, PIPELINE_STAGES, type StageKey } from "@/lib/status";
import { variantForStatus } from "@/lib/status-ui";
import { ghostBtn } from "@/components/views/recruitment";

type Stats = {
  totalUsers: number;
  admins: number;
  applicants: number;
  evaluators: number;
  activeJobs: number;
  totalApplications: number;
  pendingReview: number;
  shortlisted: number;
  rejected: number;
  byStatus: { status: string; count: number }[];
  recent: {
    id: number;
    status: string;
    dateApplied: string;
    applicant: { id: number; firstName: string | null; lastName: string | null };
    jobId: number;
    jobTitle: string;
    positionTitle: string | null;
  }[];
  needsAttention: {
    failedLogins24h: number;
    deadlinesThisWeek: number;
    blockedUsers: number;
    incompleteProfiles: number;
  };
};

type JobRow = {
  id: number;
  title: string;
  positionType: string | null;
  numberOfVacancy: number | null;
  deadlineDate: string | null;
  publishedAt: string;
  isActive: boolean;
  applicationCount: number;
  position: { placeOfAssignment: string | null; division: string | null } | null;
};

/** First-letter monogram text ("?" when empty). */
function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/** Stage colors for the pipeline sparkline (same tokens as the analytics funnel). */
const STAGE_SPARK: Record<StageKey, string> = {
  "Applied": "var(--info)",
  "Under Review": "var(--warn)",
  "Shortlisted": "var(--ok)",
  "Rejected": "var(--bad)",
};

/** Tiny stacked pipeline bar for the stat card aside — built only from byStatus wire data. */
function PipelineSpark({ byStatus }: { byStatus: { status: string; count: number }[] }) {
  const buckets = PIPELINE_STAGES.map((stage) => ({
    stage,
    count: byStatus.reduce((sum, d) => (stageForStatus(d.status) === stage ? sum + d.count : sum), 0),
  }));
  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  if (total === 0) return null;
  return (
    <span className="flex h-1.5 w-16 shrink-0 overflow-hidden bg-fog" aria-hidden>
      {buckets.map((b) =>
        b.count > 0 ? (
          <span
            key={b.stage}
            style={{ width: `${(b.count / total) * 100}%`, background: STAGE_SPARK[b.stage] }}
          />
        ) : null
      )}
    </span>
  );
}

const SUMMARY_TONE_TEXT: Record<"ok" | "warn" | "bad", string> = {
  ok: "text-[var(--ok)]",
  warn: "text-[var(--warn)]",
  bad: "text-[var(--bad)]",
};

/** Icon tint for the aside summary lines: green when clear, tone when flagged. */
function summaryTone(count: number, alertTone: "warn" | "bad"): "ok" | "warn" | "bad" {
  return count === 0 ? "ok" : alertTone;
}

/** Stat card tone → Bevel chip tone. */
const TONE_CHIP: Record<"ok" | "warn" | "bad" | "info" | "neutral", ChipTone> = {
  ok: "emerald",
  warn: "gold",
  bad: "rose",
  info: "plum",
  neutral: "slate",
};

/**
 * Bevel stat card (shared workspace layout system): cloud surface, 24px,
 * uppercase stone label, ink 3xl .num value, body-gray hint row, chip icon.
 * Clickable variant keeps the same surface (no borders, no shadows).
 */
function StatTile({
  label,
  value,
  icon,
  tone = "neutral",
  hint,
  aside,
  onClick,
  ariaLabel,
}: {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  tone?: "ok" | "warn" | "bad" | "info" | "neutral";
  hint?: string;
  aside?: React.ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="pt-0.5 text-xs font-medium uppercase tracking-[0.08em] text-stone">{label}</p>
        <IconChip icon={icon} tone={TONE_CHIP[tone]} size={40} />
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <p className="num text-3xl font-semibold leading-none tracking-[-0.02em] text-ink">{value}</p>
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
        className="dlg-card lift focus-ring block w-full p-6 text-left"
      >
        {body}
      </button>
    );
  }
  return <div className="dlg-card p-6">{body}</div>;
}

export default function CommandCenter() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [spin, setSpin] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      const [s, j] = await Promise.all([
        apiFetch<Stats>("/api/admin/stats"),
        apiFetch<JobRow[]>("/api/jobs?limit=50"),
      ]);
      setStats(s);
      setJobs(j);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Failed to load the command center");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) void load(true);
    }, 30_000);
    return () => clearInterval(id);
  }, [load]);
  useEffect(() => {
    const onFocus = () => void load(true);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);

  const manualRefresh = useCallback(() => {
    setSpin(true);
    void load(true).finally(() => setTimeout(() => setSpin(false), 500));
  }, [load]);

  const activeJobs = useMemo(() => (jobs ?? []).filter((j) => j.isActive).slice(0, 6), [jobs]);
  const attentionTotal = stats
    ? stats.pendingReview +
      stats.needsAttention.deadlinesThisWeek +
      stats.needsAttention.incompleteProfiles +
      stats.needsAttention.failedLogins24h
    : 0;

  const refreshButton = (
    <button type="button" className={ghostBtn} onClick={manualRefresh}>
      <RefreshCw className={`h-4 w-4 ${spin ? "animate-spin" : ""}`} aria-hidden />
      Refresh
    </button>
  );

  // Shared enterprise page header (PageHeader) — identical anatomy on every
  // workspace view across all roles (Task 35 layout refactor).
  const header = (
    <PageHeader
      title="Command Center"
      description="Live operational snapshot of recruitment, pipeline health, and system activity."
      actions={refreshButton}
    />
  );

  if (error) {
    return (
      <div className="space-y-6">
        {header}
        <div className="dlg-card p-8 text-center space-y-4">
          <AlertTriangle className="h-8 w-8 text-dusty-rose mx-auto" aria-hidden />
          <p className="text-sm text-body-gray">{error}</p>
          <button type="button" className={ghostBtn} onClick={() => void load()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!stats || jobs === null) {
    return (
      <div className="space-y-6">
        {header}
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="dlg-card p-6">
              <div className="flex items-start justify-between">
                <div className="skel h-3 w-20" />
                <div className="skel h-10 w-10" />
              </div>
              <div className="skel mt-4 h-8 w-16" />
            </div>
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <SkeletonRows rows={2} rowClassName="h-6 w-40" />
            <SkeletonRows rows={5} rowClassName="h-[72px] rounded-lg" />
            <SkeletonRows rows={5} rowClassName="h-[64px] rounded-lg" />
          </div>
          <div>
            <Skeleton className="h-72 w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      <div className="grid gap-6 lg:grid-cols-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
        {/* min-w-0: activity rows' truncate meta text must not widen the auto track
            on phones (observed OV=51 at 320px) */}
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {/* Needs attention */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="text-base font-semibold tracking-[-0.01em] text-ink">Needs attention</h2>
              <span className="text-xs text-body-gray">
                <span className="num">{attentionTotal}</span> item{attentionTotal === 1 ? "" : "s"} across the board
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile
                label="Awaiting review"
                value={stats.pendingReview}
                icon={ClipboardCheck}
                tone="warn"
                hint="Open →"
                onClick={() => navigate("review-queue")}
                aside={<PipelineSpark byStatus={stats.byStatus} />}
              />
              <StatTile
                label="Deadlines this week"
                value={stats.needsAttention.deadlinesThisWeek}
                icon={CalendarClock}
                tone="bad"
                hint="Open →"
                onClick={() => navigate("recruitment")}
              />
              <StatTile
                label="Incomplete profiles"
                value={stats.needsAttention.incompleteProfiles}
                icon={UserRound}
                tone="info"
                hint="Open →"
                onClick={() => navigate("candidates", { status: "incomplete" })}
              />
              <StatTile
                label="Failed logins"
                value={stats.needsAttention.failedLogins24h}
                icon={ShieldAlert}
                tone="bad"
                hint="Last 24 h · Open →"
                onClick={() => navigate("settings", { tab: "audit" })}
              />
            </div>
          </section>

          {/* Active recruitment */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold tracking-[-0.01em] text-ink">Active recruitment</h2>
              <button type="button" className={ghostBtn} onClick={() => navigate("recruitment")}>
                View all
              </button>
            </div>
            {activeJobs.length === 0 ? (
              <div className="dlg-card p-6 sm:p-10">
                <EmptyState
                  icon={Briefcase}
                  title="No active job postings right now."
                  description="Publish a posting in recruitment to start receiving applications."
                  action={
                    <button
                      type="button"
                      className="dlg-cta inline-flex min-h-[44px] items-center gap-2 px-5 text-sm"
                      onClick={() => navigate("recruitment")}
                    >
                      Open recruitment
                    </button>
                  }
                />
              </div>
            ) : (
              <div className="dlg-card-plain overflow-hidden">
                {activeJobs.map((j) => {
                  const dl = deadlineState(j.deadlineDate);
                  const urgent = !dl.overdue && dl.closingSoon;
                  return (
                    <button
                      key={j.id}
                      type="button"
                      className="flex min-h-[44px] w-full flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--border)] px-4 py-3 text-left transition-colors last:border-0 hover:bg-fog/60 focus-ring"
                      onClick={() => navigate("job", { id: String(j.id) })}
                    >
                      <IconChip icon={Briefcase} tone="amber" size={36} iconSize={16} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{j.title}</p>
                        <p className="mt-0.5 truncate text-xs text-stone">
                          {[j.positionType, j.position?.placeOfAssignment, j.position?.division].filter(Boolean).join(" · ") || "-"}
                        </p>
                      </div>
                      <span
                        className={`num inline-flex shrink-0 items-center gap-1.5 text-xs ${
                          dl.overdue ? "text-pebble" : urgent ? "text-[var(--bad)]" : "text-stone"
                        }`}
                      >
                        {urgent ? <Clock className="h-3.5 w-3.5" aria-hidden /> : null}
                        {dl.overdue ? "Closed" : `Deadline ${formatDate(j.deadlineDate)}`}
                      </span>
                      <StatusPill
                        variant="neutral"
                        status={`${j.applicationCount} application${j.applicationCount === 1 ? "" : "s"}`}
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Recent activity */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold tracking-[-0.01em] text-ink">Recent activity</h2>
            {stats.recent.length === 0 ? (
              <div className="dlg-card p-6 sm:p-10">
                <EmptyState
                  icon={Inbox}
                  title="No applications yet."
                  description="Recent applications will appear here as candidates apply."
                  compact
                />
              </div>
            ) : (
              <div className="dlg-card-plain overflow-hidden">
                {stats.recent.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="flex min-h-[44px] w-full flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--border)] px-4 py-3 text-left transition-colors last:border-0 hover:bg-fog/60 focus-ring"
                    onClick={() => navigate("candidate", { id: String(r.applicant.id) })}
                  >
                    <span aria-hidden="true" className="contents">
                      <Monogram size={28} className="rounded-full">{initialsOf(fullName(r.applicant))}</Monogram>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{fullName(r.applicant)}</p>
                      <p className="mt-0.5 truncate text-xs text-stone">
                        {[r.positionTitle || r.jobTitle, formatDate(r.dateApplied)].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <StatusPill status={getStatusMeta(r.status).label} variant={variantForStatus(r.status)} />
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Overview aside */}
        <aside className="space-y-4 self-start lg:sticky lg:top-6">
          <div className="dlg-card p-5">
            <div className="flex items-center gap-3">
              <IconChip icon={LayoutDashboard} tone="slate" size={36} iconSize={16} />
              <h2 className="text-base font-semibold tracking-[-0.01em] text-ink">Overview</h2>
            </div>
            <dl className="mt-3">
              {(
                [
                  ["Applicants", stats.applicants],
                  ["Active jobs", stats.activeJobs],
                  ["Applications", stats.totalApplications],
                  ["Shortlisted", stats.shortlisted],
                ] as [string, number][]
              ).map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-2.5 last:border-0"
                >
                  <dt className="text-xs text-body-gray">{label}</dt>
                  <dd className="num text-sm font-medium text-ink">{value}</dd>
                </div>
              ))}
            </dl>
            <button
              type="button"
              className="dlg-ghost mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-2 px-4 text-sm"
              onClick={() => navigate("analytics")}
            >
              <ChartColumn className="h-4 w-4" aria-hidden />
              Open Analytics
            </button>
          </div>
          <div className="space-y-2.5 rounded-lg bg-white/70 p-4">
            {(
              [
                [CalendarClock, stats.needsAttention.deadlinesThisWeek, "posting deadline(s) within 7 days", "warn"],
                [UserX, stats.needsAttention.blockedUsers, "blocked account(s)", "bad"],
                [AlertTriangle, stats.needsAttention.failedLogins24h, "failed login(s) in the last 24 h", "bad"],
              ] as [typeof CalendarClock, number, string, "warn" | "bad"][]
            ).map(([Icon, count, label, alertTone]) => (
              <p key={label} className="flex items-center gap-2 text-xs text-body-gray">
                <Icon
                  className={`h-3.5 w-3.5 shrink-0 ${SUMMARY_TONE_TEXT[summaryTone(count, alertTone)]}`}
                  aria-hidden
                />
                <span>
                  <span className="num">{count}</span> {label}
                </span>
              </p>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
