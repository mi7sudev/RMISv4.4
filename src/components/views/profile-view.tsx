"use client";

// ============================================================================
// RMIS — Profile builder (Bevel edition):
// ONE cohesive record panel — identity (monogram · name · status pill ·
// document count) with the completion ring pinned right on phones and a
// hairline-separated completion lockup (ring · "N of 7 sections" · Mark
// Complete CTA) on desktop — above the quiet completion note and the cloud
// PDS import card. Section navigation is breakpoint-split: desktop (lg+)
// pins a numbered workflow band (capsule done/current/ahead chips joined by
// hairline connectors, two-line labels with time estimates); phones get a
// sticky 7-cell segmented strip with a sliding active cell plus a prev/next
// caption bar. Sections render as white dlg-card-plain panels in one
// full-width column.
// Data logic unchanged: parallel loads, silent reloads, session refresh.
// ============================================================================

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  FileText,
  Info,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
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
import { Monogram, SkeletonRows } from "@/components/ui/shell";
import { apiFetch, fullName } from "@/lib/client";
import { useSession } from "@/components/session-provider";
import { navigate } from "@/lib/router";
import type { DocumentWire } from "@/lib/router";
import { cn } from "@/lib/utils";
import PdsUploadCard from "./profile/pds-upload-card";
import PersonalInfoSection from "./profile/personal-info-section";
import EducationSection from "./profile/education-section";
import WorkExperienceSection from "./profile/work-experience-section";
import TrainingSection from "./profile/training-section";
import EligibilitySection from "./profile/eligibility-section";
import AwardsSection from "./profile/awards-section";
import DocumentsSection from "./profile/documents-section";
import { initialsOf, type ApplicantProfile, type ReferenceData } from "./profile/section-types";

const SECTIONS = [
  { n: 1, num: "01", label: "Personal Information", short: "Personal", minutes: 8 },
  { n: 2, num: "02", label: "Education", short: "Education", minutes: 3 },
  { n: 3, num: "03", label: "Work Experience", short: "Work", minutes: 5 },
  { n: 4, num: "04", label: "Training", short: "Training", minutes: 2 },
  { n: 5, num: "05", label: "Eligibility", short: "Eligibility", minutes: 3 },
  { n: 6, num: "06", label: "Awards", short: "Awards", minutes: 2 },
  { n: 7, num: "07", label: "Supporting Documents", short: "Documents", minutes: null as number | null },
];

function hasText(v: string | null | undefined): boolean {
  return typeof v === "string" && v.trim() !== "";
}

/** Circular completion ring — Metric Blue progress on a cloud track. */
function CompletionRing({ pct }: { pct: number }) {
  const R = 30;
  const C = 2 * Math.PI * R;
  return (
    <div className="relative h-[72px] w-[72px] shrink-0" role="img" aria-label={`${pct}% profile complete`}>
      <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
        <circle cx="36" cy="36" r={R} fill="none" className="stroke-cloud" strokeWidth="7" />
        <circle
          cx="36"
          cy="36"
          r={R}
          fill="none"
          className="stroke-metric-blue motion-safe:transition-[stroke-dasharray] duration-700 ease-out"
          strokeWidth="7"
          strokeDasharray={`${(pct / 100) * C} ${C}`}
          strokeLinecap="butt"
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center">
        <span className="num text-lg font-semibold leading-none text-ink">
          {pct}
          <span className="text-[10px]">%</span>
        </span>
      </span>
    </div>
  );
}

export default function ProfileView() {
  const { user, refresh } = useSession();
  const sectionsRef = useRef<HTMLDivElement>(null);
  const [profile, setProfile] = useState<ApplicantProfile | null>(null);
  const [reference, setReference] = useState<ReferenceData | null>(null);
  const [docs, setDocs] = useState<DocumentWire[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(1);
  const [seed, setSeed] = useState(0);
  const [markOpen, setMarkOpen] = useState(false);
  const [marking, setMarking] = useState(false);

  const loadAll = useCallback(async (silent: boolean) => {
    if (!silent) setLoading(true);
    try {
      const [profileRes, docsRes] = await Promise.all([
        apiFetch<ApplicantProfile>("/api/applicant/profile"),
        apiFetch<DocumentWire[]>("/api/applicant/documents"),
      ]);
      setProfile(profileRes);
      setDocs(docsRes);
      setError(null);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Unable to load your profile");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const ref = await apiFetch<ReferenceData>("/api/reference");
        setReference(ref);
      } catch {
        // Reference data is optional (datalist/eligibility suggestions).
      }
      await loadAll(false);
    })();
  }, [loadAll]);

  const reloadSilent = useCallback(async () => {
    await loadAll(true);
  }, [loadAll]);

  /** After PDS auto-apply / clear: reload AND re-seed the personal form. */
  const onProfileReplaced = useCallback(async () => {
    await loadAll(true);
    setSeed((s) => s + 1);
  }, [loadAll]);

  // ── Completeness (§7.4 header card) ───────────────────────────────────────
  const personalDone = profile ? hasText(profile.firstName) && hasText(profile.lastName) && hasText(profile.emailAddress) : false;
  const educationDone = (profile?.educations?.length ?? 0) > 0;
  const workDone = (profile?.workExperiences?.length ?? 0) > 0;
  const trainingDone = (profile?.trainings?.length ?? 0) > 0;
  const eligibilityDone = (profile?.eligibilities?.length ?? 0) > 0;
  const awardsDone = (profile?.awards?.length ?? 0) > 0;
  const documentsDone = docs.length > 0;
  const sectionDone = [personalDone, educationDone, workDone, trainingDone, eligibilityDone, awardsDone, documentsDone];
  const completedCount = sectionDone.filter(Boolean).length;
  const isComplete = profile?.isProfileComplete === true;
  const canMarkComplete = personalDone && educationDone && workDone && !isComplete;
  const pct = Math.round((completedCount / 7) * 100);
  const remaining = 7 - completedCount;

  const markComplete = async () => {
    setMarking(true);
    try {
      await apiFetch("/api/applicant/profile", { method: "PUT", body: { isProfileComplete: true } });
      toast.success("Profile marked as complete", {
        description: "You can now apply to open positions. HR verifies your credentials at the next stage.",
      });
      setMarkOpen(false);
      await refresh();
      await reloadSilent();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to mark your profile complete");
    } finally {
      setMarking(false);
    }
  };

  const pictureDoc = docs.find((d) => d.category === "PROFILE_PICTURE");
  const initials = initialsOf(user?.firstName ?? profile?.firstName, user?.lastName ?? profile?.lastName);
  const applicantName =
    fullName({
      firstName: user?.firstName ?? profile?.firstName,
      lastName: user?.lastName ?? profile?.lastName,
    }) || "Applicant";

  // ── Mobile stepper: switch section AND bring the rail back into view —
  // tapping "04" while stranded deep inside section 01's long form must not
  // leave the viewport mid-scroll in the old section. Desktop (lg+) skips
  // this: the nav band is sticky above the content, no jump needed.
  const mobileNavRef = useRef<HTMLElement>(null);

  function handleMobileSectionChange(n: number) {
    if (n === active) return;
    setActive(n);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      // The strip lives ABOVE the swapped section content, so its document
      // position is layout-stable across the swap — unlike the wrapper's.
      // Double rAF lets React commit the new section first, then we jump
      // INSTANTLY (smooth is canceled by Chrome's scroll-anchoring yank,
      // which fires while the tall section replaces the short one and
      // re-anchors the viewport to keep the old bottom edge in view). The
      // instant jump lands the pinned strip right under the top bar; the
      // 200ms content fade masks the transition.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = mobileNavRef.current;
          if (!el) return;
          const top = el.getBoundingClientRect().top + window.scrollY - 72;
          window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
        });
      });
    }
  }

  // Index of the active section — drives the mobile caption + prev/next.
  const activeIdx = Math.max(
    0,
    SECTIONS.findIndex((s) => s.n === active)
  );

  // The section content column is a bounded scroll container (min/max height
  // with an internal scrollbar), so every freshly-swapped section must land
  // at its own top — otherwise switching from a short into a tall section
  // inherits the previous section's inner scroll offset.
  useEffect(() => {
    sectionsRef.current?.scrollTo({ top: 0 });
  }, [active]);

  // ── Loading / error states ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        {/* Record panel skeleton */}
        <div className="dlg-card-plain p-5 sm:p-6">
          <div className="flex items-center gap-4">
            <div className="skel h-14 w-14 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="skel h-5 w-48" />
              <div className="skel h-3 w-36" />
            </div>
            <div className="skel h-[72px] w-[72px] shrink-0 rounded-full lg:hidden" />
          </div>
          <div className="skel mt-5 h-16 w-full" />
        </div>
        {/* Section nav skeleton — desktop band / mobile strip */}
        <div className="glass hidden border-b border-border px-8 py-4 lg:block">
          <div className="flex gap-6 overflow-hidden">
            {SECTIONS.map((s) => (
              <div key={s.n} className="skel h-9 w-24 shrink-0" />
            ))}
          </div>
        </div>
        <div className="dlg-card-plain p-2 lg:hidden">
          <div className="flex gap-2 overflow-hidden">
            {SECTIONS.map((s) => (
              <div key={s.n} className="skel h-11 w-12 shrink-0" />
            ))}
          </div>
        </div>
        <div>
          <SkeletonRows rows={4} rowClassName="h-20" />
        </div>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="space-y-6">
        <div className="dlg-card flex flex-col items-center gap-3 p-6 text-center sm:p-10">
          <AlertCircle className="h-6 w-6 text-[var(--bad)]" />
          <p className="text-sm text-body-gray">{error}</p>
          <button type="button" onClick={() => void loadAll(false)} className="dlg-ghost min-h-[44px] px-6 py-2.5 text-sm">
            <RefreshCw className="mr-2 inline h-3.5 w-3.5" /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── A–C. Employee record — ONE cohesive panel: identity + completion
              indicator, the quiet completion note, and the PDS import
              card. ── */}
      <section aria-label="Profile record" className="dlg-card-plain p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:gap-5 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
          {/* Identity — avatar + name/status/documents. The completion ring
              is pinned to the RIGHT of this row on phones (shrink-0, and
              the name column is min-w-0 + truncate, so a long applicant
              name only ever ellipsizes — it can never push the circle out
              of view); on lg the ring lives in the right-hand lockup. */}
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="h-14 w-14 shrink-0">
              {pictureDoc ? (
                <img
                  src={`/api/files/${pictureDoc.filePath}`}
                  alt="Profile picture"
                  className="h-14 w-14 rounded-full object-cover"
                />
              ) : (
                <Monogram size={56}>{initials}</Monogram>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-semibold tracking-[-0.02em] text-ink sm:text-[28px]" title={applicantName}>
                {applicantName}
              </h1>
              {/* Status BELOW the name — never squeezed beside it. */}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                {isComplete ? (
                  <span className="status-pill status-ok">Complete</span>
                ) : (
                  <span className="status-pill status-neutral">Incomplete</span>
                )}
              </div>
              <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-body-gray">
                <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="num">{docs.length}</span> document{docs.length === 1 ? "" : "s"}
              </p>
            </div>
            {/* Phones: compact ring at the right edge of the identity row.
                lg hides it — the lockup below-right owns the ring there. */}
            <div className="shrink-0 lg:hidden" title={`Profile ${pct}% complete`}>
              <CompletionRing pct={pct} />
            </div>
          </div>

          {/* Completion lockup — lg: ring + readout + finalize CTA on the
              right (hairline-separated). Phones: the ring is already in
              the identity row, so this row carries the readout + CTA only
              under a hairline. Exactly one ring is visible per viewport. */}
          <div className="flex items-center justify-between gap-4 border-t border-border pt-4 lg:shrink-0 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            <div className="flex items-center gap-4">
              <div className="hidden lg:block">
                <CompletionRing pct={pct} />
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight text-ink">
                  <span className="num">{completedCount}</span> of <span className="num">7</span> sections
                </p>
                <p className="mt-0.5 text-[13px] leading-tight text-body-gray">
                  {isComplete ? "All sections complete" : `${remaining} to go`}
                </p>
              </div>
            </div>
            {!isComplete && canMarkComplete && (
              <button
                type="button"
                onClick={() => setMarkOpen(true)}
                disabled={marking}
                className="dlg-cta focus-ring inline-flex min-h-[44px] shrink-0 items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-50"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Mark Complete
              </button>
            )}
          </div>
        </div>

        {/* ── B. Completion note — quiet informational banner (never an alert). ── */}
        {!isComplete && (
          <div className="mt-5 flex items-start gap-3 rounded-lg bg-cloud/60 px-4 py-3">
            <Info className="h-4 w-4 shrink-0 text-stone" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-sm leading-relaxed text-body-gray">
              Profile completion requires your Personal Information (first name, last name, and email) and at least one
              entry each in Education and Work Experiences.
            </p>
          </div>
        )}

        {/* ── C. Import workspace — PDS Upload · AI Auto-Fill ── */}
        <div className="mt-4 sm:mt-5">
          <PdsUploadCard docs={docs} onProfileReplaced={onProfileReplaced} onDocsChanged={reloadSilent} />
        </div>
      </section>

      {/* ── D. Section navigation (lg+) — sticky numbered workflow band.
              Desktop content column has no sticky header above it, so the
              band pins to the very top of the viewport. NOT scrollable by
              design: the row always fits its container. Below xl the items
              compact (28px chips · 11.5px labels · "Approx" line hidden);
              from xl up the full register renders (32px chips · 13.5px
              labels · "Approx N Min" second line). Hairline connectors are
              flex-1 so they absorb any leftover width. ── */}
      <nav
        aria-label="Profile section steps"
        className="glass sticky top-0 z-20 -mx-4 hidden border-b border-border px-4 py-3 sm:-mx-6 sm:px-6 lg:block lg:-mx-8 lg:px-8"
      >
        <ol className="flex items-center">
          {SECTIONS.map((s, i) => {
            const isActive = active === s.n;
            const done = sectionDone[s.n - 1];
            const reached = done || isActive;
            const approx = s.minutes != null ? `Approx ${s.minutes} Min` : null;
            return (
              <Fragment key={s.n}>
                {i > 0 && <li aria-hidden="true" className="h-px min-w-1 flex-1 bg-divider xl:min-w-4" />}
                <li className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setActive(s.n)}
                    aria-current={isActive ? "step" : undefined}
                    aria-label={`Section ${i + 1}: ${s.label}`}
                    className="focus-ring group flex items-center gap-2 py-1 pl-0.5 pr-1 transition-colors xl:gap-2.5"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[11px] font-semibold tabular-nums transition-colors duration-200 xl:h-8 xl:w-8 xl:text-[12px]",
                        reached
                          ? "border-transparent bg-charcoal text-[#ebf0f8]"
                          : "border-divider bg-white text-stone group-hover:border-metric-blue/40 group-hover:text-ink"
                      )}
                    >
                      {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : s.num}
                    </span>
                    <span className="flex min-w-0 flex-col leading-tight">
                      <span
                        className={cn(
                          "whitespace-nowrap text-[11.5px] font-semibold transition-colors xl:text-[13.5px]",
                          reached ? "text-ink" : "text-stone group-hover:text-ink"
                        )}
                      >
                        {s.short}
                      </span>
                      {approx && (
                        <span className="mt-0.5 hidden whitespace-nowrap text-[11px] leading-none text-stone xl:block">
                          {approx}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              </Fragment>
            );
          })}
        </ol>
      </nav>

      {/* MOBILE (< lg) — sticky segmented strip + caption + prev/next.
          The active cell is a sliding charcoal block (motion layoutId) —
          one filled element, no double borders. The strip is a DIRECT
          child of the tall view root, NOT a grid item: a sticky element
          can never travel past its containing block, and a grid item's
          containing block is its own grid area (exactly the strip's own
          height), which left it zero stick range. As a root sibling it
          pins under the mobile top bar (top-16) for the whole scroll. */}
      <nav ref={mobileNavRef} aria-label="Profile sections" className="dlg-card-plain sticky top-16 z-30 p-1.5 shadow-e2 lg:hidden">
        <div className="grid grid-cols-7 gap-0.5">
          {SECTIONS.map((s, i) => {
            const isActive = active === s.n;
            const filled = sectionDone[s.n - 1];
            return (
              <button
                key={s.n}
                type="button"
                onClick={() => handleMobileSectionChange(s.n)}
                aria-label={`Section ${i + 1}: ${s.label}`}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative isolate flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 transition-colors",
                  isActive ? "text-[#ebf0f8]" : "text-ink hover:bg-fog"
                )}
              >
                {/* Sliding block — rendered INSIDE the active cell so
                    inset-0 matches the cell bounds; layoutId slides it
                    between cells on section change. */}
                {isActive && (
                  <motion.span
                    aria-hidden="true"
                    layoutId="profile-mobile-seg"
                    className="absolute inset-0 -z-10 bg-charcoal"
                    transition={{ type: "spring", stiffness: 500, damping: 42 }}
                  />
                )}
                <span
                  className={cn(
                    "num text-[10px] font-semibold leading-none",
                    isActive ? "text-[#ebf0f8]/85" : "text-stone"
                  )}
                >
                  {s.num}
                </span>
                {filled ? (
                  <CheckCircle2
                    className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-[#ebf0f8]" : "text-[var(--ok)]")}
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                ) : (
                  /* Not filled yet — soft ring, same size/weight as the green
                     check so both states read at a glance (light ring on the
                     charcoal active cell, where red would clash). */
                  <Circle
                    className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-[#ebf0f8]/90" : "text-[var(--bad)]")}
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>
        {/* Caption + sequential stepping — hairline footer bar with quiet
            chevrons and an aria-live position readout. */}
        <div className="mt-1.5 flex items-stretch border-t border-border">
          <button
            type="button"
            onClick={() => activeIdx > 0 && handleMobileSectionChange(SECTIONS[activeIdx - 1].n)}
            disabled={activeIdx === 0}
            aria-label="Previous section"
            className="focus-ring grid w-12 shrink-0 place-items-center text-stone transition-colors hover:bg-fog disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </button>
          <p
            aria-live="polite"
            className="min-w-0 flex-1 truncate py-2.5 text-center text-[11px] font-medium uppercase tracking-[0.08em] text-stone"
          >
            {`Section ${activeIdx + 1} of ${SECTIONS.length} · ${SECTIONS[activeIdx]?.label ?? ""}`}
          </p>
          <button
            type="button"
            onClick={() => activeIdx < SECTIONS.length - 1 && handleMobileSectionChange(SECTIONS[activeIdx + 1].n)}
            disabled={activeIdx === SECTIONS.length - 1}
            aria-label="Next section"
            className="focus-ring grid w-12 shrink-0 place-items-center text-stone transition-colors hover:bg-fog disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      </nav>

      {/* Desktop owns navigation via the sticky band above; this wrapper is
          a single full-width column for the section content. BOUNDED COLUMN:
          min-height keeps sparse sections from collapsing the page (footer
          doesn't jump between swaps); max-height turns tall sections (50
          trainings) into an internal scrollbar instead of an unbounded page
          — same behavior on phones and desktop. EXCEPTION — section 01
          (Personal Information) is NOT scrollable: it renders at its natural
          height and the page itself scrolls, per request. overflow-anchor
          none: Chrome must not re-anchor onto the footer when a short
          section is swapped for a tall one. */}
      <div
        ref={sectionsRef}
        className={cn(
          "scroll-thin min-h-[360px] lg:min-h-[420px]",
          active === 1 ? "overflow-visible" : "max-h-[65dvh] overflow-y-auto lg:max-h-[72dvh]"
        )}
        style={{ overflowAnchor: "none" }}
      >
        {/* SECTION CONTENT — sections swap with a quiet fade/rise (200ms):
            perceptible placement without choreography. */}
        <div className="min-w-0">
          <div key={active} className="animate-in fade-in slide-in-from-bottom-2 duration-200">
            {active === 1 && <PersonalInfoSection profile={profile} seed={seed} refreshSession={refresh} />}
            {active === 2 && (
              <EducationSection
                items={profile?.educations ?? []}
                courses={(reference?.courses ?? []).map((c) => c.name)}
                onChanged={reloadSilent}
              />
            )}
            {active === 3 && <WorkExperienceSection items={profile?.workExperiences ?? []} onChanged={reloadSilent} />}
            {active === 4 && <TrainingSection items={profile?.trainings ?? []} onChanged={reloadSilent} />}
            {active === 5 && (
              <EligibilitySection
                items={profile?.eligibilities ?? []}
                referenceNames={(reference?.eligibilities ?? []).map((e) => e.name)}
                onChanged={reloadSilent}
              />
            )}
            {active === 6 && <AwardsSection items={profile?.awards ?? []} onChanged={reloadSilent} />}
            {active === 7 && <DocumentsSection docs={docs} onChanged={reloadSilent} />}
          </div>
        </div>
      </div>

      {/* QA 2026-02 — Section progression footer: an explicit Back / Continue
          affordance so it's immediately obvious how to move between the seven
          PDS sections (the desktop step band alone wasn't discoverable).
          handleMobileSectionChange also handles the mobile scroll-recovery. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        {activeIdx > 0 ? (
          <button
            type="button"
            onClick={() => handleMobileSectionChange(SECTIONS[activeIdx - 1].n)}
            className="dlg-ghost min-h-[44px] px-6 text-sm"
          >
            <ChevronLeft className="mr-1.5 inline h-4 w-4" aria-hidden="true" />
            Back to {SECTIONS[activeIdx - 1]?.label ?? "previous section"}
          </button>
        ) : (
          <span aria-hidden="true" />
        )}

        {activeIdx < SECTIONS.length - 1 ? (
          <button
            type="button"
            onClick={() => handleMobileSectionChange(SECTIONS[activeIdx + 1].n)}
            className="dlg-cta min-h-[44px] px-7 text-sm font-medium"
          >
            Continue to {SECTIONS[activeIdx + 1]?.label ?? "next section"}
            <ChevronRight className="ml-1.5 inline h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => navigate("home")}
            className="dlg-cta min-h-[44px] px-7 text-sm font-medium"
          >
            Return to Portal
            <ChevronRight className="ml-1.5 inline h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Mark Complete confirm (§7.4) */}
      <AlertDialog open={markOpen} onOpenChange={setMarkOpen}>
        <AlertDialogContent className="dlg-card-plain">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl text-ink">Mark your profile as complete?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-stone">
              Your profile will be ready for application and subject to verification by HR. All statements become part
              of your civil-service application record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dlg-ghost min-h-[44px] px-5 py-2.5 text-sm">Not yet</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void markComplete();
              }}
              disabled={marking}
              className="dlg-cta min-h-[44px] px-5 py-2.5 text-sm disabled:opacity-50"
            >
              {marking ? "Marking…" : "Mark Complete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
