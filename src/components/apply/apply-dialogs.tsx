"use client";

// ============================================================================
// RMIS — Apply flow (spec §7.6): gating, confirm step, and MQR failure
// presentation. The PDS quick-apply fast-track for incomplete profiles was
// retired — applicants are sent to finish their profile in the profile
// builder first, then apply through the normal confirm step.
// Used by the jobs view. Bevel pass: white 24px dialog surface, cloud/60
// tiles, charcoal capsule CTAs, functional --bad tints for MQR failures.
// ============================================================================

import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch, humanize, deadlineState } from "@/lib/client";
import { navigate } from "@/lib/router";
import { useSession } from "@/components/session-provider";
import type { JobWire, MqrResults } from "@/lib/router";
import type { SessionUser } from "@/lib/router";
import { MQR_MEETS } from "@/lib/mqr.shared";

type JobLike = Pick<JobWire, "id" | "title" | "positionType" | "numberOfVacancy" | "deadlineDate"> &
  { position?: { itemNumber?: string | null; placeOfAssignment?: string | null; positionTitle?: string } | null };

// ── Gate + opener (shared by jobs board) ────────────────────────────────────

export function useApplyFlow() {
  const { user, refresh } = useSession();
  const [activeJob, setActiveJob] = useState<JobLike | null>(null);

  const requestApply = useCallback(
    (job: JobLike) => {
      if (!user) {
        toast.info("Please sign in to apply", {
          description: "Create an account or sign in to submit an application.",
          action: { label: "Sign in", onClick: () => navigate("signin") },
        });
        navigate("signin");
        return;
      }
      if (user.role !== "APPLICANT") {
        toast.error("Only applicant accounts can apply for positions.");
        return;
      }
      if (!user.applicant?.isProfileComplete) {
        // Quick apply (PDS fast-track) was retired — an incomplete profile
        // must be finished in the profile builder before applying.
        toast.info("Complete your profile to apply", {
          description: "Finish your applicant profile, then apply for this position.",
          action: { label: "Go to profile", onClick: () => navigate("profile") },
        });
        navigate("profile");
        return;
      }
      setActiveJob(job);
    },
    [user]
  );

  return {
    requestApply,
    dialogs: activeJob && user ? (
      <ApplyDialogs
        job={activeJob}
        user={user}
        onClose={() => setActiveJob(null)}
        onApplied={async () => {
          await refresh();
        }}
      />
    ) : null,
  };
}

// ── MQR failure presentation (spec §7.6) ────────────────────────────────────

function MqrFailure({ mqr, onGoProfile }: { mqr: MqrResults; onGoProfile: () => void }) {
  const dims: [string, string][] = [
    ["Education", mqr.education],
    ["Work Experience", mqr.workExperience],
    ["Training", mqr.training],
    ["Eligibility", mqr.eligibility],
  ];
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-[var(--bad-bg)] p-4">
        <p className="text-sm font-medium text-ink">Requirements Not Met</p>
        <p className="text-sm text-body-gray mt-1">
          Your credentials do not satisfy every minimum qualification for this position. Nothing was submitted.
        </p>
      </div>
      <ul className="space-y-2">
        {dims.map(([label, verdict]) => (
          <li key={label} className="flex items-start gap-3 rounded-lg bg-cloud/60 p-3">
            <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${verdict === MQR_MEETS ? "bg-charcoal text-[#ebf0f8]" : "bg-[var(--bad-bg)] text-[var(--bad)]"}`}>
              {verdict === MQR_MEETS ? "✓" : "✕"}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{label}</p>
              <p className="text-xs text-body-gray break-words">{verdict}</p>
            </div>
          </li>
        ))}
      </ul>
      <button onClick={onGoProfile} className="dlg-cta px-6 py-2.5 text-sm w-full min-h-[44px]">
        Update Profile
      </button>
    </div>
  );
}

// ── Main dialogs ────────────────────────────────────────────────────────────

export function ApplyDialogs({
  job,
  user,
  onClose,
  onApplied,
}: {
  job: JobLike;
  user: SessionUser;
  onClose: () => void;
  onApplied?: () => void | Promise<void>;
}) {
  const { refresh } = useSession();
  const [step, setStep] = useState<"confirm" | "mqr-fail" | "done">("confirm");
  const [mqr, setMqr] = useState<MqrResults | null>(null);
  const [busy, setBusy] = useState(false);

  const jobTitle = job.position?.positionTitle || job.title;
  const place = job.position?.placeOfAssignment || "DOST Compound, Taguig";

  // Normal apply: verify → submit (spec §7.6 Path A).
  const submitApplication = useCallback(async () => {
    setBusy(true);
    try {
      const check = await apiFetch<{ mqrResults: MqrResults; allMet: boolean }>("/api/jobs/verify-mqr", {
        method: "POST",
        body: { jobId: job.id },
      });
      if (!check.allMet) {
        setMqr(check.mqrResults);
        setStep("mqr-fail");
        return;
      }
      await apiFetch("/api/jobs/apply", { method: "POST", body: { jobId: job.id } });
      toast.success("Application submitted", { description: `You applied for ${jobTitle}. Track it from your home.` });
      setStep("done");
      await refresh();
      await onApplied?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      if (/complete your profile/i.test(msg)) {
        // Server-side profile gate (race safety): route the applicant to the
        // profile builder — the fast-track dialog no longer exists.
        toast.error("Complete your profile to apply", { description: msg });
        navigate("profile");
        onClose();
      } else if (/Minimum Qualification Requirements/i.test(msg)) {
        const details = (e as unknown as { details?: { mqrResults?: MqrResults } }).details;
        if (details?.mqrResults) setMqr(details.mqrResults);
        setStep("mqr-fail");
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  }, [job.id, jobTitle, refresh, onApplied, onClose]);

  const dl = deadlineState(job.deadlineDate);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg dlg-card-plain p-0 overflow-hidden max-h-[90dvh] overflow-y-auto scroll-thin">
        {/* Confirm step */}
        {step === "confirm" && (
          <div className="p-6">
            <DialogHeader className="text-left space-y-2">
              <div className="dlg-pill inline-flex w-fit items-center rounded-full bg-fog px-3 py-1 text-xs font-medium text-stone">Application</div>
              <DialogTitle className="font-display text-2xl tracking-[-0.02em] text-ink">{jobTitle}</DialogTitle>
              <DialogDescription className="text-sm text-body-gray">
                {place} · {job.positionType ? humanize(job.positionType) : "-"}{job.numberOfVacancy != null ? ` · ${job.numberOfVacancy} vacanc${job.numberOfVacancy === 1 ? "y" : "ies"}` : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-cloud/60 p-3">
                <p className="text-xs text-stone">Item No.</p>
                <p className="text-ink">{job.position?.itemNumber || "-"}</p>
              </div>
              <div className="rounded-lg bg-cloud/60 p-3">
                <p className="text-xs text-stone">Deadline</p>
                <p className={`text-ink ${dl.overdue ? "text-[var(--bad)]" : ""}`}>{dl.label}</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-body-gray">
              Your profile will be submitted for evaluation against the minimum qualification requirements. HR verifies all credentials at the next stage.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button onClick={onClose} className="dlg-ghost flex-1 px-6 py-2.5 text-sm min-h-[44px]">Cancel</button>
              <button onClick={submitApplication} disabled={busy} className="dlg-cta flex-1 px-6 py-2.5 text-sm min-h-[44px] disabled:opacity-50">
                {busy ? "Submitting…" : "Submit Application"}
              </button>
            </div>
          </div>
        )}

        {/* MQR failure */}
        {step === "mqr-fail" && mqr && (
          <div className="p-6">
            <DialogHeader className="text-left space-y-1">
              <DialogTitle className="font-display text-2xl tracking-[-0.02em] text-ink">Minimum Qualifications</DialogTitle>
              <DialogDescription className="text-sm text-body-gray">Automated evaluation for {jobTitle}</DialogDescription>
            </DialogHeader>
            <div className="mt-4">
              <MqrFailure mqr={mqr} onGoProfile={() => { navigate("profile"); onClose(); }} />
            </div>
          </div>
        )}

        {/* Done */}
        {step === "done" && (
          <div className="p-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-charcoal text-xl text-[#ebf0f8]">✓</div>
            <h3 className="mt-4 font-display text-2xl tracking-[-0.02em] text-ink">Application submitted</h3>
            <p className="mt-2 text-sm text-body-gray">
              We received your application for {jobTitle}. You will receive an SMS confirmation shortly.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button onClick={() => { navigate("home"); onClose(); }} className="dlg-cta flex-1 px-6 py-2.5 text-sm min-h-[44px]">
                View My Applications
              </button>
              <button onClick={() => { navigate("profile"); onClose(); }} className="dlg-ghost flex-1 px-6 py-2.5 text-sm min-h-[44px]">
                Review Profile
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
