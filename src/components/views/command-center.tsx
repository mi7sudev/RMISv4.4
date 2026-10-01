"use client";

// ============================================================================
// RMIS — Admin command center (spec §7.12, `#/operations`). Executive
// dashboard anatomy ("Executive Ink" pass): needs-attention KPI strip built
// from KpiCard, active-recruitment + recent-activity lists in white
// SectionCards, and the sticky system-overview aside. Data: /api/admin/stats
// + /api/jobs + /api/evaluator/queue; 30 s silent poll + focus refresh.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Briefcase, CalendarClock, ChartColumn, ClipboardCheck,
  Inbox, LayoutDashboard, RefreshCw, ShieldAlert, UserRound, UserX,
} from "lucide-react";
import {
  EmptyState, IconChip, KpiCard, Monogram, PageHeader, SectionCard,
  SkeletonKpis, SkeletonRows, StatusPill,
} from "@/components/ui/shell";
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

/** Pipeline sparkline colors — Bevel viz series (same tokens as the analytics donut). */
const STAGE_SPARK: Record<StageKey, string> = {
  "Applied": "var(--viz-1)",
  "Under Review": "var(--viz-3)",
  "Shortlisted": "var(--viz-2)",
  "Rejected": "var(--viz-5)",
};

/** Tiny stacked pipeline bar for the KPI card aside — built only from byStatus wire data. */
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

/** Zero-state hint chip for KPI tiles — empty counters read as intentional, not broken. */
function AllClear({ label = "All clear" }: { label?: string }) {
  return (
    <span className="dlg-pill inline-flex shrink-0 items-center gap-1.5 bg-ok-bg px-2 py-1 text-[11px] font-medium text-ok">
      <span aria-hidden="true" className="stage-dot dot-ok" />
      {label}
    </span>
  );
}

/** Aside alert-line dot: green when clear, tone when flagged. */
function alertDotClass(count: number, alertTone: "warn" | "bad"): string {
  if (count === 0) return "dot-ok";
  return alertTone === "warn" ? "dot-warn" : "dot-bad";
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
        <div className="data-card space-y-4 p-8 text-center">
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
        <div className="flex flex-col gap-6 xl:flex-row" aria-hidden="true">
          <div className="min-w-0 flex-1 space-y-6">
            <div className="data-card p-5 sm:p-6">
              <SkeletonKpis />
            </div>
            <div className="data-card p-5 sm:p-6">
              <SkeletonRows rows={5} rowClassName="h-12 rounded-lg" />
            </div>
            <div className="data-card p-5 sm:p-6">
              <SkeletonRows rows={4} rowClassName="h-12 rounded-lg" />
            </div>
          </div>
          <div className="w-full shrink-0 xl:w-[320px]">
            <div className="data-card p-5 sm:p-6">
              <SkeletonRows rows={7} rowClassName="h-9" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300 xl:flex-row">
        {/* min-w-0: activity rows' truncate meta text must not widen the flex track
            on phones (observed OV=51 at 320px) */}
        <div className="min-w-0 flex-1 space-y-6">
          {/* Needs attention — KPI strip */}
          <SectionCard
            title="Needs attention"
            description="Open items across the board"
            icon={AlertTriangle}
            chipTone="rose"
            actions={
              <span className="dlg-pill bg-fog px-2.5 py-1 text-xs font-medium text-stone">
                <span className="num">{attentionTotal}</span> item{attentionTotal === 1 ? "" : "s"}
              </span>
            }
            bodyClassName="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <KpiCard
              label="Awaiting review"
              value={stats.pendingReview}
              icon={ClipboardCheck}
              tone="warn"
              hint="Open →"
              onClick={() => navigate("review-queue")}
              aside={
                stats.pendingReview === 0 ? (
                  <AllClear />
                ) : (
                  <PipelineSpark byStatus={stats.byStatus} />
                )
              }
            />
            <KpiCard
              label="Deadlines this week"
              value={stats.needsAttention.deadlinesThisWeek}
              icon={CalendarClock}
              tone="bad"
              hint="Open →"
              onClick={() => navigate("recruitment")}
              aside={stats.needsAttention.deadlinesThisWeek === 0 ? <AllClear /> : undefined}
            />
            <KpiCard
              label="Incomplete profiles"
              value={stats.needsAttention.incompleteProfiles}
              icon={UserRound}
              tone="info"
              hint="Open →"
              onClick={() => navigate("candidates", { status: "incomplete" })}
              aside={stats.needsAttention.incompleteProfiles === 0 ? <AllClear /> : undefined}
            />
            <KpiCard
              label="Failed logins"
              value={stats.needsAttention.failedLogins24h}
              icon={ShieldAlert}
              tone="bad"
              hint="Last 24 h · Open →"
              onClick={() => navigate("settings", { tab: "audit" })}
              aside={stats.needsAttention.failedLogins24h === 0 ? <AllClear /> : undefined}
            />
          </SectionCard>

          {/* Active recruitment */}
          <SectionCard
            title="Active recruitment"
            description="Postings currently accepting applications"
            icon={Briefcase}
            chipTone="amber"
            actions={
              <button type="button" className={ghostBtn} onClick={() => navigate("recruitment")}>
                View all
              </button>
            }
            bodyClassName="divide-y divide-[#eef1f7]"
          >
            {activeJobs.length === 0 ? (
<<<<<<< Updated upstream
              <EmptyState
                icon={Briefcase}
                title="No active job postings right now."
                description="Publish a posting in recruitment to start receiving applications."
                action={
=======
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
>>>>>>> Stashed changes
                  <button
                    type="button"
                    className="dlg-cta inline-flex min-h-[44px] items-center gap-2 px-5 text-sm"
                    onClick={() => navigate("recruitment")}
                  >
                    Open recruitment
                  </button>
                }
              />
            ) : (
              activeJobs.map((j) => {
                const dl = deadlineState(j.deadlineDate);
                const urgent = !dl.overdue && dl.closingSoon;
                return (
                  <button
                    key={j.id}
                    type="button"
                    className="flex min-h-[52px] w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition-colors hover:bg-fog/60 focus-ring"
                    onClick={() => navigate("job", { id: String(j.id) })}
                  >
                    <IconChip icon={Briefcase} tone="amber" size={36} iconSize={16} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium text-ink">{j.title}</p>
                      <p className="mt-0.5 truncate text-xs text-stone">
                        {[j.positionType, j.position?.placeOfAssignment, j.position?.division].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    {urgent ? (
                      <StatusPill
                        className="num shrink-0"
                        variant="warn"
                        status={`Deadline ${formatDate(j.deadlineDate)}`}
                      />
                    ) : (
                      <span className={`num shrink-0 text-xs ${dl.overdue ? "text-pebble" : "text-stone"}`}>
                        {dl.overdue ? "Closed" : `Deadline ${formatDate(j.deadlineDate)}`}
                      </span>
                    )}
                    <span className="dlg-pill num shrink-0 bg-fog px-2.5 py-1 text-xs font-medium text-stone">
                      {j.applicationCount} application{j.applicationCount === 1 ? "" : "s"}
                    </span>
                  </button>
                );
              })
            )}
          </SectionCard>

          {/* Recent activity */}
          <SectionCard
            title="Recent activity"
            description="Latest applications across all postings"
            icon={Inbox}
            chipTone="plum"
            actions={
              <span className="dlg-pill bg-fog px-2.5 py-1 text-xs font-medium text-stone">
                <span className="num">{stats.recent.length}</span>
              </span>
            }
            bodyClassName="divide-y divide-[#eef1f7]"
          >
            {stats.recent.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="No applications yet."
                description="Recent applications will appear here as candidates apply."
                compact
              />
            ) : (
              stats.recent.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="flex min-h-[52px] w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition-colors hover:bg-fog/60 focus-ring"
                  onClick={() => navigate("candidate", { id: String(r.applicant.id) })}
                >
                  <span aria-hidden="true" className="contents">
                    <Monogram size={32}>{initialsOf(fullName(r.applicant))}</Monogram>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-ink">{fullName(r.applicant)}</p>
                    <p className="mt-0.5 truncate text-xs text-stone">
                      {[r.positionTitle || r.jobTitle, formatDate(r.dateApplied)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <StatusPill status={getStatusMeta(r.status).label} variant={variantForStatus(r.status)} />
                </button>
              ))
            )}
          </SectionCard>
        </div>

        {/* System overview aside — sticky on xl */}
        <aside className="w-full shrink-0 space-y-6 self-start xl:sticky xl:top-24 xl:w-[320px]">
          <SectionCard title="System overview" icon={LayoutDashboard} chipTone="slate">
            <dl className="divide-y divide-[#eef1f7]">
              {(
                [
                  ["Applicants", stats.applicants],
                  ["Active jobs", stats.activeJobs],
                  ["Applications", stats.totalApplications],
                  ["Shortlisted", stats.shortlisted],
                ] as [string, number][]
              ).map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="text-[13px] text-stone">{label}</dt>
                  <dd className="num text-sm font-semibold text-ink">{value}</dd>
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
            <div className="mt-4 space-y-2.5 border-t border-[#eef1f7] pt-4">
              {(
                [
                  [CalendarClock, stats.needsAttention.deadlinesThisWeek, "posting deadline(s) within 7 days", "warn"],
                  [UserX, stats.needsAttention.blockedUsers, "blocked account(s)", "bad"],
                  [AlertTriangle, stats.needsAttention.failedLogins24h, "failed login(s) in the last 24 h", "bad"],
                ] as [typeof CalendarClock, number, string, "warn" | "bad"][]
              ).map(([Icon, count, label, alertTone]) => (
                <p key={label} className="flex items-center gap-2 text-xs text-body-gray">
                  <span aria-hidden="true" className={`stage-dot ${alertDotClass(count, alertTone)}`} />
                  <span>
                    <span className="num font-medium text-ink">{count}</span> {label}
                  </span>
                </p>
              ))}
            </div>
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}
