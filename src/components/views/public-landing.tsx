"use client";

// ============================================================================
// RMIS — Public landing (spec §7.1): a two-pane job explorer in the
// reference-board style — TOP: the dark "Executive Ink" hero band (rounded-3xl
// aurora field + blueprint grid) carrying the display headline, a live
// open-count glass chip and the charcoal capsule CTA to the full board;
// LEFT: a scrollable register of white Data Card job cards (title · company ·
// place · salary · clamped snippet · posted age · chevron quick-view +
// bookmark); RIGHT: the full posting pane on a white Data Card (display
// title, verified company row + "View all jobs", icon meta rows, salary &
// closing label/value register, charcoal Quick apply + ghost Save,
// description, Responsibilities / Qualifications / Compensation sections).
// The selected card carries the Metric Blue ring (#415eee). Mobile swaps
// panes (list → detail with back).
// Data from GET /api/jobs (30s silent poll + refetch on focus); visitors
// without a session are routed to sign-in by the shared apply gate; saves
// persist in localStorage. Apply actions are cancelled-only on the landing.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Bookmark,
  Briefcase,
  Building2,
  ChevronDown,
  ChevronLeft,
  Inbox,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/shell/site-header";
import { Footer } from "@/components/shell/footer";
import { useApplyFlow } from "@/components/apply/apply-dialogs";
import { EmptyState } from "@/components/ui/shell";
import { apiFetch, deadlineState, formatCurrency, formatDate, humanize, timeAgo } from "@/lib/client";
import { navigate } from "@/lib/router";
import type { JobWire } from "@/lib/router";
import { cn } from "@/lib/utils";

// ── Bevel accents ───────────────────────────────────────────────────────────

const TITLE_SELECTED = "text-metric-blue";
const QUICK_APPLY_BTN =
  "dlg-cta inline-flex min-h-[44px] items-center justify-center gap-2 px-6 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50";
const SAVE_BTN =
  "dlg-ghost inline-flex min-h-[44px] items-center justify-center gap-2 px-7 text-sm font-medium";

// ── Helpers ─────────────────────────────────────────────────────────────────

const PLACE_FALLBACK = "DOST Compound, Taguig";

/** Display place — nested position read, then the agency address. */
function jobPlace(job: JobWire): string {
  return job.position?.placeOfAssignment ?? PLACE_FALLBACK;
}

/** Posting age source — editorial publish date, else the record timestamp. */
function postedAt(job: JobWire): string {
  return job.publishDate ?? job.publishedAt;
}

const SAVED_KEY = "rmis-frontpage-saved-jobs";

/** Client-persisted bookmark list for the frontpage explorer. */
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

// ── Quick-view cell (shared card expansion facts) ───────────────────────────

/** One definition-list cell of the quick view: micro-kicker label over a
 *  semibold tabular value. `danger` flags a passed deadline. */
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

// ── Job card (left register) ────────────────────────────────────────────────

function JobListCard({
  job,
  selected,
  expanded,
  saved,
  onSelect,
  onToggle,
  onSave,
}: {
  job: JobWire;
  selected: boolean;
  expanded: boolean;
  saved: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onSave: () => void;
}) {
  const reduced = useReducedMotion();
  const pos = job.position;
  const title = pos?.positionTitle || job.title || "Position Title Unavailable";
  const company = pos?.division || "DOST-MIRDC";
  const salary = pos?.salaryAmount ?? null;
  const deadline = job.deadlineDate;
  const overdue = deadline ? new Date(deadline).getTime() < Date.now() : false;

  return (
    <article className={cn("data-card data-card-hover", selected && "ring-2 ring-[#415eee]/40")}>
      {/* Select target — title, company, vitals, snippet */}
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        aria-label={`View ${humanize(title)}`}
        className="focus-ring block w-full px-4 pt-4 text-left sm:px-5 sm:pt-5"
      >
        <h3
          className={cn(
            "text-[16px] font-medium leading-snug",
            selected ? TITLE_SELECTED : "text-ink"
          )}
        >
          {humanize(title)}
        </h3>
        <p className="mt-1 text-[13px] font-medium text-stone">{company}</p>
        <p className="mt-1.5 text-xs text-stone">{jobPlace(job)}</p>
        {salary != null && <p className="num mt-1 text-[13px] text-body-gray">{formatCurrency(salary)} per month</p>}
        {job.briefDescription && (
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-body-gray">{job.briefDescription}</p>
        )}
      </button>

      {/* Bottom register — posted age left, quick-view + bookmark right */}
      <div className="flex items-center justify-between gap-2 px-2.5 pb-2 sm:px-3.5">
        <button
          type="button"
          onClick={onSelect}
          className="focus-ring num rounded-full px-2 py-1.5 text-xs text-body-gray transition-colors hover:text-ink"
          aria-label={`Open ${humanize(title)}`}
        >
          {timeAgo(postedAt(job))}
        </button>
        <div className="flex items-center">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
<<<<<<< Updated upstream
            aria-label={expanded ? `Collapse — ${humanize(title)}` : `Quick view — ${humanize(title)}`}
            className="focus-ring grid h-9 w-9 place-items-center rounded-full text-body-gray transition-colors hover:bg-fog hover:text-ink"
=======
            aria-label={expanded ? `Collapse: ${humanize(title)}` : `Quick view: ${humanize(title)}`}
            className="focus-ring grid h-9 w-9 place-items-center rounded-full text-body-gray transition-colors hover:bg-white/70 hover:text-ink"
>>>>>>> Stashed changes
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
            className="focus-ring grid h-9 w-9 place-items-center rounded-full text-body-gray transition-colors hover:bg-fog hover:text-ink"
          >
            <Bookmark className={cn("h-[18px] w-[18px]", saved && "fill-current text-metric-blue")} />
          </button>
        </div>
      </div>

      {/* Quick view — inline expansion with the house ease (reduced-motion
          users get a plain opacity crossfade). */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="quickview"
            initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduced ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={
              reduced
                ? { duration: 0.15, ease: "linear" }
                : { duration: 0.34, ease: [0.22, 1, 0.36, 1] }
            }
            className="overflow-hidden"
          >
            <div className="border-t border-divider px-4 pb-6 pt-4 sm:px-5 sm:pt-5">
              {job.briefDescription && (
                <div>
                  <h4 className="font-display text-lg text-ink">Job description</h4>
                  <p className="mt-2 line-clamp-5 text-sm leading-relaxed text-body-gray">
                    {job.briefDescription}
                  </p>
                </div>
              )}
              {/* 3-up everywhere — a 6-up row wraps currency mid-number. */}
              <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 sm:gap-x-8">
                <QuickFact label="Item No." value={pos?.itemNumber ?? "-"} />
                <QuickFact label="Vacancies" value={String(job.numberOfVacancy ?? "-")} />
                <QuickFact
                  label="Salary Grade"
                  value={
                    pos?.salaryGrade
                      ? `SG ${pos.salaryGrade}${pos.salaryStep ? `/${pos.salaryStep}` : ""}`
                      : "-"
                  }
                />
                <QuickFact label="Monthly Salary" value={salary != null ? formatCurrency(salary) : "-"} />
                <QuickFact label="Published" value={formatDate(job.publishDate)} />
                <QuickFact label="Deadline" value={formatDate(deadline)} danger={overdue} />
              </dl>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onSelect}
                  className="focus-ring group/link inline-flex min-h-[44px] items-center gap-3 text-sm font-medium text-ink transition-colors hover:text-metric-blue"
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
                {overdue && (
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

// ── Detail pane (right) ─────────────────────────────────────────────────────

/** Plain-text posting section rendered as a disc bullet list. */
function TextBullets({ text }: { text: string }) {
  const items = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
  if (items.length === 0) return null;
  return (
    <ul className="list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-body-gray">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/** Posting section: sanitized rich HTML when present, else text bullets. */
function PostingSection({ title, html, text }: { title: string; html: string | null; text: string | null }) {
  if (html && html.trim()) {
    return (
      <section className="space-y-3">
        <h3 className="text-lg font-semibold tracking-[-0.01em] text-ink">{title}</h3>
        <div className="rich-text text-[15px] leading-relaxed text-body-gray" dangerouslySetInnerHTML={{ __html: html }} />
      </section>
    );
  }
  if (text && text.trim()) {
    return (
      <section className="space-y-3">
        <h3 className="text-lg font-semibold tracking-[-0.01em] text-ink">{title}</h3>
        <TextBullets text={text} />
      </section>
    );
  }
  return null;
}

function JobDetail({
  job,
  saved,
  onApply,
  onSave,
  onBack,
}: {
  job: JobWire;
  saved: boolean;
  onApply: () => void;
  onSave: () => void;
  onBack: () => void;
}) {
  const pos = job.position;
  const title = pos?.positionTitle || job.title || "Position Title Unavailable";
  const salary = pos?.salaryAmount ?? null;
  const deadline = job.deadlineDate;
  const overdue = deadline ? new Date(deadline).getTime() < Date.now() : false;

  const meta: { icon: typeof MapPin; label: string }[] = [];
  if (job.position?.division) meta.push({ icon: Building2, label: job.position.division });
  if (job.positionType) meta.push({ icon: Briefcase, label: humanize(job.positionType) });
<<<<<<< Updated upstream
=======
  if (salary != null)
    meta.push({
      icon: Banknote,
      label: `${formatCurrency(salary)} per month${
        pos?.salaryGrade ? ` · SG ${pos.salaryGrade}${pos.salaryStep ? `/${pos.salaryStep}` : ""}` : ""
      }`,
      num: true,
    });
  meta.push({
    icon: Clock,
    label: overdue ? "Closed: deadline passed" : deadline ? `Closes ${formatDate(deadline)}` : "Open until filled",
    num: !overdue && !deadline,
    danger: overdue,
  });
>>>>>>> Stashed changes

  return (
    <div>
      {/* Mobile — back to the register */}
      <button
        type="button"
        onClick={onBack}
        className="focus-ring mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-metric-blue lg:hidden"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Back to job list
      </button>

      <h2 className="text-2xl font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-3xl">
        {humanize(title)}
      </h2>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span className="text-[15px] font-medium text-ink">DOST-MIRDC</span>
        <BadgeCheck className="h-[18px] w-[18px] shrink-0 text-stone" aria-label="Verified agency" />
        <button
          type="button"
          onClick={() => navigate("vacant-positions")}
          className="focus-ring text-[15px] text-metric-blue underline underline-offset-2 transition-colors hover:text-ink"
        >
          View all jobs
        </button>
      </div>

      <ul className="mt-4 space-y-2.5">
        <li className="flex items-start gap-2.5 text-[15px] text-body-gray">
          <MapPin className="mt-0.5 h-[18px] w-[18px] shrink-0 text-stone" aria-hidden="true" />
          {jobPlace(job)}
        </li>
        {meta.map((m, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[15px] text-body-gray">
            <m.icon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-stone" aria-hidden="true" />
            <span>{m.label}</span>
          </li>
        ))}
      </ul>

      {/* Salary & closing — label/value register rows with tabular figures */}
      <dl className="mt-5 divide-y divide-divider overflow-hidden rounded-2xl bg-fog">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-stone">Monthly salary</dt>
          <dd className="num text-right text-sm font-medium text-ink">
            {salary != null ? formatCurrency(salary) : "—"}
            {pos?.salaryGrade ? ` · SG ${pos.salaryGrade}${pos.salaryStep ? `/${pos.salaryStep}` : ""}` : ""}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-stone">Closing date</dt>
          <dd
            className={cn(
              "num text-right text-sm font-medium",
              overdue ? "text-[var(--bad)]" : "text-ink"
            )}
          >
            {deadline ? formatDate(deadline) : "Open until filled"}
          </dd>
        </div>
      </dl>

      <p className="num mt-4 text-sm text-body-gray">Posted {timeAgo(postedAt(job))}</p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onApply} disabled={overdue} className={QUICK_APPLY_BTN}>
          Quick apply
        </button>
        <button
          type="button"
          onClick={onSave}
          aria-pressed={saved}
          className={SAVE_BTN}
        >
          <Bookmark className={cn("h-4 w-4", saved && "fill-current")} aria-hidden="true" />
          {saved ? "Saved" : "Save"}
        </button>
        {overdue && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--bad)]">
            <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" /> Deadline passed
          </span>
        )}
      </div>

      {/* Posting body */}
      <div className="mt-8 space-y-8 border-t border-divider pt-8">
        {job.briefDescription &&
          job.briefDescription
            .split(/\n{2,}/)
            .filter((p) => p.trim())
            .map((p, i) => (
              <p key={i} className="text-[15px] leading-relaxed text-body-gray">
                {p}
              </p>
            ))}
        <PostingSection title="Responsibilities" html={job.dutiesHtml} text={job.dutiesResponsibilities} />
        <PostingSection
          title="Qualifications"
          html={job.otherQualificationsHtml}
          text={job.otherQualifications}
        />
        <PostingSection title="Compensation" html={job.compensationHtml} text={job.compensationPackage} />
      </div>
    </div>
  );
}

// ── View ────────────────────────────────────────────────────────────────────

export default function PublicLanding() {
  const [jobs, setJobs] = useState<JobWire[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const lastJson = useRef("");
  const paneRef = useRef<HTMLDivElement>(null);
  const { saved, toggle: toggleSave } = useSavedJobs();
  // Shared apply gate — anonymous visitors get the sign-in prompt, complete
  // applicants get the confirm flow (same as the board), incomplete profiles
  // are sent to finish their profile first (the fast-track was retired).
  const { requestApply, dialogs } = useApplyFlow();

  const load = useCallback(async (silent: boolean) => {
    try {
      const data = await apiFetch<JobWire[]>("/api/jobs?limit=200");
      const json = JSON.stringify(data);
      if (!silent || json !== lastJson.current) {
        lastJson.current = json;
        setJobs(data);
      }
      setError(null);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Failed to load positions");
    }
  }, []);

  // Mount + 30s silent poll + refetch on focus (spec §13 cadence).
  useEffect(() => {
    void load(false);
    const timer = setInterval(() => {
      if (!document.hidden) void load(true);
    }, 30_000);
    const onFocus = () => void load(true);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  // Breakpoint sync — desktop keeps both panes; mobile swaps list ↔ detail.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const openJobs = useMemo(
    () => (jobs ?? []).filter((j) => !deadlineState(j.deadlineDate).overdue),
    [jobs]
  );

  // Derived, fetch-free hero figures (recomputed from the same poll state).
  const closingSoon = useMemo(
    () => openJobs.filter((j) => deadlineState(j.deadlineDate).closingSoon).length,
    [openJobs]
  );

  const selectedJob = useMemo(
    () => openJobs.find((j) => j.id === selectedId) ?? null,
    [openJobs, selectedId]
  );

  // Desktop opens with the first posting pre-selected (reference-board
  // behavior); a stale selection after a poll snaps back to the top card.
  useEffect(() => {
    if (isDesktop && selectedId === null && openJobs.length > 0) {
      setSelectedId(openJobs[0].id);
    }
  }, [isDesktop, openJobs, selectedId]);

  useEffect(() => {
    if (selectedId !== null && !openJobs.some((j) => j.id === selectedId)) {
      setSelectedId(openJobs[0]?.id ?? null);
    }
  }, [openJobs, selectedId]);

  // Reference-board behavior — a freshly picked posting opens from the top,
  // even when the previous posting was scrolled deep into its body.
  useEffect(() => {
    if (paneRef.current) paneRef.current.scrollTop = 0;
  }, [selectedId]);

  const select = useCallback(
    (id: number) => {
      setSelectedId(id);
      if (!window.matchMedia("(min-width: 1024px)").matches) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    []
  );

  const saveAndToast = useCallback(
    (job: JobWire) => {
      const wasSaved = saved.includes(job.id);
      toggleSave(job.id);
      toast.success(
        wasSaved
          ? "Removed from your saved jobs"
          : `Saved ${humanize(job.position?.positionTitle || job.title)}`
      );
    },
    [saved, toggleSave]
  );

  const showList = isDesktop || selectedId === null;
  const showDetail = isDesktop || selectedId !== null;

  return (
    <div className="flex min-h-screen flex-col lg:h-dvh">
      <SiteHeader />

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 pb-10 pt-6 sm:px-6 lg:flex lg:min-h-0 lg:flex-col lg:px-8">
        {/* Hero — dark "Executive Ink" band (rounded-3xl aurora + blueprint
            grid): display headline over ink, live open-count glass chip and
            the charcoal capsule CTA to the full board. The count chip is a
            non-interactive label (the QA-removed button-shaped pill stays
            gone); the right glass panel surfaces figures already in state. */}
        <section className="hero-band relative overflow-hidden rounded-3xl p-8 sm:p-12 lg:p-16">
          <div aria-hidden="true" className="hero-grid pointer-events-none absolute inset-0" />
          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              {/* QA 2026-02: header renamed to "Job Opportunities" to match the
                  Positions tab; the system name rides above it as an eyebrow. */}
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">
                Recruitment Management Information System
              </p>
              <h1 className="on-ink mt-3 font-display text-3xl font-semibold leading-[1.08] tracking-[-0.03em] sm:text-5xl">
                Job Opportunities
              </h1>
<<<<<<< Updated upstream
              <p className="on-ink-dim mt-3 max-w-xl text-sm leading-relaxed sm:text-base">
                Current vacancies at DOST-MIRDC — pick a role to read the full posting.
=======
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-body-gray sm:text-base">
                Current vacancies at DOST-MIRDC. Pick a role to read the full posting.
>>>>>>> Stashed changes
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => navigate("vacant-positions")}
                  className="dlg-cta inline-flex min-h-[44px] items-center gap-2 px-6 text-sm font-medium"
                >
                  Browse the full board
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.07] px-4 py-1.5 text-[13px] ring-1 ring-white/15">
                  <span className="num font-semibold on-ink">{openJobs.length}</span>
                  <span className="on-ink-dim">open roles right now</span>
                </span>
              </div>
            </div>

            {/* Glass stat panel — figures already held in component state */}
            <dl className="w-full shrink-0 rounded-2xl bg-white/[0.06] p-5 ring-1 ring-white/12 backdrop-blur lg:w-64">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[13px] on-ink-dim">Open roles</dt>
                <dd className="num text-xl font-semibold on-ink">{openJobs.length}</dd>
              </div>
              <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-white/10 pt-4">
                <dt className="text-[13px] on-ink-dim">Closing soon</dt>
                <dd className="num text-xl font-semibold on-ink">{closingSoon}</dd>
              </div>
              <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-white/10 pt-4">
                <dt className="text-[13px] on-ink-dim">Published postings</dt>
                <dd className="num text-xl font-semibold on-ink">{jobs?.length ?? 0}</dd>
              </div>
            </dl>
          </div>
        </section>

        {error !== null ? (
          <div className="mt-6 rounded-2xl bg-[var(--bad-bg)] p-5">
            <p className="text-sm text-ink">{error}</p>
            <button
              onClick={() => void load(false)}
              className="mt-2 text-sm text-metric-blue underline underline-offset-2"
            >
              Try again
            </button>
          </div>
        ) : jobs === null ? (
          <div className="mt-6 space-y-3.5" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skel h-28" />
            ))}
          </div>
        ) : openJobs.length === 0 ? (
          <div className="data-card mt-6">
            <EmptyState
              icon={Inbox}
              title="No open positions right now"
              description="Check back soon or explore the full board for upcoming announcements."
            />
            <div className="pb-8 text-center">
              <button
                onClick={() => navigate("vacant-positions")}
                className="inline-flex min-h-[44px] items-center gap-2 text-sm text-metric-blue underline underline-offset-2 hover:text-ink"
              >
                Go to the full positions board
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : (
          // Board height is derived, not a magic viewport constant: on lg the
          // grid flex-fills whatever is left between the real header and
          // footer (main is a min-h-0 flex column on lg), so the page itself
          // never scrolls and the open posting stays pinned in view — the
          // reference board's "sticky description" behavior.
          <div className="mt-6 grid gap-8 sm:mt-8 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(340px,430px)_minmax(0,1fr)]">
            {/* Left · the register — 8px of ring room on every side (pl/py)
                with matching negative margins so the cards, the column
                alignment, and the scrollbar stay exactly where they were;
                without it the overflow-y padding box clips the selected
                card's outside ring on the left/top/bottom. */}
            {showList && (
              <div
                aria-label="Job opportunities list"
                className="scroll-thin min-h-0 space-y-3.5 lg:-ml-2 lg:-my-2 lg:overflow-y-auto lg:overscroll-contain lg:py-2 lg:pl-2 lg:pr-1.5"
              >
                {openJobs.map((job) => (
                  <JobListCard
                    key={job.id}
                    job={job}
                    selected={selectedId === job.id}
                    expanded={expandedId === job.id}
                    saved={saved.includes(job.id)}
                    onSelect={() => select(job.id)}
                    onToggle={() => setExpandedId(expandedId === job.id ? null : job.id)}
                    onSave={() => saveAndToast(job)}
                  />
                ))}
              </div>
            )}

            {/* Right · the posting */}
            {showDetail && (
              <div ref={paneRef} className="scroll-thin min-h-0 lg:overscroll-contain lg:overflow-y-auto lg:pr-2">
                {selectedJob ? (
                  <div className="data-card p-6 sm:p-8">
                    <JobDetail
                      job={selectedJob}
                      saved={saved.includes(selectedJob.id)}
                      onApply={() => requestApply(selectedJob)}
                      onSave={() => saveAndToast(selectedJob)}
                      onBack={() => setSelectedId(null)}
                    />
                  </div>
                ) : (
                  <div className="data-card">
                    <EmptyState
                      icon={Briefcase}
                      title="Select a position"
                      description="Choose a role from the list to read the full posting."
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      <Footer />
      {/* Shared apply dialog (confirm / MQR / done), mounted once. */}
      {dialogs}
    </div>
  );
}
