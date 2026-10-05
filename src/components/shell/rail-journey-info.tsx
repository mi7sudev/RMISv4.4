"use client";

// ============================================================================
// RMIS — Applicant rail info button + modal (spec §13 sidebar): a small
// circular (!) affordance PINNED TO THE BOTTOM of the nav rail, directly
// ABOVE the active-user profile card (avatar + name + role — APPLICANT role
// only). Clicking it opens the "How hiring works" infographic as a modal
// dialog. The steps mirror the REAL recruitment pipeline (src/lib/status.ts):
// Applied → Under Review → Shortlisted, after which the process continues
// offline — HR emails schedule the interview, skills exam and appointment
// face-to-face (MOM 2026-09-03 flow). The disc is SOLID BRAND BLUE with a
// white (!) — a deliberate visual twin of the profile avatar beneath it, so
// the affordance reads instantly on the dark rail. Collapsed rail: the
// circle recenters, tooltip flips to the right — same affordance, icon-only
// (consistent with the other rail items).
// ============================================================================

import {
  BadgeCheck,
  CalendarCheck,
  CircleAlert,
  Mail,
  ScanSearch,
  Send,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

export function RailJourneyInfo({ collapsed = false }: { collapsed?: boolean }) {
  const trigger = (
    <button
      type="button"
      aria-label="How hiring works"
      title="How hiring works"
      className={`group flex min-h-[44px] w-full items-center rounded-full text-[var(--rail-text)] transition-colors hover:bg-[var(--rail-hover-bg)] hover:text-ink ${
        collapsed ? "justify-center px-0" : "px-2"
      }`}
    >
      {/* Solid brand-blue disc + white (!) — matches the profile avatar's
          size and fill directly below, so the two read as a set. */}
      <span
        aria-hidden="true"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full transition-all duration-150 group-hover:scale-[1.06] group-hover:brightness-110"
        style={{
          background: "var(--primary)",
          color: "#ffffff",
          boxShadow: "0 1px 3px rgb(0 0 0 / 0.25)",
        }}
      >
        <CircleAlert className="h-4 w-4" />
      </span>
    </button>
  );

  return (
    <Dialog>
      {/* Tooltip + dialog share one trigger element — DialogTrigger nests
          inside TooltipTrigger so a single click opens the modal and hover
          still shows the affordance label. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>{trigger}</DialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="right" className="rounded-lg bg-ink text-xs text-white">
          How hiring works
        </TooltipContent>
      </Tooltip>

      <DialogContent className="dlg-card-plain max-h-[90dvh] overflow-y-auto scroll-thin sm:max-w-md">
        <DialogHeader>
          <DialogDescription className="eyebrow text-stone">Your journey</DialogDescription>
          <DialogTitle className="font-display text-xl tracking-[-0.01em] text-ink">
            How hiring works
          </DialogTitle>
        </DialogHeader>

        <ol className="mt-1">
          {STEPS.map((step, i) => {
            const last = i === STEPS.length - 1;
            return (
              <li key={step.label} className="grid grid-cols-[auto_1fr] gap-x-3.5">
                {/* Node column — icon disc + connector rail down to the next step */}
                <div className="flex flex-col items-center">
                  <span
                    aria-hidden="true"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                    style={{
                      background: "color-mix(in srgb, var(--primary) 12%, white)",
                      color: "var(--primary)",
                    }}
                  >
                    <step.icon className="h-4 w-4" />
                  </span>
                  {!last && (
                    <span
                      aria-hidden="true"
                      className="my-1 w-px flex-1"
                      style={{ background: "var(--divider)" }}
                    />
                  )}
                </div>
                {/* Copy column */}
                <div className={last ? "pb-0.5" : "pb-4"}>
                  <p className="text-sm font-semibold text-ink">
                    <span className="sr-only">Step {i + 1}: </span>
                    {step.label}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-body-gray">
                    {step.description}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        {/* Ties into the email-notice pipeline — HR notices arrive by email. */}
        <p
          className="mt-1 flex items-start gap-2.5 border-t pt-4 text-xs leading-relaxed text-stone"
          style={{ borderTopColor: "var(--divider)" }}
        >
          <Mail className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--primary)" }} aria-hidden="true" />
          <span>
            Status updates land in your email from{" "}
            <span className="font-semibold text-ink">DOST-MIRDC Recruitment</span> — the same
            address that schedules your interview.
          </span>
        </p>
      </DialogContent>
    </Dialog>
  );
}

export default RailJourneyInfo;
