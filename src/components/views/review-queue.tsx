"use client";

// ============================================================================
// RMIS — Evaluator review queue (spec §7.8). Kanban (default) and List modes
// over /api/evaluator/queue. 15 s silent poll + focus refresh + manual refresh.
// "Qualified only" lens, stage tabs (list), bulk regret letters with confirm.
// Card / row review actions open the ReviewWorkspace in a Dialog.
// Bevel pass: shared page-header anatomy + cloud stat cards, capsule segmented
// toggles, white hairline table-card, quiet round row actions. 4-column kanban
// keeps the shared reference-board primitives (dot+label+count columns, pastel
// avatars, match badge, credential tags). Handlers byte-identical.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowUpRight, Building2, Clock, Inbox, LayoutGrid, List, MailX, MapPin, UserRound,
  RefreshCw,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  EmptyState, PageHeader, SkeletonKanban, SkeletonRows,
} from "@/components/ui/shell";
import {
  KanbanAvatar, KanbanColumn, KanbanTags, KANBAN_CARD, KANBAN_DIVIDER, MatchBadge, StageDot,
} from "@/components/ui/kanban";
import { apiFetch, appliedAgo, formatDate, fullName, humanize } from "@/lib/client";
import { PIPELINE_STAGES, stageForStatus, type StageKey } from "@/lib/status";
import { navigate } from "@/lib/router";
import { useSession } from "@/components/session-provider";
import { ghostBtn, iconBtn } from "@/components/views/recruitment";
import { ReviewWorkspace, StatusPill, VerdictPill } from "@/components/views/review-workspace";

// ── Wire shapes ─────────────────────────────────────────────────────────────

type QueueRow = {
  id: number;
  status: string;
  stage: StageKey;
  reason: string | null;
  dateApplied: string;
  applicantId: number;
  jobId: number;
  applicant: {
    id: number;
    firstName: string | null;
    lastName: string | null;
    emailAddress: string | null;
    contactNumber: string | null;
    gender: string | null;
    isProfileComplete: boolean;
  };
  job: {
    id: number;
    title: string;
    position: { positionTitle: string; placeOfAssignment: string | null } | null;
  };
  match: { verdict: string; metCount: number; requiredCount: number };
  tags: string[];
};

type RegretSummary = {
  total: number;
  sent: number;
  alreadySent: number;
  shortlisted: number;
  failed: number;
  notFound: number;
};

// ── Small shared visuals ────────────────────────────────────────────────────

function useFocusRefresh(fn: () => void) {
  useEffect(() => {
    const onFocus = () => fn();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [fn]);
}

// ── Component ───────────────────────────────────────────────────────────────

export default function ReviewQueue() {
  // QA 2026-02: administrators can assist with review activities — the scope
  // note below makes that access explicit to avoid evaluator overlap.
  const { user } = useSession();
  const isAdmin = user?.role === "ADMIN";
  const [queue, setQueue] = useState<QueueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qualifiedOnly, setQualifiedOnly] = useState(false);
  const [mode, setMode] = useState<"kanban" | "list">("kanban");
  const [listStage, setListStage] = useState<"All" | StageKey>("All");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [regretOpen, setRegretOpen] = useState(false);
  const [regretBusy, setRegretBusy] = useState(false);
  const [spin, setSpin] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      const q = await apiFetch<{ data: QueueRow[] }>("/api/evaluator/queue?pageSize=100");
      setQueue(q.data);
      if (!silent) setError(null);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Failed to load the review queue");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 15 s silent poll + refetch-on-focus (spec §13).
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) void load(true);
    }, 15_000);
    return () => clearInterval(id);
  }, [load]);
  useFocusRefresh(() => void load(true));

  const manualRefresh = useCallback(() => {
    setSpin(true);
    void load(true).finally(() => setTimeout(() => setSpin(false), 500));
  }, [load]);

  const applications = useMemo(() => queue ?? [], [queue]);
  const filtered = useMemo(
    () => (qualifiedOnly ? applications.filter((r) => r.match?.verdict === "ALL_MET") : applications),
    [applications, qualifiedOnly]
  );
  const listRows = useMemo(
    () => (listStage === "All" ? filtered : filtered.filter((r) => stageForStatus(r.status) === listStage)),
    [filtered, listStage]
  );
  const rejectedIds = useMemo(
    () => filtered.filter((r) => stageForStatus(r.status) === "Rejected").map((r) => r.id),
    [filtered]
  );

  const kanbanColumns = useMemo(() => {
    const map: Record<StageKey, QueueRow[]> = { "Applied": [], "Under Review": [], "Shortlisted": [], "Rejected": [] };
    for (const r of filtered) map[stageForStatus(r.status)].push(r);
    return map;
  }, [filtered]);

  const sendRegrets = async () => {
    setRegretBusy(true);
    try {
      const res = await apiFetch<{ summary: RegretSummary }>("/api/evaluator/applications/regrets", {
        method: "POST",
        body: { applicationIds: rejectedIds },
      });
      const s = res.summary;
      const parts = [
        `${s.sent} sent`,
        `${s.alreadySent} already sent`,
        s.shortlisted ? `${s.shortlisted} shortlisted skipped` : "",
        s.failed ? `${s.failed} failed` : "",
        s.notFound ? `${s.notFound} not found` : "",
      ].filter(Boolean);
      if (s.sent > 0) {
        toast.success(`Regret letters: ${s.sent} sent`, { description: parts.join(" · ") });
      } else {
        toast.info("No new regret letters sent", { description: parts.join(" · ") });
      }
      setRegretOpen(false);
      await load(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send regret letters");
    } finally {
      setRegretBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Enterprise page header (PageHeader) — shared anatomy across all views */}
      <PageHeader
        title="Review Queue"
        description="Screen applications, verify minimum qualifications, and advance candidates through the pipeline."
        actions={
          <>
            <span className="status-pill status-neutral num">
              {filtered.length} application{filtered.length === 1 ? "" : "s"}
            </span>
            <label className="dlg-ghost focus-ring inline-flex min-h-[44px] cursor-pointer items-center gap-2 px-3.5 text-sm text-stone">
              <Switch checked={qualifiedOnly} onCheckedChange={setQualifiedOnly} aria-label="Qualified only" />
              Qualified only
            </label>
            <div className="flex items-center gap-1 rounded-full bg-fog p-1" role="group" aria-label="View mode">
              <button
                type="button"
                className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors ${mode === "kanban" ? "bg-white text-ink shadow-sm" : "text-stone hover:text-ink"}`}
                onClick={() => setMode("kanban")}
                aria-pressed={mode === "kanban"}
              >
                <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
                Kanban
              </button>
              <button
                type="button"
                className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors ${mode === "list" ? "bg-white text-ink shadow-sm" : "text-stone hover:text-ink"}`}
                onClick={() => setMode("list")}
                aria-pressed={mode === "list"}
              >
                <List className="h-3.5 w-3.5" aria-hidden />
                List
              </button>
            </div>
            <button type="button" className={ghostBtn} onClick={manualRefresh}>
              <RefreshCw className={`h-4 w-4 ${spin ? "animate-spin" : ""}`} aria-hidden />
              Refresh
            </button>
          </>
        }
      />
      {/* QA 2026-02: scope of administrator access to Review */}
      {isAdmin && (
        <p className="rounded-xl bg-cloud/70 px-4 py-2.5 text-xs leading-relaxed text-body-gray" role="note">
          <span className="font-semibold text-ink">Administrator access:</span>{" "}
          you can view and assist with every evaluation in this queue. Scoring decisions and
          recommendations remain the responsibility of the assigned evaluators.
        </p>
      )}

      {/* Stage tabs (list mode only) */}
      {mode === "list" && (
        <div className="flex flex-wrap items-center gap-2">
          {(["All", ...PIPELINE_STAGES] as const).map((s) => {
            const count = s === "All" ? filtered.length : filtered.filter((r) => stageForStatus(r.status) === s).length;
            const active = listStage === s;
            return (
              <button
                key={s}
                type="button"
                className={`inline-flex min-h-[36px] items-center gap-2 rounded-full px-3.5 text-xs font-medium transition-colors ${active ? "bg-ink text-[#ebf0f8]" : "dlg-ghost"}`}
                onClick={() => setListStage(s)}
                aria-pressed={active}
              >
                {s !== "All" && <StageDot stage={s} />}
                {s}
                <span className={`num rounded-full px-1.5 ${active ? "bg-white/20" : "bg-fog"}`}>{count}</span>
              </button>
            );
          })}
          {listStage === "Rejected" && rejectedIds.length > 0 && (
            <button
              type="button"
              className={ghostBtn + " border-[var(--bad)]/30 text-[var(--bad)] hover:bg-[var(--bad-bg)]"}
              onClick={() => setRegretOpen(true)}
            >
              <MailX className="h-4 w-4" aria-hidden />
              Send regret letters ({rejectedIds.length})
            </button>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="dlg-card p-8">
          <EmptyState
            icon={AlertTriangle}
            tone="rose"
            title="Couldn't load the review queue"
            description={error}
            action={
              <button type="button" className={ghostBtn} onClick={() => void load()}>
                Retry
              </button>
            }
          />
        </div>
      )}

      {/* Loading skeleton */}
      {!error && queue === null && (
        <>
          {mode === "kanban" ? <SkeletonKanban columns={4} /> : <SkeletonRows rows={8} rowClassName="h-16" />}
        </>
      )}

      {/* Kanban — reference board: tinted columns, floating cards, "N more" expanders */}
      {!error && queue !== null && mode === "kanban" && (
        <div className="flex snap-x snap-proximity items-stretch gap-4 overflow-x-auto scroll-thin pb-2 md:grid md:grid-cols-2 xl:grid-cols-4 md:overflow-visible md:pb-0">
          {PIPELINE_STAGES.map((stage) => {
            const rows = kanbanColumns[stage];
            return (
              <KanbanColumn key={stage} label={stage} stage={stage} count={rows.length}>
                {rows.map((row) => {
                    const position = row.job.position?.positionTitle || row.job.title;
                    const place = row.job.position?.placeOfAssignment ?? null;
                    const name = fullName(row.applicant);
                    return (
                      <div
                        key={row.id}
                        role="button"
                        tabIndex={0}
                        className={KANBAN_CARD + " group/card focus-ring cursor-pointer p-4"}
                        onClick={() => setSelectedId(row.id)}
                        onKeyDown={(e) => e.key === "Enter" && setSelectedId(row.id)}
                        aria-label={`Review application from ${name}`}
                      >
                        <div className="flex items-start gap-2.5">
                          <KanbanAvatar name={name} />
                          <div className="min-w-0 flex-1">
                            <p className="min-w-0 truncate text-sm font-semibold text-ink">{name}</p>
                            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-stone">
                              <Building2 className="h-3.5 w-3.5 shrink-0 text-pebble" aria-hidden />
                              <span className="min-w-0 flex-1 truncate">{humanize(position)}</span>
                            </p>
                            <p className="mt-1 flex items-center gap-1.5 text-xs text-stone">
                              {place && (
                                <>
                                  <MapPin className="h-3.5 w-3.5 shrink-0 text-pebble" aria-hidden />
                                  <span className="min-w-0 truncate">{place}</span>
                                  <span className="shrink-0 text-pebble" aria-hidden>·</span>
                                </>
                              )}
                              <Clock className="h-3.5 w-3.5 shrink-0 text-pebble" aria-hidden />
                              <span className="shrink-0 whitespace-nowrap text-pebble">Applied {appliedAgo(row.dateApplied)}</span>
                            </p>
                          </div>
                          <MatchBadge metCount={row.match?.metCount ?? 0} requiredCount={row.match?.requiredCount ?? 0} />
                        </div>
                        <div className={KANBAN_DIVIDER + " relative flex items-center"}>
                          <KanbanTags tags={row.tags ?? []} className="min-w-0 flex-1 pr-8" />
                          <button
                            type="button"
                            className="absolute top-1/2 right-0 grid h-7 w-7 -translate-y-1/2 place-items-center text-stone transition-opacity hover:bg-fog hover:text-ink focus-ring opacity-0 focus-visible:opacity-100 group-hover/card:opacity-100 max-lg:opacity-100"
                            aria-label={`Open ${name}'s profile`}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate("candidate", { id: String(row.applicantId) });
                            }}
                          >
                            <UserRound className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </KanbanColumn>
            );
          })}
        </div>
      )}

      {/* List */}
      {!error && queue !== null && mode === "list" && (
        <div className="space-y-3">
          {listRows.length === 0 ? (
            <div className="dlg-card p-6 sm:p-10">
              <EmptyState
                icon={Inbox}
                title="No applications in the queue"
                description={listStage === "All" ? "Applications appear here once candidates apply." : `No applications in the ${listStage} stage yet.`}
              />
            </div>
          ) : (
            <div className="dlg-card-plain table-card overflow-hidden">
              <div className="overflow-x-auto scroll-thin">
                <table className="w-full min-w-[760px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left">
                      <th scope="col" className="eyebrow px-5 py-3">Candidate</th>
                      <th scope="col" className="eyebrow px-4 py-3">Position</th>
                      <th scope="col" className="eyebrow px-4 py-3">Applied</th>
                      <th scope="col" className="eyebrow px-4 py-3">Status</th>
                      <th scope="col" className="eyebrow px-4 py-3">Verdict</th>
                      <th scope="col" className="px-4 py-3"><span className="sr-only">Open</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {listRows.map((row) => {
                      const decided = stageForStatus(row.status) === "Shortlisted" || stageForStatus(row.status) === "Rejected";
                      const position = row.job.position?.positionTitle || row.job.title;
                      const place = row.job.position?.placeOfAssignment ?? null;
                      const name = fullName(row.applicant);
                      return (
                        <tr key={row.id} className="group/row border-b border-[var(--border)] transition-colors last:border-0 hover:bg-fog/60">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <KanbanAvatar name={name} size={32} />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-ink">{name}</p>
                                <p className="truncate text-xs text-stone">{row.applicant.emailAddress || "No email on record"}</p>
                              </div>
                            </div>
                          </td>
                          <td className="max-w-[220px] px-4 py-3">
                            <p className="truncate text-[13px] text-ink">{humanize(position)}</p>
                            <p className="truncate text-xs text-stone">{place || "-"}</p>
                          </td>
                          <td className="num whitespace-nowrap px-4 py-3 text-[13px] text-stone">{formatDate(row.dateApplied)}</td>
                          <td className="px-4 py-3"><StatusPill status={row.status} /></td>
                          <td className="px-4 py-3"><VerdictPill verdict={row.match?.verdict} /></td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100 max-lg:opacity-100">
                              <button
                                type="button"
                                className={iconBtn}
                                aria-label={decided ? `View decision for ${name}` : `Review application from ${name}`}
                                title={decided ? "View decision" : "Review"}
                                onClick={() => setSelectedId(row.id)}
                              >
                                <ArrowUpRight className="h-4 w-4" aria-hidden />
                              </button>
                              <button
                                type="button"
                                className={iconBtn}
                                aria-label={`Open ${name}'s profile`}
                                title="Open profile"
                                onClick={() => navigate("candidate", { id: String(row.applicantId) })}
                              >
                                <UserRound className="h-4 w-4" aria-hidden />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Review modal — much wider surface (1440px cap) so the dossier and
          decision rail breathe; bounded dossier sections scroll internally. */}
      <Dialog open={selectedId !== null} onOpenChange={(v) => !v && setSelectedId(null)}>
        <DialogContent className="w-[min(96vw,1440px)] sm:max-w-[1440px] max-h-[92dvh] overflow-y-auto scroll-thin">
          <DialogHeader className="sr-only">
            <DialogTitle>Review application</DialogTitle>
            <DialogDescription>Applicant dossier and decision rail</DialogDescription>
          </DialogHeader>
          {selectedId !== null && (
            <ReviewWorkspace
              applicationId={selectedId}
              bounded
              onClose={() => setSelectedId(null)}
              onDecided={() => void load(true)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk regret confirm */}
      <AlertDialog open={regretOpen} onOpenChange={setRegretOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send {rejectedIds.length} regret letter{rejectedIds.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Formal regret emails will be sent to every rejected-stage application currently filtered. Shortlisted
              applications are hard-skipped, and applicants who already received a letter are not emailed again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="border border-[var(--bad)]/30 bg-[var(--bad-bg)] text-[var(--bad)] hover:bg-[var(--bad-bg)]/80"
              onClick={(e) => {
                e.preventDefault();
                void sendRegrets();
              }}
            >
              {regretBusy ? "Sending…" : "Send letters"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
