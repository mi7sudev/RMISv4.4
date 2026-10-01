"use client";

// ============================================================================
// RMIS — Applicant home ("My Application"): enterprise header (warm monogram
// + shared PageHeader) over a two-pane workspace grid (lg:grid-cols-12):
//   LEFT  · Job Openings — data-card-hover posting cards (metric-blue hover
//           rule, font-medium title, pipe-separated vitals with .num salary,
//           Apply ghost CTA, +/− quick view with six QuickFacts).
//   RIGHT · Your Applications — sticky rail with its own overflow scroll;
//           one white data-card of hairline-divided 56px rows (stage-dot ·
//           title · meta · status pill). The rail stacks FIRST on mobile.
// Clicking an application row opens the full Application detail modal (§7.7)
// with Cancel Application while the journey is still at "Submitted".
// Data: parallel /api/applications + /api/jobs — 15 s silent poll + refetch on
// focus (never flips skeletons or clobbers good data on transient failure).
// Executive Ink pass: data-card white surfaces + hairlines, fog insets,
// stage-dot rows, .num vitals, capsule CTAs, body-gray copy.
// ============================================================================

import { Fragment, useCallback, useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Briefcase,
  ChevronRight,
  Inbox,
  Minus,
  Plus,
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
import { EmptyState, IconChip, Monogram, PageHeader, StatusPill } from "@/components/ui/shell";
import { apiFetch, deadlineState, formatCurrency, formatDate, humanize } from "@/lib/client";
import { navigate, type ApplicationWire, type JobWire, type PositionWire } from "@/lib/router";
import { currentStageLabel } from "@/lib/status";
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
    <p className={cn("text-xs font-medium uppercase tracking-[0.08em] text-stone", className)}>{children}</p>
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

const PLACE_FALLBACK = "DOST Compound, Taguig";

/** Display place — nested position read, then the agency address. */
function jobPlace(job: JobWire): string {
  return job.position?.placeOfAssignment ?? PLACE_FALLBACK;
}

// ── Application row (right rail) ────────────────────────────────────────────

/** One hairline-divided row in the Your Applications card: status-colored
 *  stage-dot · job title · meta (place · applied date) · status pill. The
 *  whole row opens the full posting in the Application detail modal. */
function ApplicationRow({ app, onOpen }: { app: ApplicationWire; onOpen: () => void }) {
  const label = currentStageLabel(app.status);
  const place = app.job?.position?.placeOfAssignment ?? null;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
<<<<<<< Updated upstream
      aria-label={`View complete posting and application details — ${app.job?.title ?? "position"}`}
      className="data-card-hover focus-ring group flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-fog/60 sm:px-5"
=======
      aria-label={`View complete posting and application details: ${app.job?.title ?? "position"}`}
      className="dlg-card lift focus-ring min-h-[44px] w-full p-4 text-left sm:p-5"
>>>>>>> Stashed changes
    >
      <span aria-hidden="true" className={cn("stage-dot", `dot-${stageVariant(label)}`)} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium tracking-[-0.01em] text-ink">
          {app.job?.title ?? "Position"}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-body-gray">
          {place && (
            <>
              <span className="max-w-[18ch] truncate">{place}</span>
              <span aria-hidden="true" className="select-none text-pebble">
                ·
              </span>
            </>
          )}
          <span>
            Applied <span className="num">{formatDate(app.dateApplied)}</span>
          </span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <StatusPill status={label} variant={stageVariant(label)} />
        <ChevronRight
          aria-hidden="true"
          className="h-4 w-4 text-pebble transition-transform duration-200 group-hover:translate-x-0.5"
        />
      </span>
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
          <div key={r.label} className="rounded-lg bg-fog p-3">
            <p className="text-xs font-medium text-stone">{r.label}</p>
            <p className="mt-0.5 whitespace-pre-line text-sm text-body-gray">{r.value}</p>
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
          <div className="mt-4 flex items-center gap-3 rounded-lg bg-fog p-3">
            <IconChip icon={BadgeCheck} tone="emerald" size={36} iconSize={17} />
            <div>
              <p className="text-sm font-medium text-ink">Successfully Applied</p>
              <p className="text-xs text-body-gray">
                Applied <span className="num">{formatDate(application.dateApplied)}</span>
              </p>
            </div>
          </div>

          {/* Vitals summary grid */}
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {facts.map(([k, v]) => (
              <div key={k} className="rounded-lg bg-fog p-3">
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
              <AlertDialogTitle className="font-display text-xl text-ink">Cancel this application?</AlertDialogTitle>
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
      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-stone">{label}</dt>
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

/** The board card register, Executive Ink edition: white data-card-hover
 *  surface, metric-blue hover rule, font-medium title + Applied pill,
 *  pipe-separated vitals at text-xs (place | type | pay | closes, .num
 *  figures), Apply ghost CTA + quiet round "+/−" quick-view toggle, and the
 *  in-place quick view on a fog inset (clamped description · six QuickFacts
 *  · actions). "Apply now" and "Read full description" both deep-link into
 *  the job's full posting on the Positions board. */
function JobListCard({
  job,
  applied,
  expanded,
  onToggle,
  onOpen,
}: {
  job: JobWire;
  applied: boolean;
  expanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const reduced = useReducedMotion();
  const pos = job.position;
  const title = pos?.positionTitle || job.title || "Position Title Unavailable";
  const place = jobPlace(job);
  const salary = pos?.salaryAmount ?? null;
  const deadline = job.deadlineDate;
  const overdue = deadline ? new Date(deadline).getTime() < Date.now() : false;

  // Meta — pipe-separated vitals, the card register (place | type | pay |
  // closes); overdue flips the closer to red.
  const meta: { label: string; className?: string }[] = [{ label: place }];
  if (job.positionType) meta.push({ label: humanize(job.positionType) });
  if (salary != null) meta.push({ label: `${formatCurrency(salary)} monthly`, className: "num" });
  meta.push({
    label: overdue ? "Closed" : deadline ? `Closes ${formatDate(deadline)}` : "Open until filled",
    className: overdue ? "font-semibold text-[var(--bad)]" : "num",
  });

  return (
    <div className="data-card data-card-hover group relative overflow-hidden">
      {/* Metric-blue rule — wipes in across the card on hover */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 origin-left scale-x-0 bg-metric-blue transition-transform duration-500 ease-out group-hover:scale-x-100"
      />
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
<<<<<<< Updated upstream
          aria-label={expanded ? `Collapse — ${title}` : `Expand — ${title}`}
          className="focus-ring min-w-0 flex-1 px-5 py-4 text-left sm:px-6 sm:py-5"
=======
          aria-label={expanded ? `Collapse: ${title}` : `Expand: ${title}`}
          className="focus-ring min-w-0 flex-1 px-5 py-6 text-left sm:px-8 sm:py-7"
>>>>>>> Stashed changes
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h3 className="min-w-0 text-[17px] font-medium leading-snug tracking-[-0.01em] text-ink sm:text-lg">{humanize(title)}</h3>
            {applied && <StatusPill status="Applied" variant="info" className="shrink-0" />}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-body-gray">
            {meta.map((m, idx) => (
              <Fragment key={idx}>
                {idx > 0 && (
                  <span aria-hidden="true" className="select-none text-pebble">
                    |
                  </span>
                )}
                <span className={m.className}>{m.label}</span>
              </Fragment>
            ))}
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-2 pr-4 sm:pr-5">
          {!applied && (
            <button
              type="button"
              onClick={onOpen}
              disabled={overdue}
              className="dlg-ghost focus-ring hidden h-9 items-center gap-1.5 px-4 text-sm disabled:opacity-50 sm:inline-flex"
            >
              Apply <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
<<<<<<< Updated upstream
            aria-label={expanded ? `Hide quick view — ${title}` : `Quick view — ${title}`}
            className="dlg-ghost focus-ring grid h-9 w-9 shrink-0 place-items-center"
=======
            aria-label={expanded ? `Hide quick view: ${title}` : `Quick view: ${title}`}
            className="dlg-cta focus-ring grid h-11 w-11 shrink-0 place-items-center"
>>>>>>> Stashed changes
          >
            {expanded ? <Minus className="h-4 w-4" strokeWidth={2} /> : <Plus className="h-4 w-4" strokeWidth={2} />}
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
            <div className="border-t border-[#eef1f7] bg-fog px-5 pb-6 pt-4 sm:px-6 sm:pb-7 sm:pt-5">
              {job.briefDescription && (
                <div>
                  <h4 className="text-base font-semibold tracking-[-0.01em] text-ink sm:text-lg">Job description</h4>
                  <p className="mt-2 line-clamp-5 text-sm leading-relaxed text-body-gray">{job.briefDescription}</p>
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
              <div className="mt-7 flex flex-wrap items-center gap-3">
                {applied ? (
                  <StatusPill status="Applied (track it on your Home)" variant="info" />
                ) : (
                  <button
                    type="button"
                    onClick={onOpen}
                    disabled={overdue}
                    className="dlg-cta focus-ring inline-flex min-h-[44px] items-center gap-2 px-6 py-2.5 text-sm disabled:opacity-50"
                  >
                    Apply now <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
                {/* Read full description — deep-links into the complete
                    posting on the Positions board. */}
                <button
                  type="button"
                  onClick={onOpen}
                  className="focus-ring group/link inline-flex min-h-[44px] items-center gap-3 text-sm font-medium text-metric-blue underline underline-offset-2 transition-colors hover:text-ink"
                >
                  Read full description
                  <span className="dlg-cta grid h-8 w-8 place-items-center">
                    <ArrowRight
                      className="h-4 w-4 transition-transform duration-200 group-hover/link:translate-x-0.5"
                      strokeWidth={2.5}
                      aria-hidden="true"
                    />
                  </span>
                </button>
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
    </div>
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
      {/* Two-pane skeleton — applications (right, row rail) · positions (left) */}
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-8">
        <div className="space-y-4 lg:order-1 lg:col-span-7">
          <div className="skel h-3 w-44" />
          <div className="skel h-6 w-36" />
          <div className="space-y-4 sm:space-y-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="data-card flex items-center gap-5 px-5 py-4 sm:px-6 sm:py-5">
                <div className="min-w-0 flex-1 space-y-2.5">
                  <div className="skel h-5 w-3/4" />
                  <div className="skel h-4 w-1/2" />
                </div>
                <div className="skel h-9 w-9 shrink-0 rounded-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4 lg:order-2 lg:col-span-5">
          <div className="skel h-3 w-40" />
          <div className="skel h-6 w-32" />
          <div className="data-card divide-y divide-[#eef1f7]">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-4 sm:px-5">
                <div className="skel h-2 w-2 rounded-full" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="skel h-4 w-2/3" />
                  <div className="skel h-3 w-1/3" />
                </div>
                <div className="skel h-6 w-16 rounded-full" />
              </div>
            ))}
          </div>
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
  const initials = `${user?.firstName?.[0] ?? ""}${user?.lastName?.[0] ?? ""}`.toUpperCase() || "A";

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
        <div className="data-card p-6 sm:p-10">
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
        leading={<Monogram size={40} warm>{initials}</Monogram>}
        title={<>Welcome Back, {firstName}</>}
        description={
          <>
            <p>Track your applications and discover new opportunities at DOST-MIRDC.</p>
            <p className="italic">Your recruitment journey, structured and transparent.</p>
          </>
        }
      />

      {/* ===== Profile completion strip — white data-card banner (the compact
           completion readout + Complete Profile CTA; the tour anchors here) ===== */}
      {!profileComplete && (
        <div data-tour="profile-banner" className="data-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-5">
          <div className="flex min-w-0 items-start gap-3">
            <IconChip icon={AlertCircle} tone="gold" size={36} iconSize={17} className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Complete Your Profile</p>
              <p className="mt-0.5 text-[13px] text-body-gray">
                Finish your applicant profile to apply for positions and speed up processing.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <StatusPill status="Incomplete" variant="neutral" />
            <button
              type="button"
              onClick={() => navigate("profile")}
              className="dlg-ghost focus-ring inline-flex min-h-[44px] w-fit shrink-0 items-center gap-2 px-5 py-2 text-sm"
            >
              Complete Profile <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
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

            {/* Independently scrollable application rows — one white card of
                hairline-divided rows */}
            <div className="scroll-thin mt-6 min-h-0 flex-1 lg:overflow-y-auto lg:pr-1">
              {sortedApps.length === 0 ? (
                <div className="data-card">
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
                <div className="data-card divide-y divide-[#eef1f7] overflow-hidden">
                  {sortedApps.map((app) => (
                    <ApplicationRow key={app.id} app={app} onOpen={() => setDetail(app)} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* ---- Left pane · Job Openings (browsing surface) ---- */}
        <section data-tour="apply-now" className="order-2 min-w-0 lg:order-1 lg:col-span-7">
          <div className="flex items-end justify-between gap-3 border-b border-border pb-4">
            <div>
              <Eyebrow>Job Openings</Eyebrow>
              <h2 className="mt-1.5 text-xl font-semibold tracking-[-0.02em] text-ink sm:text-2xl">
                Apply Now
              </h2>
            </div>
            {openJobs.length > 0 && (
              <div className="flex shrink-0 items-center gap-3">
                <span className="status-pill status-neutral num">{openJobs.length}</span>
                <button
                  type="button"
                  onClick={() => navigate("vacant-positions")}
                  className="dlg-ghost hidden min-h-[44px] items-center gap-2 px-5 py-2 text-sm sm:inline-flex"
                >
                  View All <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>

          <div className="mt-6">
            {openJobs.length === 0 ? (
              <div className="data-card">
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
                    onToggle={() => setExpandedId(expandedId === j.id ? null : j.id)}
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
            body: "Browse every open vacancy here. Expand a posting to read the full description, then apply with one click; your profile carries over.",
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
