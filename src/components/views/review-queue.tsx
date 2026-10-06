"use client";

// ============================================================================
// RMIS — Evaluator review queue (spec §7.8). List (default) and Kanban modes
// over /api/evaluator/queue. 15 s silent poll + focus refresh + manual refresh.
// Stage tabs (list), bulk regret letters with confirm. (User direction
// 2026-10: the "Qualified only" lens was removed — the queue always shows
// every application.) Card / row review actions open the ReviewWorkspace in a
// Dialog. List rows carry an always-visible labeled Review button in the
// primary blue capsule (user direction — no hover-reveal arrow; blue fill for
// UI consistency with the stage tabs). Bevel pass: shared page-header anatomy
// + cloud stat cards, capsule segmented toggles, white hairline table-card,
// quiet round row actions. 4-column kanban keeps the shared reference-board
// primitives (dot+label+count columns, pastel avatars, match badge, credential
// tags). Handlers byte-identical.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowUpRight, Inbox, LayoutGrid, List, MailX, UserRound,
  RefreshCw,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  EmptyState, FilterChip, IconChip, PageHeader, SegmentedControl, SkeletonKanban, SkeletonRows,
  StatusPill, VerdictPill, dialogScroll,
} from "@/components/ui/shell";
import { ghostBadModifier, ghostBadBtn, ghostBtn, iconBtn } from "@/components/ui/buttons";
import {
  KanbanAvatar, KanbanCardBody, KanbanColumn, KANBAN_CARD, StageDot,
} from "@/components/ui/kanban";
import { apiFetch, appliedAgo, formatDate, fullName, humanize } from "@/lib/client";
import { PIPELINE_STAGES, stageForStatus, type StageKey } from "@/lib/status";
import { navigate } from "@/lib/router";
import { useSession } from "@/components/session-provider";
import { useFocusRefresh } from "@/lib/use-focus-refresh";
import { cn } from "@/lib/utils";
import { ReviewWorkspace } from "@/components/views/review-workspace";

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

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReviewQueue() {
  // QA 2026-02: administrators can assist with review activities — the scope
  // note below makes that access explicit to avoid evaluator overlap.
  const { user } = useSession();
  const isAdmin = user?.role === "ADMIN";
  const [queue, setQueue] = useState<QueueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // QA 2026-02 (user direction): List is the default working surface — the
  // kanban board stays available as the secondary spatial overview.
  const [mode, setMode] = useState<"kanban" | "list">("list");
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
  const listRows = useMemo(
    () => (listStage === "All" ? applications : applications.filter((r) => stageForStatus(r.status) === listStage)),
    [applications, listStage]
  );
  const rejectedIds = useMemo(
    () => applications.filter((r) => stageForStatus(r.status) === "Rejected").map((r) => r.id),
    [applications]
  );

  const kanbanColumns = useMemo(() => {
    const map: Record<StageKey, QueueRow[]> = { "Applied": [], "Under Review": [], "Shortlisted": [], "Rejected": [] };
    for (const r of applications) map[stageForStatus(r.status)].push(r);
    return map;
  }, [applications]);

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
            <StatusPill
              status={`${applications.length} application${applications.length === 1 ? "" : "s"}`}
              variant="neutral"
              className="num"
            />
            <SegmentedControl
              ariaLabel="Queue view mode"
              value={mode}
              onChange={setMode}
              options={[
                { value: "kanban", label: "Kanban", icon: LayoutGrid },
                { value: "list", label: "List", icon: List },
              ]}
            />
            <button type="button" className={ghostBtn} onClick={manualRefresh}>
              <RefreshCw className={`h-4 w-4 ${spin ? "animate-spin" : ""}`} aria-hidden />
              Refresh
            </button>
          </>
        }
      />
      {/* QA 2026-02: scope of administrator access to Review */}
      {isAdmin && (
        <p className="rounded-xl bg-cloud/70 px-4 py-2.5 text-xs leading-relaxed text-stone" role="note">
          <span className="font-semibold text-ink">Administrator access:</span>{" "}
          you can view and assist with every evaluation in this queue. Scoring decisions and
          recommendations remain the responsibility of the assigned evaluators.
        </p>
      )}

      {/* Stage tabs (list mode only) */}
      {mode === "list" && (
        <div className="flex flex-wrap items-center gap-2">
          {(["All", ...PIPELINE_STAGES] as const).map((s) => {
            const count = s === "All" ? applications.length : applications.filter((r) => stageForStatus(r.status) === s).length;
            const active = listStage === s;
            return (
              <FilterChip key={s} active={active} onClick={() => setListStage(s)} count={count}>
                {s !== "All" && <StageDot stage={s} />}
                {s}
              </FilterChip>
            );
          })}
          {listStage === "Rejected" && rejectedIds.length > 0 && (
            <button type="button" className={ghostBadBtn} onClick={() => setRegretOpen(true)}>
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
                    /* Card container is a div with button semantics — a real
                       <button> here would nest a <button> inside (the profile
                       quick-action) and break HTML validity/hydration. Enter
                       AND Space are handled for keyboard parity. */
                    <div
                      key={row.id}
                      role="button"
                      tabIndex={0}
                      className={KANBAN_CARD + " group/card focus-ring cursor-pointer p-4 text-left"}
                      onClick={() => setSelectedId(row.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedId(row.id);
                        }
                      }}
                      aria-label={`Review application from ${name}`}
                    >
                      <KanbanCardBody
                        name={name}
                        position={humanize(position)}
                        placeOfAssignment={place}
                        appliedLabel={`Applied ${appliedAgo(row.dateApplied)}`}
                        match={{ metCount: row.match?.metCount ?? 0, requiredCount: row.match?.requiredCount ?? 0 }}
                        tags={row.tags ?? []}
                        action={
                          <button
                            type="button"
                            className={cn(
                              iconBtn,
                              "absolute top-1/2 right-0 -translate-y-1/2 opacity-0 focus-visible:opacity-100 group-hover/card:opacity-100 max-lg:opacity-100"
                            )}
                            aria-label={`Open ${name}'s profile`}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate("candidate", { id: String(row.applicantId) });
                            }}
                          >
                            <UserRound className="h-4 w-4" aria-hidden />
                          </button>
                        }
                      />
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
            <div className="dlg-card table-card overflow-hidden">
              {/* In-card header band — same anatomy as the recruitment table */}
              <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4">
                <IconChip icon={UserRound} tone="slate" size={36} iconSize={16} />
                <h2 className="text-base font-semibold tracking-[-0.01em] text-ink">Applications</h2>
                <span className="dlg-pill num ml-auto bg-fog px-2.5 py-1 text-xs font-medium text-stone">
                  {listRows.length} in view
                </span>
              </div>
              <div className="overflow-x-auto scroll-thin">
                <table className="w-full min-w-[760px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left">
                      <th scope="col" className="eyebrow px-5 py-3.5">Candidate</th>
                      <th scope="col" className="eyebrow px-4 py-3.5">Position</th>
                      <th scope="col" className="eyebrow px-4 py-3.5">Applied</th>
                      <th scope="col" className="eyebrow px-4 py-3.5">Status</th>
                      <th scope="col" className="eyebrow px-4 py-3.5">Verdict</th>
                      <th scope="col" className="px-3 py-3.5"><span className="sr-only">Actions</span></th>
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
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <KanbanAvatar name={name} size={32} />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-ink">{name}</p>
                                <p className="truncate text-xs text-stone">{row.applicant.emailAddress || "No email on record"}</p>
                              </div>
                            </div>
                          </td>
                          <td className="max-w-[190px] px-4 py-3.5">
                            <p className="truncate text-[13px] text-ink">{humanize(position)}</p>
                            <p className="truncate text-xs text-stone">{place || "-"}</p>
                          </td>
                          <td className="num whitespace-nowrap px-4 py-3.5 text-[13px] text-stone">{formatDate(row.dateApplied)}</td>
                          <td className="px-4 py-3.5"><StatusPill status={row.status} /></td>
                          <td className="px-4 py-3.5"><VerdictPill verdict={row.match?.verdict} /></td>
                          <td className="px-3 py-3.5 text-right">
                            {/* QA 2026-02 (user direction): the review action is
                                a labeled, always-visible button — no hover-reveal
                                arrow. "View" marks already-decided rows. Primary
                                blue capsule for consistency with the stage tabs. */}
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                className="dlg-cta inline-flex min-h-[36px] items-center gap-1 px-4 text-xs focus-ring"
                                aria-label={decided ? `View decision for ${name}` : `Review application from ${name}`}
                                title={decided ? "View decision" : "Review"}
                                onClick={() => setSelectedId(row.id)}
                              >
                                {decided ? "View" : "Review"}
                                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
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
        <DialogContent className={cn(dialogScroll, "w-[min(96vw,1440px)] sm:max-w-[1440px]")}>
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
              className={cn(ghostBadModifier, "min-h-[44px] px-4 text-sm font-medium")}
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
