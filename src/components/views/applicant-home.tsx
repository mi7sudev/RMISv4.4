"use client";

// ============================================================================
// RMIS — Applicant home ("My Application"): editorial welcome header over a
// two-pane workspace grid (lg:grid-cols-12):
//   LEFT  · Job Openings — full-width stacked list rows (metric-blue hover
//           rule, humanized title, pipe-separated vitals, capsule +/−
//           quick-view toggle, in-place quick view with six QuickFacts).
//   RIGHT · Your Applications — sticky rail with its own overflow scroll;
//           journey cards (No. kicker · status pill · chevron · 3-checkpoint
//           .stage-dot timeline · next-step hint). The rail stacks FIRST on
//           mobile.
// Clicking a journey card opens the full Application detail modal (§7.7)
// with Cancel Application while the journey is still at "Submitted".
// Data: parallel /api/applications + /api/jobs — 15 s silent poll + refetch on
// focus (never flips skeletons or clobbers good data on transient failure).
// Bevel pass: shared page-header anatomy, cloud journey/position cards, white
// interior tiles inside the detail modal, capsule CTAs, body-gray copy.
// ============================================================================

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Bookmark,
  Briefcase,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Inbox,
  MapPin,
  RefreshCw,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState, IconChip, PageHeader, StatusPill } from "@/components/ui/shell";
import { apiFetch, deadlineState, formatCurrency, formatDate, humanize, timeAgo } from "@/lib/client";
import { navigate, type ApplicationWire, type JobWire, type PositionWire } from "@/lib/router";
import { currentStageLabel, stageForStatus } from "@/lib/status";
import { cn } from "@/lib/utils";
import { useSession } from "@/components/session-provider";
import OnboardingTour from "@/components/onboarding-tour";

// ── Small helpers ───────────────────────────────────────────────────────────

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function notRequired(v: string | null | undefined): boolean {
  if (!v) return true;
  const s = v.trim().toLowerCase();
  return s === "" || s === "n/a" || s === "na" || s === "none" || s === "none required" || s === "not required";
}

/** Section label (eyebrow) — quiet uppercase kicker above headings. */
function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("eyebrow", className)}>{children}</p>
  );
}

/** Applicant-facing stage label → functional status variant (§2 status system). */
const STAGE_VARIANT: Record<string, "ok" | "warn" | "bad" | "info"> = {
  Submitted: "info",
  "In Review": "warn",
  Shortlisted: "ok",
  "Not Selected": "bad",
};

function stageVariant(label: string): "ok" | "warn" | "bad" | "info" | "neutral" {
  return STAGE_VARIANT[label] ?? "neutral";
}

/** §7.3 Next Step hint paragraph per pipeline stage. */
function nextStepHint(stage: string): string {
  if (stage === "Rejected")
    return "Your application was not shortlisted. You may apply for other open positions.";
  if (stage === "Shortlisted")
    return "A notice has been sent to your registered email. HR will contact you for the next steps.";
  if (stage === "Under Review") return "HR is currently evaluating your application. You will be notified of the outcome.";
  return "Your application has been received and is awaiting evaluation by the Human Resource Office.";
}

const PLACE_FALLBACK = "DOST Compound, Taguig";

/** Display place — nested position read, then the agency address. */
function jobPlace(job: JobWire): string {
  return job.position?.placeOfAssignment ?? PLACE_FALLBACK;
}

type CheckpointState = "done" | "current" | "pending" | "failed";

/** Status-colored checkpoint dot resting in a small white ring with a soft
 *  glow (glow ships in the .stage-dot primitives). The current stage gets a
 *  pulsing halo — motion-safe only. */
function CheckpointDot({ state }: { state: CheckpointState }) {
  const dot =
    state === "done"
      ? "dot-ok"
      : state === "current"
        ? "dot-warn"
        : state === "failed"
          ? "dot-bad"
          : "dot-neutral";
  return (
    <span
      className={cn(
        "inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-white shadow-[0_1px_3px_rgba(24,24,37,0.16),0_0_0_1px_rgba(24,24,37,0.05)]",
        state === "current" && "motion-safe:animate-pulse"
      )}
    >
      <span className={cn("stage-dot", dot)} />
    </span>
  );
}

/** 3-checkpoint tracking timeline: Submitted → Review → Decision (§7.3). */
function JourneyTimeline({ status }: { status: string }) {
  const stage = stageForStatus(status);
  const decided = stage === "Shortlisted" || stage === "Rejected";

  const steps: { label: string; short?: string; state: CheckpointState }[] = [
    { label: "Submitted", state: "done" },
    {
      label: "Review",
      state: stage === "Under Review" ? "current" : decided ? "done" : "pending",
    },
    {
      label:
        stage === "Shortlisted" ? "Shortlisted" : stage === "Rejected" ? "Not Shortlisted" : "Awaiting the shortlist decision",
      // Responsive copy swap (3-d, presentation-only): the full label wraps to 4+ lines
      // inside a 3-up timeline at 320px; "Shortlisted"/"Not Shortlisted" stay verbatim.
      short: stage === "Shortlisted" || stage === "Rejected" ? undefined : "Awaiting decision",
      state: stage === "Shortlisted" ? "done" : stage === "Rejected" ? "failed" : "pending",
    },
  ];

  return (
    <div className="mt-3 grid grid-cols-3 gap-1">
      {steps.map((s, i) => {
        const reached = s.state !== "pending";
        return (
          <div key={`${s.label}-${i}`} className="flex flex-col items-center gap-1.5 text-center">
            <div className="flex w-full items-center">
              {/* Traversed connectors render in solid brand blue. Negative
                  outer margins bridge the grid's gap-1 so each rail reads
                  as one continuous line, not segments with center gaps. */}
              <div
                className={cn(
                  "h-px flex-1",
                  i > 0 && "-ml-1",
                  i === 0 ? "bg-transparent" : reached ? "bg-primary" : "bg-divider"
                )}
              />
              <CheckpointDot state={s.state} />
              <div
                className={cn(
                  "h-px flex-1",
                  i < steps.length - 1 && "-mr-1",
                  i === steps.length - 1
                    ? "bg-transparent"
                    : steps[i + 1].state !== "pending"
                      ? "bg-primary"
                      : "bg-divider"
                )}
              />
            </div>
            <span className={cn("text-[10px] leading-tight", s.state === "current" ? "font-medium text-ink" : "text-stone")}>
              {s.short ? (
                <>
                  <span className="sm:hidden">{s.short}</span>
                  <span className="hidden sm:inline">{s.label}</span>
                </>
              ) : (
                s.label
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Posting age source — editorial publish date, else the record timestamp. */
function postedAt(job: JobWire): string {
  return job.publishDate ?? job.publishedAt;
}

// Shared with the frontpage explorer — bookmarks saved here show as saved
// there and vice versa.
const SAVED_KEY = "rmis-frontpage-saved-jobs";

/** Client-persisted bookmark list (same store as the frontpage). */
function useSavedJobs() {
  const [saved, setSaved] = useState<number[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(SAVED_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(parsed) ? parsed.filter((x): x is number => typeof x === "number") : [];
    } catch {
      return [];
    }
  });

  const toggle = useCallback((id: number) => {
    setSaved((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        window.localStorage.setItem(SAVED_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable — in-session state still works */
      }
      return next;
    });
  }, []);

  return { saved, toggle };
}

// ── Application journey card (right rail) ───────────────────────────────────

function ApplicationJourneyCard({ app, index, onOpen }: { app: ApplicationWire; index: number; onOpen: () => void }) {
  const stage = stageForStatus(app.status);
  const label = currentStageLabel(app.status);
  const place = app.job?.position?.placeOfAssignment ?? null;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={`View complete posting and application details: ${app.job?.title ?? "position"}`}
      className="dlg-card lift focus-ring min-h-[44px] w-full p-4 text-left sm:p-5"
    >
      {/* Header — the chevron is the whole-card affordance: the card opens
          the full posting in the detail modal. */}
      <div className="flex items-start justify-between gap-2">
        <span className="num text-[10px] font-semibold uppercase tracking-[0.14em] text-stone">
          No. {String(index + 1).padStart(2, "0")}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <StatusPill status={label} variant={stageVariant(label)} />
          <ChevronRight
            aria-hidden="true"
            className="h-4 w-4 text-pebble transition-all duration-200 group-hover:translate-x-0.5"
          />
        </span>
      </div>
      <h3 className="mt-3 text-base font-semibold leading-snug tracking-[-0.01em] text-ink sm:text-lg">{app.job?.title ?? "Position"}</h3>
      {place && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-stone">
          <MapPin className="h-4 w-4" aria-hidden="true" /> {place}
        </p>
      )}
      <p className="mt-1 flex items-center gap-1.5 text-xs text-stone">
        <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> Applied{" "}
        <span className="num">{formatDate(app.dateApplied)}</span>
      </p>

      <JourneyTimeline status={app.status} />

      {/* Next hint — the card's closing block (the full posting lives one
          click away, in the application detail modal). */}
      <div className="mt-3 border-t border-divider pt-2.5">
        <p className="eyebrow text-stone">Next Step</p>
        <p className="mt-1 text-xs leading-relaxed text-stone">{nextStepHint(stage)}</p>
      </div>
    </button>
  );
}

// ── Application detail modal (spec §7.7) ────────────────────────────────────

function RichSection({ title, text, html }: { title: string; text?: string | null; html?: string | null }) {
  if (html && html.trim()) {
    return (
      <section className="space-y-2">
        <h4 className="text-base font-semibold tracking-[-0.01em] text-ink sm:text-lg">{title}</h4>
        <div className="rich-text text-sm leading-relaxed text-body-gray" dangerouslySetInnerHTML={{ __html: html }} />
      </section>
    );
  }
  if (text && text.trim()) {
    return (
      <section className="space-y-2">
        <h4 className="text-base font-semibold tracking-[-0.01em] text-ink sm:text-lg">{title}</h4>
        <p className="whitespace-pre-line text-sm leading-relaxed text-body-gray">{text}</p>
      </section>
    );
  }
  return null;
}

function MqrLedger({ position }: { position: PositionWire | null }) {
  if (!position) return null;
  const rows: { label: string; value: string | null | undefined }[] = [
    { label: "Education", value: position.cscEducation },
    { label: "Work Experience", value: position.cscWorkExperience },
    { label: "Training", value: position.cscTraining },
    { label: "Eligibility", value: position.cscEligibilityGroup || position.cscEligibility },
    { label: "License / Certification", value: position.license },
  ];
  const visible = rows.filter((r) => !notRequired(r.value));
  if (visible.length === 0) return null;
  return (
    <section className="space-y-2">
      <h4 className="text-base font-semibold tracking-[-0.01em] text-ink sm:text-lg">Minimum Qualification Requirements</h4>
      <div className="space-y-2">
        {visible.map((r) => (
          <div key={r.label} className="rounded-lg bg-cloud/60 p-3">
            <p className="text-xs font-medium text-stone">{r.label}</p>
            <p className="mt-0.5 whitespace-pre-line text-sm text-stone">{r.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ApplicationDetailModal({
  application,
  onClose,
  onCancelled,
}: {
  application: ApplicationWire;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const job = application.job ?? null;
  const position = job?.position ?? null;
  const label = currentStageLabel(application.status);
  const cancellable = label === "Submitted";
  const dl = deadlineState(job?.deadlineDate ?? null);

  const cancelApplication = async () => {
    setCancelling(true);
    try {
      await apiFetch(`/api/applications/${application.id}`, { method: "DELETE" });
      toast.success("Application cancelled", { description: "Your application has been withdrawn." });
      setConfirmOpen(false);
      onClose();
      onCancelled();
    } catch (e) {
      // Progressed applications: surface the server's guidance (e.g. "contact HR") as-is.
      toast.error(e instanceof Error ? e.message : "Unable to cancel this application");
      setConfirmOpen(false);
    } finally {
      setCancelling(false);
    }
  };

  const facts: [string, string][] = [
    ["Place of Assignment", position?.placeOfAssignment ?? "-"],
    ["Employment Type", job?.positionType ? humanize(job.positionType) : position?.positionType ? humanize(position.positionType) : "-"],
    ["Vacancies", job?.numberOfVacancy == null ? "-" : String(job.numberOfVacancy)],
    ["Monthly Salary", formatCurrency(position?.salaryAmount ?? null)],
    ["Salary Grade", position?.salaryGrade ? `SG-${position.salaryGrade}${position.salaryStep ? ` Step ${position.salaryStep}` : ""}` : "-"],
    ["Item No.", position?.itemNumber ?? "-"],
    ["Published", formatDate(job?.publishDate ?? null)],
    ["Deadline", job ? dl.label : "-"],
  ];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="dlg-card-plain max-h-[90dvh] w-full overflow-y-auto scroll-thin p-0 sm:max-w-3xl">
        <div className="p-6">
          <DialogHeader className="space-y-2 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={label} variant={stageVariant(label)} />
              <span className="dlg-pill num rounded-full bg-fog px-3 py-1 text-xs font-medium text-stone">
                Application #{application.id}
              </span>
            </div>
            <DialogTitle className="font-display text-2xl leading-tight tracking-[-0.02em] text-ink">
              {job?.title ?? "Application"}
            </DialogTitle>
          </DialogHeader>

          {/* Successfully-applied strip (§7.7) */}
          <div className="mt-4 flex items-center gap-3 rounded-lg bg-cloud/60 p-3">
            <IconChip icon={BadgeCheck} tone="emerald" size={36} iconSize={17} />
            <div>
              <p className="text-sm font-medium text-ink">Successfully Applied</p>
              <p className="text-xs text-stone">
                Applied <span className="num">{formatDate(application.dateApplied)}</span>
              </p>
            </div>
          </div>

          {/* Vitals summary grid */}
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {facts.map(([k, v]) => (
              <div key={k} className="rounded-lg bg-cloud/60 p-3">
                <p className="text-[11px] text-stone">{k}</p>
                <p className="num mt-0.5 truncate text-sm text-ink" title={v}>
                  {v}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-6">
            <MqrLedger position={position} />
            <RichSection title="Brief Description" text={job?.briefDescription} html={job?.briefDescriptionHtml} />
            <RichSection title="Duties & Responsibilities" text={job?.dutiesResponsibilities} html={job?.dutiesHtml} />
            <RichSection title="Compensation Package" text={job?.compensationPackage} html={job?.compensationHtml} />
            <RichSection title="Other Qualifications" text={job?.otherQualifications} html={job?.otherQualificationsHtml} />
          </div>

          <div className="mt-8 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
            {cancellable && (
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={cancelling}
                className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-[var(--bad)]/30 bg-white px-6 py-2.5 text-sm font-medium text-[var(--bad)] transition-colors hover:bg-[var(--bad-bg)] disabled:opacity-50"
              >
                Cancel Application
              </button>
            )}
            <button type="button" onClick={onClose} className="dlg-ghost min-h-[44px] px-6 py-2.5 text-sm">
              Close
            </button>
          </div>
        </div>

        {/* Nested destructive confirm (§7.7) */}
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent className="dlg-card-plain">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-2xl font-semibold leading-[1.1] tracking-[-0.01em] text-ink">Cancel this application?</AlertDialogTitle>
              <AlertDialogDescription className="text-sm leading-relaxed text-body-gray">
                Your application for {job?.title ?? "this position"} will be withdrawn. You may apply again while the
                position is still open. Once review has started, applications can no longer be cancelled.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="dlg-ghost min-h-[44px] px-5 py-2.5 text-sm">Keep it</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void cancelApplication();
                }}
                disabled={cancelling}
                className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-[var(--bad)]/30 bg-white px-5 py-2.5 text-sm font-medium text-[var(--bad)] transition-colors hover:bg-[var(--bad-bg)] disabled:opacity-50"
              >
                {cancelling ? "Cancelling…" : "Cancel Application"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

// ── Open-position list row (left pane) ──────────────────────────────────────

/** One definition-list cell of the quick view: micro-kicker label over a
 *  semibold tabular value. `tone="danger"` flags a passed deadline. */
function QuickFact({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd
        className={cn(
          "num mt-1.5 break-words text-base font-semibold tracking-[-0.01em]",
          danger ? "text-[var(--bad)]" : "text-ink"
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** The frontpage job card, ported for the applicant — tuned: the summary is
 *  deliberately inert, so the chevron is the single door to the quick view;
 *  there the solid "Read full description" button deep-links into the job's
 *  full posting (where the apply flow lives). Applicant extras kept: the
 *  gold Applied pill beside the title and the applied notice in the quick
 *  view. */
function JobListCard({
  job,
  applied,
  expanded,
  saved,
  onToggle,
  onSave,
  onOpen,
}: {
  job: JobWire;
  applied: boolean;
  expanded: boolean;
  saved: boolean;
  onToggle: () => void;
  onSave: () => void;
  onOpen: () => void;
}) {
  const reduced = useReducedMotion();
  const pos = job.position;
  const title = pos?.positionTitle || job.title || "Position Title Unavailable";
  const company = pos?.division || "DOST-MIRDC";
  const salary = pos?.salaryAmount ?? null;
  const deadline = job.deadlineDate;
  const overdue = deadline ? new Date(deadline).getTime() < Date.now() : false;

  return (
    <article className="dlg-card lift">
      {/* Static summary — deliberately not clickable: the chevron below is
          the single door to the quick view and its description jump. */}
      <div className="px-4 pt-4 sm:px-5 sm:pt-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h3 className="min-w-0 text-lg font-semibold leading-snug text-ink">{humanize(title)}</h3>
          {applied && <StatusPill status="Applied" variant="info" className="shrink-0" />}
        </div>
        <p className="mt-1 text-lg text-ink">{company}</p>
        <p className="mt-2.5 text-sm text-stone">{jobPlace(job)}</p>
        {salary != null && <p className="num mt-0.5 text-sm text-stone">{formatCurrency(salary)} per month</p>}
        {job.briefDescription && (
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-stone">{job.briefDescription}</p>
        )}
      </div>

      {/* Bottom register — posted age left, quick-view + bookmark right */}
      <div className="flex items-center justify-between gap-2 px-2.5 pb-2 sm:px-3.5">
        <span className="num px-2 py-1.5 text-xs text-stone">{timeAgo(postedAt(job))}</span>
        <div className="flex items-center">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={expanded ? `Collapse: ${humanize(title)}` : `Quick view: ${humanize(title)}`}
            className="focus-ring grid h-9 w-9 place-items-center rounded-full text-stone transition-colors hover:bg-white/70 hover:text-ink"
          >
            <ChevronDown
              className={cn("h-[18px] w-[18px] transition-transform duration-200", expanded && "rotate-180")}
            />
          </button>
          <button
            type="button"
            onClick={onSave}
            aria-pressed={saved}
            aria-label={saved ? `Remove ${humanize(title)} from saved` : `Save ${humanize(title)}`}
            className="focus-ring grid h-9 w-9 place-items-center rounded-full text-stone transition-colors hover:bg-white/70 hover:text-ink"
          >
            <Bookmark className={cn("h-[18px] w-[18px]", saved && "fill-current text-metric-blue")} />
          </button>
        </div>
      </div>

      {/* Quick view — inline expansion: the clicked card opens IN PLACE with
          a clamped job description and the position's vital facts. SMOOTH
          HEIGHT GLIDE via framer-motion (reduced-motion users get a plain
          opacity crossfade). */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="quickview"
            initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduced ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={reduced ? { duration: 0.15, ease: "linear" } : { duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-divider px-4 pb-6 pt-4 sm:px-5 sm:pt-5">
              {job.briefDescription && (
                <div>
                  <h4 className="text-base font-semibold tracking-[-0.01em] text-ink sm:text-lg">Job description</h4>
                  <p className="mt-2 line-clamp-5 text-sm leading-relaxed text-stone">{job.briefDescription}</p>
                </div>
              )}
              {/* 3-up everywhere: a 6-up row inside the 7/12 pane leaves
                  ~50-85px per fact, which wraps currency mid-number. */}
              <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 sm:gap-x-8">
                <QuickFact label="Item No." value={pos?.itemNumber ?? "-"} />
                <QuickFact label="Vacancies" value={String(job.numberOfVacancy ?? "-")} />
                <QuickFact
                  label="Salary Grade"
                  value={pos?.salaryGrade ? `SG ${pos.salaryGrade}${pos.salaryStep ? `/${pos.salaryStep}` : ""}` : "-"}
                />
                <QuickFact label="Monthly Salary" value={salary != null ? formatCurrency(salary) : "-"} />
                <QuickFact label="Published" value={formatDate(job.publishDate)} />
                <QuickFact label="Deadline" value={formatDate(deadline)} danger={overdue} />
              </dl>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                {/* Read full description — the quick view's primary action;
                    deep-links into the complete posting, where the apply
                    flow lives. */}
                <button
                  type="button"
                  onClick={onOpen}
                  className="dlg-cta focus-ring inline-flex min-h-[44px] items-center gap-2 px-6 py-2.5 text-sm"
                >
                  Read full description <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
                {applied && <StatusPill status="Applied (track it on your Home)" variant="info" />}
                {overdue && !applied && (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--bad)]">
                    <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" /> Deadline passed
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}

// ── Skeleton ────────────────────────────────────────────────────────────────

function HomeSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <div className="skel h-3 w-32" />
        <div className="skel mt-3 h-8 w-72 sm:h-9" />
        <div className="skel mt-3 h-4 w-1/2" />
      </div>
      {/* Two-pane skeleton — positions (left, register rows) · applications (right) */}
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-8">
        <div className="space-y-4 lg:order-1 lg:col-span-7">
          <div className="skel h-3 w-44" />
          <div className="skel h-6 w-36" />
          <div className="space-y-4 sm:space-y-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="dlg-card px-5 py-5 sm:px-6">
                <div className="min-w-0 space-y-3">
                  <div className="skel h-6 w-3/4" />
                  <div className="skel h-5 w-1/2" />
                  <div className="skel h-4 w-2/3" />
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <div className="skel h-4 w-14 rounded-full" />
                  <div className="flex items-center gap-1.5">
                    <div className="skel h-9 w-9 rounded-full" />
                    <div className="skel h-9 w-9 rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4 lg:order-2 lg:col-span-5">
          <div className="skel h-3 w-40" />
          <div className="skel h-6 w-32" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="skel h-64" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main view ───────────────────────────────────────────────────────────────

export default function ApplicantHome() {
  const { user } = useSession();
  const [apps, setApps] = useState<ApplicationWire[] | null>(null);
  const [jobs, setJobs] = useState<JobWire[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApplicationWire | null>(null);
  // Quick view — single-expand: opening one card closes the previous one.
  const [expandedId, setExpandedId] = useState<number | null>(null);
  // Bookmarks — the same client store the frontpage explorer uses.
  const { saved, toggle: toggleSave } = useSavedJobs();

  const reload = useCallback(async (silent: boolean) => {
    try {
      const [appRes, jobRes] = await Promise.all([
        apiFetch<ApplicationWire[]>("/api/applications"),
        apiFetch<JobWire[]>("/api/jobs"),
      ]);
      setApps(appRes);
      setJobs(jobRes);
      setError(null);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Unable to load your workspace");
      // Silent failures keep the last good data (§13 polling contract).
    }
  }, []);

  useEffect(() => {
    void reload(false);
    const interval = setInterval(() => {
      if (!document.hidden) void reload(true);
    }, 15_000);
    const onFocus = () => void reload(true);
    const onVisible = () => {
      if (!document.hidden) void reload(true);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload]);

  const loading = apps === null && jobs === null;
  const firstName = user?.firstName || "there";

  // Right rail — every application on record, newest first. The rail has its
  // own overflow scroll, so no cap is needed.
  const sortedApps = (apps ?? []).sort((a, b) => Date.parse(b.dateApplied) - Date.parse(a.dateApplied));

  // Left pane — every open posting (deadline not passed), newest published
  // first. This pane is the browsing surface: the full list scrolls in place.
  const openJobs = (jobs ?? [])
    .filter((j) => !j.deadlineDate || new Date(j.deadlineDate) >= startOfToday())
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

  const profileComplete = user?.applicant?.isProfileComplete ?? false;

  if (loading) return <HomeSkeleton />;

  if (error && apps === null) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Applicant Portal" title="My Application" />
        <div className="dlg-card p-6 sm:p-10">
          <EmptyState
            icon={AlertCircle}
            tone="rose"
            title="Couldn't load your workspace"
            description={error}
            action={
              <button type="button" onClick={() => void reload(false)} className="dlg-ghost min-h-[44px] px-6 py-2.5 text-sm">
                <RefreshCw className="mr-2 inline h-3.5 w-3.5" /> Retry
              </button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* ===== Enterprise page header (PageHeader) — shared anatomy ===== */}
      <PageHeader
        eyebrow="Applicant Portal"
        title={<>Welcome Back, {firstName}</>}
        description={
          <>
            <p>Track your applications and discover new opportunities at DOST-MIRDC.</p>
            <p className="italic">Your recruitment journey, structured and transparent.</p>
          </>
        }
      />

      {/* ===== Profile completion banner ===== */}
      {!profileComplete && (
        <div data-tour="profile-banner" className="dlg-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-start gap-3">
            <IconChip icon={AlertCircle} tone="gold" size={36} iconSize={17} className="mt-0.5" />
            <div>
              <p className="text-base font-semibold tracking-[-0.01em] text-ink sm:text-lg">Complete Your Profile</p>
              <p className="mt-0.5 text-sm text-stone">
                Finish your applicant profile to apply for positions and speed up processing.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("profile")}
            className="dlg-cta focus-ring inline-flex min-h-[44px] w-fit shrink-0 items-center gap-2 px-6 py-2.5 text-sm"
          >
            Complete Profile <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* ===== Two-pane workspace =======================================
           LEFT  · Open Positions — the scrollable browsing pane in the
           board job-card register. RIGHT · Your Applications — sticky rail
           with its own overflow scroll, so statuses stay in view while the
           applicant browses. Mobile: stacks Your Applications first, then
           Open Positions. ============================================== */}
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-8">
        {/* ---- Right rail · Your Applications (first on mobile) ---- */}
        <aside data-tour="my-applications" className="order-1 min-w-0 lg:order-2 lg:col-span-5">
          <div className="flex flex-col lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)]">
            {/* Rail header — pinned above the scrolling cards */}
            <div className="flex shrink-0 items-end justify-between gap-2 border-b border-border pb-4">
              <div>
                <Eyebrow>Your Applications</Eyebrow>
                <h2 className="mt-1.5 text-xl font-semibold tracking-[-0.02em] text-ink sm:text-2xl">
                  In Progress
                </h2>
              </div>
              {sortedApps.length > 0 && <span className="status-pill status-neutral num">{sortedApps.length}</span>}
            </div>

            {/* Independently scrollable application cards */}
            <div className="scroll-thin mt-6 min-h-0 flex-1 lg:overflow-y-auto lg:pr-1">
              {sortedApps.length === 0 ? (
                <div className="dlg-card">
                  <EmptyState
                    icon={Inbox}
                    tone="plum"
                    title="No applications yet"
                    description="Browse open positions to start your application journey."
                    action={
                      <button
                        type="button"
                        onClick={() => navigate("vacant-positions")}
                        className="dlg-cta inline-flex min-h-[44px] items-center gap-2 px-6 py-2.5 text-sm"
                      >
                        <Briefcase className="h-4 w-4" aria-hidden="true" /> Browse Positions
                      </button>
                    }
                  />
                </div>
              ) : (
                <div className="space-y-4 pb-1">
                  {sortedApps.map((app, i) => (
                    <ApplicationJourneyCard key={app.id} app={app} index={i} onOpen={() => setDetail(app)} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* ---- Left pane · Job Openings (browsing surface) ---- */}
        <section data-tour="apply-now" className="order-2 min-w-0 lg:order-1 lg:col-span-7">
          <div className="flex items-end justify-between border-b border-border pb-4">
            <div>
              <Eyebrow>Job Openings</Eyebrow>
              <h2 className="mt-1.5 text-xl font-semibold tracking-[-0.02em] text-ink sm:text-2xl">
                Apply Now
              </h2>
            </div>
            {openJobs.length > 0 && (
              <button
                type="button"
                onClick={() => navigate("vacant-positions")}
                className="dlg-ghost hidden min-h-[44px] items-center gap-2 px-5 py-2 text-sm sm:inline-flex"
              >
                View All <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="mt-6">
            {openJobs.length === 0 ? (
              <div className="dlg-card">
                <EmptyState
                  icon={Briefcase}
                  tone="amber"
                  title="No open positions right now"
                  description="New postings appear here as soon as they are published."
                  action={
                    <button
                      type="button"
                      onClick={() => navigate("vacant-positions")}
                      className="dlg-ghost inline-flex min-h-[44px] items-center px-5 py-2 text-sm"
                    >
                      Browse All Jobs
                    </button>
                  }
                />
              </div>
            ) : (
              <div className="space-y-4 sm:space-y-5">
                {openJobs.map((j) => (
                  <JobListCard
                    key={j.id}
                    job={j}
                    applied={(j.applications?.length ?? 0) > 0}
                    expanded={expandedId === j.id}
                    saved={saved.includes(j.id)}
                    onToggle={() => setExpandedId(expandedId === j.id ? null : j.id)}
                    onSave={() => toggleSave(j.id)}
                    onOpen={() => navigate("jobs", { job: String(j.id) })}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {detail && (
        <ApplicationDetailModal
          application={detail}
          onClose={() => setDetail(null)}
          onCancelled={() => {
            setDetail(null);
            void reload(true);
          }}
        />
      )}

      {/* QA 2026-02 — Guided tooltips for first-time users: proceed with the
          tutorial or dismiss/skip it (remembered per browser). */}
      <OnboardingTour
        storageKey="rmis.tour.applicant.v1"
        title="Welcome to the Applicant Portal"
        description="This quick guided tour points out the essentials: finish your profile, apply to vacancies, and track where you stand. You can skip it anytime."
        steps={[
          {
            selector: '[data-tour="profile-banner"]',
            title: "Complete your profile",
            body: "Fill out your Personal Data Sheet once. You can even upload your PDS and let RMIS auto-fill the forms. A complete profile is required before applying.",
          },
          {
            selector: '[data-tour="apply-now"]',
            title: "Apply Now",
            body: "Browse every open vacancy here. Expand a posting with the dropdown to read the full description, then continue to the posting to apply; your profile carries over.",
          },
          {
            selector: '[data-tour="my-applications"]',
            title: "Track your applications",
            body: "Every application you submit appears here with its live stage: from qualification screening to shortlisting, exams, and interviews.",
          },
        ]}
      />
    </div>
  );
}
