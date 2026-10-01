"use client";

// ============================================================================
// RMIS — Analytics (spec §7.13, `#/analytics`). Pipeline conversion funnel
// (clickable → drill filter), application volume chart (last 30 days,
// recharts), status distribution donut, drill-down candidate list, and the
// audit activity feed. "Executive Ink" chart pass: viz-series palette,
// .chart-tip tooltips, hairline dividers. Sources: /api/admin/stats +
// evaluator queue + audit logs.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";
import {
  AlertTriangle, Filter, History, Inbox, ChartPie as ChartPieIcon,
  RefreshCw, ShieldCheck, TrendingUp, UsersRound,
} from "lucide-react";
import {
  EmptyState, Monogram, PageHeader, SectionCard, SkeletonKpis, SkeletonRows, StatusPill,
} from "@/components/ui/shell";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiFetch, formatDate, fullName, humanize, timeAgo } from "@/lib/client";
import { PIPELINE_STAGES, stageForStatus, getStatusMeta, type StageKey } from "@/lib/status";
import { navigate } from "@/lib/router";
import { dotClass, variantForStatus, type StatusVariant } from "@/lib/status-ui";
import { ghostBtn } from "@/components/views/recruitment";
import { useSession } from "@/components/session-provider";

type Stats = {
  byStatus: { status: string; count: number }[];
  totalApplications: number;
  pendingReview: number;
  shortlisted: number;
  rejected: number;
  // QA 2026-02: system/web usage + security counters (admin analytics).
  totalUsers?: number;
  admins?: number;
  evaluators?: number;
  applicants?: number;
  activeJobs?: number;
  needsAttention?: {
    failedLogins24h: number;
    deadlinesThisWeek: number;
    blockedUsers: number;
    incompleteProfiles: number;
  };
};

type QueueRow = {
  id: number;
  status: string;
  stage: StageKey;
  dateApplied: string;
  applicantId: number;
  applicant: { id: number; firstName: string | null; lastName: string | null; emailAddress: string | null };
  job: { id: number; title: string };
  match: { verdict: string; metCount: number; requiredCount: number };
};

type AuditRow = {
  id: number;
  timestamp: string;
  userLabel: string | null;
  userRole: string | null;
  action: string;
  description: string | null;
};

type Drill = "All" | StageKey;

// ── Data-viz tokens (Bevel viz series — globals.css --viz-1..5) & chrome ────

<<<<<<< Updated upstream
const GRID = "#eef1f7";
const TICK = { fontSize: 11, fill: "#8d939e" };
=======
const GRID = "#e6ebf3";
const TICK = { fontSize: 11, fill: "#5d6067" };
const VIZ_1 = "#415eee"; // Metric Blue
>>>>>>> Stashed changes

/** Metric Blue from the viz series — funnel track fill + volume area stroke. */
const VIZ_1 = "var(--viz-1)";

/** Donut slice fill per stage — Bevel viz series (no raw neon greens/golds). */
const STAGE_BAR: Record<StageKey, string> = {
  "Applied": "var(--viz-1)", // Metric Blue
  "Under Review": "var(--viz-3)", // Signal Gold
  "Shortlisted": "var(--viz-2)", // Recovery Green
  "Rejected": "var(--viz-5)", // Coral Signal
};

/** Stage-dot variant per stage (mirrors STAGE_BAR hues). */
const STAGE_VARIANT: Record<StageKey, StatusVariant> = {
  "Applied": "info",
  "Under Review": "warn",
  "Shortlisted": "ok",
  "Rejected": "bad",
};

/** Donut slice fill for a stored status spelling (stage tokens + fallback). */
function statusSliceColor(status: string): string {
  const key = STAGE_BAR[stageForStatus(status) as StageKey];
  return key ?? "#d5dce8";
}

/** Audit line dot: red for failures, green for creating actions, graphite otherwise. */
function auditDotClass(action: string): string {
  const a = action.toUpperCase();
  if (a.includes("FAIL") || a.includes("DENY") || a.includes("BLOCK") || a.includes("DELETE")) return "dot-bad";
  if (
    a.includes("CREATE") || a.includes("APPROVE") || a.includes("PUBLISH") ||
    a.includes("RESOLVE") || a.includes("SUBMIT")
  ) {
    return "dot-ok";
  }
  return "dot-info";
}

// ── Recharts tooltips — wrapped in the shared .chart-tip chrome ─────────────

type TipEntry = { value?: number | string; name?: string | number };

function VolumeTip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  label?: string | number;
  payload?: TipEntry[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <p className="tip-label">{label}</p>
      <div className="tip-row">
        <span>Applications</span>
        <span className="num">{payload[0].value}</span>
      </div>
    </div>
  );
}

function DonutTip({ active, payload }: { active?: boolean; payload?: TipEntry[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <p className="tip-label">{payload[0].name}</p>
      <div className="tip-row">
        <span>Applications</span>
        <span className="num">{payload[0].value}</span>
      </div>
    </div>
  );
}

/** First-letter monogram text ("?" when empty). */
function monogramOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export default function Analytics() {
  // QA 2026-02: evaluators see recruitment analytics only — the system usage
  // panel and the security/audit activity feed are administrator territory.
  const { user } = useSession();
  const isAdmin = user?.role === "ADMIN";
  const [stats, setStats] = useState<Stats | null>(null);
  const [queue, setQueue] = useState<QueueRow[] | null>(null);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [auditTotal, setAuditTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [drill, setDrill] = useState<Drill>("All");
  const [cycle, setCycle] = useState("all-time");
  const [spin, setSpin] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      // QA 2026-02: evaluators get recruitment analytics only — the audit
      // feed fetch is skipped entirely for them (admin-only endpoint).
      const [s, q, a] = await Promise.all([
        apiFetch<Stats>("/api/admin/stats"),
        apiFetch<{ data: QueueRow[] }>("/api/evaluator/queue?pageSize=100"),
        isAdmin
          ? apiFetch<{ data: AuditRow[]; total: number }>("/api/admin/audit-logs?pageSize=20")
          : Promise.resolve({ data: [] as AuditRow[], total: 0 }),
      ]);
      setStats(s);
      setQueue(q.data);
      setAudit(a.data);
      setAuditTotal(a.total);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Failed to load analytics");
    }
  }, [isAdmin]);

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

  const rows = useMemo(() => queue ?? [], [queue]);

  const funnel = useMemo(() => {
    const applied = rows.filter((r) => stageForStatus(r.status) === "Applied").length;
    return PIPELINE_STAGES.map((stage) => {
      const count = rows.filter((r) => stageForStatus(r.status) === stage).length;
      const pct = applied > 0 ? Math.round((count / applied) * 100) : 0;
      return { stage, count, pct };
    });
  }, [rows]);

  const volume = useMemo(() => {
    const buckets = new Map<string, number>();
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const day = new Date(today);
      day.setDate(today.getDate() - i);
      buckets.set(day.toISOString().slice(0, 10), 0);
    }
    for (const r of rows) {
      const key = new Date(r.dateApplied);
      if (Number.isNaN(key.getTime())) continue;
      const k = key.toISOString().slice(0, 10);
      if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1);
    }
    return Array.from(buckets.entries()).map(([day, applications]) => ({
      day: formatDate(`${day}T00:00:00`).replace(/,.*/, ""),
      applications,
    }));
  }, [rows]);

  const drillRows = useMemo(
    () => (drill === "All" ? rows : rows.filter((r) => stageForStatus(r.status) === drill)),
    [rows, drill]
  );

  // Donut slices (zero-count statuses dropped so the ring stays readable).
  const donutData = useMemo(
    () => (stats?.byStatus ?? []).filter((d) => d.count > 0),
    [stats]
  );
  const donutTotal = useMemo(() => donutData.reduce((sum, d) => sum + d.count, 0), [donutData]);

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Analytics"
          description="Pipeline health, application volume, and audit activity."
        />
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

  if (!stats || queue === null || audit === null) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Analytics"
          description="Pipeline health, application volume, and audit activity."
        />
        <div className="space-y-6">
          <SkeletonKpis count={4} />
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="data-card p-5 sm:p-6">
              <SkeletonRows rows={4} rowClassName="h-14 rounded-lg" />
            </div>
            <div className="data-card p-5 sm:p-6">
              <SkeletonRows rows={4} rowClassName="h-14 rounded-lg" />
            </div>
          </div>
          <div className="data-card p-5 sm:p-6">
            <SkeletonRows rows={4} rowClassName="h-14 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Enterprise page header (PageHeader) — shared anatomy across all views */}
      <PageHeader
        title="Analytics"
        description="Pipeline health, application volume, and audit activity."
        actions={
          <button type="button" className={ghostBtn} onClick={manualRefresh}>
            <RefreshCw className={`h-4 w-4 ${spin ? "animate-spin" : ""}`} aria-hidden />
            Refresh
          </button>
        }
      />

      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
        {/* 1. Pipeline funnel + 2. Applications per day + 3. Status distribution */}
        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard
            title="Pipeline conversion"
            description="Click a stage to drill into its applicants. Percentages are of Applied."
            icon={Filter}
            chipTone="plum"
          >
            <div className="space-y-1">
              {funnel.map((f) => {
                const active = drill === f.stage;
                return (
                  <button
                    key={f.stage}
                    type="button"
                    className={`focus-ring min-h-12 w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
                      active ? "bg-fog" : "hover:bg-fog/60"
                    }`}
                    onClick={() => setDrill(drill === f.stage ? "All" : f.stage)}
                    aria-pressed={active}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`stage-dot ${dotClass(STAGE_VARIANT[f.stage])}`} aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{f.stage}</span>
                      <span className="num text-sm font-semibold text-ink">{f.count}</span>
                      <span className="num w-10 shrink-0 text-right text-xs text-body-gray">{f.pct}%</span>
                    </div>
                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-fog">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.min(100, f.pct)}%`, background: VIZ_1 }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </SectionCard>

          <div className="space-y-6">
            <SectionCard
              title="Applications per day"
              description="Last 30 days, from the review queue."
              icon={TrendingUp}
              chipTone="plum"
            >
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={volume} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="analytics-volume-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(65,94,238,0.22)" />
                      <stop offset="100%" stopColor="rgba(65,94,238,0)" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tick={TICK} tickMargin={8} interval={6} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={TICK} axisLine={false} tickLine={false} />
                  <RTooltip content={<VolumeTip />} cursor={{ fill: "rgba(31,32,37,0.04)" }} />
                  <Area
                    type="monotone"
                    dataKey="applications"
                    stroke={VIZ_1}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    fill="url(#analytics-volume-fill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </SectionCard>

            <SectionCard
              title="Status distribution"
              description="All applications by stored status."
              icon={ChartPieIcon}
              chipTone="plum"
            >
              {donutData.length === 0 ? (
                <EmptyState icon={Inbox} tone="plum" title="No applications recorded yet." compact />
              ) : (
                // minmax(0,1fr): the legend rows' nowrap labels must not floor
                // the 1fr track's auto minimum (observed OV=61 at 1024px).
                <div className="grid grid-cols-1 items-center gap-6 sm:grid-cols-[200px_minmax(0,1fr)]">
                  {/* Donut with centered total — the award-dash staple */}
                  <div className="relative mx-auto h-[200px] w-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <RTooltip content={<DonutTip />} />
                        <Pie
                          data={donutData}
                          dataKey="count"
                          nameKey="status"
                          innerRadius={58}
                          outerRadius={92}
                          paddingAngle={3}
                          cornerRadius={6}
                          strokeWidth={0}
                          startAngle={90}
                          endAngle={-270}
                        >
                          {donutData.map((d) => (
                            <Cell key={d.status} fill={statusSliceColor(d.status)} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 grid place-items-center">
                      <div className="text-center">
                        <p className="num font-display text-[32px] font-semibold leading-none tracking-[-0.02em] text-ink">
                          {donutTotal}
                        </p>
                        <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.08em] text-stone">
                          Applications
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Legend — stage dot + label + right-aligned count & %, hairline rows */}
                  <ul className="divide-y divide-[#eef1f7]">
                    {donutData.map((d) => (
                      <li key={d.status} className="flex items-center gap-2.5 py-2.5 text-sm first:pt-0 last:pb-0">
                        <span aria-hidden className={`stage-dot ${dotClass(variantForStatus(d.status))}`} />
                        <span className="min-w-0 flex-1 truncate text-body-gray">{d.status}</span>
                        <span className="num font-semibold text-ink">{d.count}</span>
                        <span className="num w-12 shrink-0 text-right text-xs text-body-gray">
                          {donutTotal > 0 ? `${Math.round((d.count / donutTotal) * 100)}%` : "0%"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </SectionCard>
          </div>
        </div>

        {/* 4. Drill-down */}
        <SectionCard
          title="Drill-down"
          description={drill === "All" ? "All stages." : `Filtered to ${drill}.`}
          icon={UsersRound}
          chipTone="plum"
          actions={
            <>
              <Select value={drill} onValueChange={(v) => setDrill(v as Drill)}>
                <SelectTrigger className="dlg-input min-h-[44px] w-full sm:w-[170px]" aria-label="Stage drill filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All stages</SelectItem>
                  {PIPELINE_STAGES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={cycle} onValueChange={setCycle}>
                <SelectTrigger className="dlg-input min-h-[44px] w-full sm:w-[140px]" aria-label="Recruitment cycle">
                  <SelectValue placeholder="All time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-time">All time</SelectItem>
                </SelectContent>
              </Select>
            </>
          }
        >
          {drillRows.length === 0 ? (
            <EmptyState icon={UsersRound} tone="plum" title="No applicants in this selection." compact />
          ) : (
            <div className="max-h-96 divide-y divide-[#eef1f7] overflow-y-auto scroll-thin pr-1">
              {drillRows.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="flex min-h-[52px] w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-fog/60 focus-ring"
                  onClick={() => navigate("candidate", { id: String(r.applicantId) })}
                >
                  <span aria-hidden="true" className="contents">
                    <Monogram size={32}>{monogramOf(fullName(r.applicant))}</Monogram>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-ink">{fullName(r.applicant)}</p>
                    <p className="truncate text-xs text-stone">
                      {r.job.title} · Applied {formatDate(r.dateApplied)}
                    </p>
                  </div>
                  <StatusPill status={getStatusMeta(r.status).label} variant={variantForStatus(r.status)} />
                </button>
              ))}
            </div>
          )}
        </SectionCard>

        {/* 5a. System usage & security (QA 2026-02 — admin analytics) */}
        {isAdmin && (
          <SectionCard
            title="System usage & security"
            description="Web usage and security signals for the RMIS deployment"
            icon={ShieldCheck}
            chipTone="emerald"
          >
<<<<<<< Updated upstream
            <div className="grid gap-x-10 gap-y-2 lg:grid-cols-2">
              <div>
                <p className="thead-cell mb-1.5">Security</p>
                <dl className="divide-y divide-[#eef1f7]">
                  {(
                    [
                      ["Registered accounts", stats?.totalUsers, "info"],
                      ["Blocked accounts", stats?.needsAttention?.blockedUsers, "bad"],
                      ["Failed logins · 24h", stats?.needsAttention?.failedLogins24h, "bad"],
                      ["Incomplete profiles", stats?.needsAttention?.incompleteProfiles, "warn"],
                    ] as [string, number | undefined, "info" | "warn" | "bad"][]
                  ).map(([label, value, tone]) => (
                    <div key={label} className="flex items-center justify-between gap-3 py-2.5">
                      <dt className="flex items-center gap-2.5 text-[13px] text-stone">
                        <span
                          aria-hidden
                          className={`stage-dot ${tone === "info" ? "dot-info" : value ? `dot-${tone}` : "dot-ok"}`}
                        />
                        {label}
                      </dt>
                      <dd className="num text-sm font-semibold text-ink">{value ?? "—"}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div>
                <p className="thead-cell mb-1.5">Usage</p>
                <dl className="divide-y divide-[#eef1f7]">
                  {(
                    [
                      ["Applicants", stats?.applicants],
                      ["Evaluators", stats?.evaluators],
                      ["Administrators", stats?.admins],
                    ] as [string, number | undefined][]
                  ).map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-3 py-2.5">
                      <dt className="flex items-center gap-2.5 text-[13px] text-stone">
                        <span aria-hidden className="stage-dot dot-info" />
                        {label}
                      </dt>
                      <dd className="num text-sm font-semibold text-ink">{value ?? "—"}</dd>
                    </div>
                  ))}
                </dl>
              </div>
=======
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {(
                [
                  ["Registered accounts", stats?.totalUsers],
                  ["Blocked accounts", stats?.needsAttention?.blockedUsers],
                  ["Failed logins · 24h", stats?.needsAttention?.failedLogins24h],
                  ["Incomplete profiles", stats?.needsAttention?.incompleteProfiles],
                ] as [string, number | undefined][]
              ).map(([label, value]) => (
                <div key={label} className="rounded-lg bg-cloud p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.08em] text-stone">{label}</p>
                  <p className="num mt-2 text-3xl font-semibold tracking-[-0.02em] text-ink">{value ?? "-"}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
              {(
                [
                  ["Applicants", stats?.applicants],
                  ["Evaluators", stats?.evaluators],
                  ["Administrators", stats?.admins],
                ] as [string, number | undefined][]
              ).map(([label, value]) => (
                <div key={label} className="rounded-lg bg-cloud/60 p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.08em] text-stone">{label}</p>
                  <p className="num mt-1.5 text-xl font-semibold tracking-[-0.02em] text-ink">{value ?? "-"}</p>
                </div>
              ))}
>>>>>>> Stashed changes
            </div>
            <p className="mt-4 text-xs leading-relaxed text-body-gray">
              Recent system activity and the full security/audit log live in{" "}
              <button
                type="button"
                onClick={() => navigate("settings", { tab: "audit" })}
                className="text-metric-blue underline underline-offset-2 hover:text-ink"
              >
                Settings → Audit Log
              </button>{" "}
              (administrators only).
            </p>
          </SectionCard>
        )}

        {/* 5. Recent activity (audit feed) — admin only per QA 2026-02 */}
        {isAdmin && (
          <SectionCard
            title="Recent activity"
            description={`${auditTotal} logged event${auditTotal === 1 ? "" : "s"}`}
            icon={History}
            chipTone="plum"
          >
            {audit.length === 0 ? (
              <EmptyState icon={Inbox} tone="plum" title="No audit events recorded yet." compact />
            ) : (
              <div className="max-h-96 divide-y divide-[#eef1f7] overflow-y-auto scroll-thin pr-1">
                {audit.map((a) => (
                  <div
                    key={a.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-2 py-2.5 transition-colors hover:bg-fog/60"
                  >
<<<<<<< Updated upstream
                    <span aria-hidden className={`stage-dot ${auditDotClass(a.action)}`} />
                    <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-ash">
                      {humanize(a.action)}
                    </span>
                    <span className="max-w-[240px] shrink-0 truncate text-[13px] font-medium text-ink">
                      {a.userLabel || "System"}
                    </span>
                    <span className="min-w-[160px] flex-1 truncate text-[13px] text-body-gray">
                      {a.description || "—"}
                    </span>
                    <span className="num shrink-0 text-xs text-body-gray">{timeAgo(a.timestamp)}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
=======
                    {humanize(a.action)}
                  </span>
                  <span className="max-w-[240px] truncate text-[13px] font-medium text-ink">
                    {a.userLabel || "System"}
                  </span>
                  <span className="min-w-[160px] flex-1 truncate text-[13px] text-body-gray">
                    {a.description || "-"}
                  </span>
                  <span className="num shrink-0 text-xs text-body-gray">{timeAgo(a.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
>>>>>>> Stashed changes
        )}
      </div>
    </div>
  );
}
