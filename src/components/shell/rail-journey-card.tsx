"use client";

// ============================================================================
// RMIS — Applicant rail infographic (spec §13 sidebar): "How hiring works"
// journey card. Desktop rail only, APPLICANT role only, hidden when the rail
// is collapsed. The steps mirror the REAL recruitment pipeline (src/lib/
// status.ts): Applied → Under Review → Shortlisted, after which the process
// continues offline — HR emails schedule the interview, skills exam and
// appointment face-to-face (MOM 2026-09-03 flow). Rendered as a compact
// vertical timeline that sits at the foot of the rail's scroll area.
// ============================================================================

import {
  BadgeCheck,
  CalendarCheck,
  Mail,
  ScanSearch,
  Send,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type JourneyStep = {
  icon: LucideIcon;
  label: string;
  description: string;
};

/** Mirrors the system's actual pipeline + the offline MOM steps. */
const STEPS: JourneyStep[] = [
  {
    icon: Send,
    label: "Apply",
    description: "Submit your application on the Jobs board.",
  },
  {
    icon: ScanSearch,
    label: "Under review",
    description: "HR evaluates your credentials and documents.",
  },
  {
    icon: BadgeCheck,
    label: "Shortlisted",
    description: "You get the good-news email — congrats!",
  },
  {
    icon: CalendarCheck,
    label: "Face-to-face",
    description: "Interview, skills exam and appointment in person.",
  },
];

export function RailJourneyCard() {
  return (
    <section
      aria-label="How hiring works"
      className="mt-auto rounded-2xl border p-4"
      style={{ background: "var(--rail-hover-bg)", borderColor: "var(--rail-border)" }}
    >
      <p className="eyebrow text-[var(--rail-text-dim)]">How hiring works</p>
      <p className="mt-1 text-sm font-semibold tracking-[-0.01em] text-ink">Your journey</p>

      <ol className="mt-3">
        {STEPS.map((step, i) => {
          const last = i === STEPS.length - 1;
          return (
            <li key={step.label} className="grid grid-cols-[auto_1fr] gap-x-3">
              {/* Node column — icon disc + connector rail down to the next step */}
              <div className="flex flex-col items-center">
                <span
                  aria-hidden="true"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full"
                  style={{
                    background: "color-mix(in srgb, var(--primary) 12%, white)",
                    color: "var(--primary)",
                  }}
                >
                  <step.icon className="h-3.5 w-3.5" />
                </span>
                {!last && (
                  <span
                    aria-hidden="true"
                    className="my-1 w-px flex-1"
                    style={{ background: "var(--rail-border)" }}
                  />
                )}
              </div>
              {/* Copy column */}
              <div className={last ? "pb-0.5" : "pb-3.5"}>
                <p className="text-xs font-semibold text-ink">
                  <span className="sr-only">Step {i + 1}: </span>
                  {step.label}
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--rail-text-dim)]">
                  {step.description}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Ties into the email-notice pipeline — HR notices arrive by email. */}
      <p
        className="mt-2 flex items-start gap-2 border-t pt-2.5 text-[11px] leading-relaxed text-[var(--rail-text-dim)]"
        style={{ borderTopColor: "var(--rail-border)" }}
      >
        <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "var(--primary)" }} aria-hidden="true" />
        <span>Status updates land in your email from DOST-MIRDC Recruitment.</span>
      </p>
    </section>
  );
}

export default RailJourneyCard;
