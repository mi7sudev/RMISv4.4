"use client";

// ============================================================================
// RMIS — Public landing (spec §7.1): a two-pane job explorer in the
// reference-board style — LEFT: a scrollable register of rounded job cards
// (title · company · place · salary · clamped snippet · posted age · chevron
// quick-view + bookmark); RIGHT: the full posting pane (display title,
// verified company row + "View all jobs", icon meta rows, posted age,
// RMIS-blue Quick apply + soft-blue Save, description, Responsibilities /
// Qualifications / Compensation sections). The selected card carries the
// RMIS electric-blue ring (#1591DC, the old RMIS primary) and a deep-blue
// title. Mobile swaps panes (list → detail with back).
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
  Banknote,
  Bookmark,
  Briefcase,
  Building2,
  ChevronDown,
  ChevronLeft,
  Clock,
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

// ── Reference-board accents ─────────────────────────────────────────────────

const RING_SELECTED = "border-transparent ring-2 ring-[#1591dc] shadow-e2";
const TITLE_SELECTED = "text-[#0e7abf]";
const QUICK_APPLY_BTN =
  "focus-ring inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[8px] bg-[#1591dc] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#0e7abf] disabled:cursor-not-allowed disabled:opacity-50";
const SAVE_BTN =
  "focus-ring inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[8px] bg-[#e9f5fc] px-7 text-sm font-semibold text-[#0e7abf] transition-colors hover:bg-[#d2ebfa]";

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
      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-pebble">{label}</dt>
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
    <article
      className={cn(
        "rounded-[12px] border bg-white transition-colors",
        selected ? RING_SELECTED : "border-black/[0.08] hover:border-black/[0.16]"
      )}
    >
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
            "text-[17px] font-semibold leading-snug",
            selected ? TITLE_SELECTED : "text-ink"
          )}
        >
          {humanize(title)}
        </h3>
        <p className="mt-1 text-[15px] text-ink">{company}</p>
        <p className="mt-2.5 text-sm text-stone">{jobPlace(job)}</p>
        {salary != null && <p className="num mt-0.5 text-sm text-stone">{formatCurrency(salary)} per month</p>}
        {job.briefDescription && (
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-stone">{job.briefDescription}</p>
        )}
      </button>

      {/* Bottom register — posted age left, quick-view + bookmark right */}
      <div className="flex items-center justify-between gap-2 px-2.5 pb-2 sm:px-3.5">
        <button
          type="button"
          onClick={onSelect}
          className="focus-ring num rounded-full px-2 py-1.5 text-xs text-pebble transition-colors hover:text-stone"
          aria-label={`Open ${humanize(title)}`}
        >
          {timeAgo(postedAt(job))}
        </button>
        <div className="flex items-center">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={expanded ? `Collapse — ${humanize(title)}` : `Quick view — ${humanize(title)}`}
            className="focus-ring grid h-9 w-9 place-items-center rounded-full text-stone transition-colors hover:bg-fog hover:text-ink"
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
            className="focus-ring grid h-9 w-9 place-items-center rounded-full text-stone transition-colors hover:bg-fog hover:text-ink"
          >
            <Bookmark className={cn("h-[18px] w-[18px]", saved && "fill-current text-[#0e7abf]")} />
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
            <div className="border-t border-black/[0.06] px-4 pb-6 pt-4 sm:px-5 sm:pt-5">
              {job.briefDescription && (
                <div>
                  <h4 className="font-display text-lg text-ink">Job description</h4>
                  <p className="mt-2 line-clamp-5 text-sm leading-relaxed text-stone">
                    {job.briefDescription}
                  </p>
                </div>
              )}
              {/* 3-up everywhere — a 6-up row wraps currency mid-number. */}
              <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 sm:gap-x-8">
                <QuickFact label="Item No." value={pos?.itemNumber ?? "—"} />
                <QuickFact label="Vacancies" value={String(job.numberOfVacancy ?? "—")} />
                <QuickFact
                  label="Salary Grade"
                  value={
                    pos?.salaryGrade
                      ? `SG ${pos.salaryGrade}${pos.salaryStep ? `/${pos.salaryStep}` : ""}`
                      : "—"
                  }
                />
                <QuickFact label="Monthly Salary" value={salary != null ? formatCurrency(salary) : "—"} />
                <QuickFact label="Published" value={formatDate(job.publishDate)} />
                <QuickFact label="Deadline" value={formatDate(deadline)} danger={overdue} />
              </dl>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onSelect}
                  className="focus-ring group/link inline-flex min-h-[44px] items-center gap-3 text-sm font-medium text-ink transition-colors hover:text-[#0e7abf]"
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
    <ul className="list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-stone">
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
        <h3 className="text-[17px] font-semibold text-ink">{title}</h3>
        <div className="rich-text text-[15px] leading-relaxed text-stone" dangerouslySetInnerHTML={{ __html: html }} />
      </section>
    );
  }
  if (text && text.trim()) {
    return (
      <section className="space-y-3">
        <h3 className="text-[17px] font-semibold text-ink">{title}</h3>
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

  const meta: { icon: typeof MapPin; label: string; num?: boolean; danger?: boolean }[] = [];
  if (job.position?.division) meta.push({ icon: Building2, label: job.position.division });
  if (job.positionType) meta.push({ icon: Briefcase, label: humanize(job.positionType) });
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
    label: overdue ? "Closed — deadline passed" : deadline ? `Closes ${formatDate(deadline)}` : "Open until filled",
    num: !overdue && !deadline,
    danger: overdue,
  });

  return (
    <div>
      {/* Mobile — back to the register */}
      <button
        type="button"
        onClick={onBack}
        className="focus-ring mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-[#0e7abf] lg:hidden"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Back to job list
      </button>

      <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink sm:text-[28px]">
        {humanize(title)}
      </h2>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span className="text-[15px] font-medium text-ink">DOST-MIRDC</span>
        <BadgeCheck className="h-[18px] w-[18px] shrink-0 text-stone" aria-label="Verified agency" />
        <button
          type="button"
          onClick={() => navigate("jobs")}
          className="focus-ring text-[15px] text-stone underline underline-offset-4 transition-colors hover:text-ink"
        >
          View all jobs
        </button>
      </div>

      <ul className="mt-4 space-y-2.5">
        <li className="flex items-start gap-2.5 text-[15px] text-stone">
          <MapPin className="mt-0.5 h-[18px] w-[18px] shrink-0 text-pebble" aria-hidden="true" />
          {jobPlace(job)}
        </li>
        {meta.map((m, i) => (
          <li
            key={i}
            className={cn(
              "flex items-start gap-2.5 text-[15px]",
              m.danger ? "font-semibold text-[var(--bad)]" : "text-stone"
            )}
          >
            <m.icon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-pebble" aria-hidden="true" />
            <span className={cn(m.num && "num")}>{m.label}</span>
          </li>
        ))}
      </ul>

      <p className="num mt-4 text-sm text-stone">Posted {timeAgo(postedAt(job))}</p>

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
      <div className="mt-8 space-y-8 border-t border-black/[0.06] pt-8">
        {job.briefDescription &&
          job.briefDescription
            .split(/\n{2,}/)
            .filter((p) => p.trim())
            .map((p, i) => (
              <p key={i} className="text-[15px] leading-relaxed text-stone">
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
        {/* Board toolbar */}
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-lg text-ink">Open Positions</h1>
          {openJobs.length > 0 && (
            <span className="dlg-pill num bg-fog px-2.5 py-1 text-[11px] font-medium text-stone">
              {openJobs.length} open
            </span>
          )}
        </div>

        {error !== null ? (
          <div className="mt-6 rounded-[12px] border border-dusty-rose/30 bg-dusty-rose/10 p-4">
            <p className="text-sm text-ink">{error}</p>
            <button
              onClick={() => void load(false)}
              className="mt-2 text-sm text-stone underline underline-offset-4"
            >
              Try again
            </button>
          </div>
        ) : jobs === null ? (
          <div className="mt-6 space-y-3.5" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-[12px] bg-fog" />
            ))}
          </div>
        ) : openJobs.length === 0 ? (
          <div className="mt-6 rounded-[12px] border border-black/[0.08] bg-white">
            <EmptyState
              icon={Inbox}
              title="No open positions right now"
              description="Check back soon or explore the full board for upcoming announcements."
            />
            <div className="pb-8 text-center">
              <button
                onClick={() => navigate("jobs")}
                className="inline-flex min-h-[44px] items-center gap-2 text-sm text-stone underline underline-offset-4 hover:text-ink"
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
          <div className="mt-5 grid gap-8 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(340px,430px)_minmax(0,1fr)]">
            {/* Left · the register — 8px of ring room on every side (pl/py)
                with matching negative margins so the cards, the column
                alignment, and the scrollbar stay exactly where they were;
                without it the overflow-y padding box clips the selected
                card's outside ring on the left/top/bottom. */}
            {showList && (
              <div
                aria-label="Open positions list"
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
                  <JobDetail
                    job={selectedJob}
                    saved={saved.includes(selectedJob.id)}
                    onApply={() => requestApply(selectedJob)}
                    onSave={() => saveAndToast(selectedJob)}
                    onBack={() => setSelectedId(null)}
                  />
                ) : (
                  <div className="rounded-[12px] border border-black/[0.08] bg-white">
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
