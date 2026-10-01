"use client";

// ============================================================================
// RMIS — Evaluator review workspace (spec §7.9, §9.3).
// Default export = smart wrapper: with an `applicationId` prop it renders the
// workspace body (used inside the review-queue modal); without one it reads
// the deep-link `#/evaluator-review?id=<applicationId>` from useHashRoute and
// renders page-style with a close action back to the review queue.
// LEFT = frozen-snapshot dossier (capsule section tabs), RIGHT = decision
// rail (requirements match, credentials, state banner, decisions, notices,
// direct email). Enterprise polish pass: functional status pills/dots only —
// every handler, fetch, and confirmation dialog is unchanged.
// Bevel pass: shared page header with round back affordance, white dossier
// panel with cloud/60 snapshot tiles + capsule tabs, cloud decision-rail
// cards with white/70 interior tiles, metric-blue links, charcoal decision
// capsules. Zero logic changes.
// Wave-3 premium pass: warm monogram dossier header, gradient ink→ember
// active-tab underline, tone chips on verdict actions, mini emerald/rose
// requirement indicators, IconChip rail headers.
// Decision flow: Shortlist / Not Qualified each open a decision composer
// dialog (remarks optional) — its Confirm is guarded by a decision
// confirmation dialog, exactly like the direct-email composer. Decision
// actions carry proper plain lucide glyphs (outlined green check-circle for
// Shortlist, outlined red X-circle for Not Qualified) — same style as the
// Send icon on
// the direct-email button, no chip boxes. Direct email
// is a composer dialog opened from a "Send a direct email" button, with the
// recipient auto-retrieved from the applicant profile.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, Award, BadgeCheck, BookOpen, BriefcaseBusiness,
  Check, Eye, FileText, Gavel, GraduationCap, History, IdCard, ListChecks, Mail,
  CheckCircle2, Minus, Mails, Paperclip, RotateCcw, ScanSearch, Send, UserRound, X, XCircle,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  EmptyState, IconChip, Monogram, PageHeader, SkeletonRows, type ChipTone,
} from "@/components/ui/shell";
import { apiFetch, formatDate, formatDateTime, fullName, timeAgo } from "@/lib/client";
import { getStatusMeta, stageForStatus, type Tone } from "@/lib/status";
import { pillClass, variantForStatus, variantForVerdict, type StatusVariant } from "@/lib/status-ui";
import { navigate, useHashRoute } from "@/lib/router";
import { cn } from "@/lib/utils";
import type { RequirementsReport } from "@/lib/requirements";

// ── Wire shapes (GET /api/evaluator/applications/[id]) ──────────────────────

type SnapRow = Record<string, unknown>;

type ReviewPayload = {
  id: number;
  status: string;
  reason: string | null;
  dateApplied: string;
  applicantId: number;
  jobId: number;
  job: {
    id: number;
    title: string;
    positionType: string | null;
    position: {
      positionTitle: string;
      placeOfAssignment: string | null;
      itemNumber: string | null;
    } | null;
  };
  applicant: {
    id: number;
    firstName: string | null;
    lastName: string | null;
    emailAddress: string | null;
    contactNumber: string | null;
    gender: string | null;
    isProfileComplete: boolean;
  };
  snapshots: {
    profile: SnapRow | null;
    educations: SnapRow[];
    experiences: SnapRow[];
    trainings: SnapRow[];
    eligibilities: SnapRow[];
    awards: SnapRow[];
    documents: unknown[];
  };
  requirements: RequirementsReport;
};

type NoticeRow = {
  id: number;
  type: "regret" | "interview" | "skills_exam";
  subject: string;
  status: string;
  to: string;
  sentAt: string;
};

type DirectEmailRow = {
  id: number;
  to: string;
  subject: string;
  status: string;
  provider: string;
  error: string | null;
  attachments: string | null;
  createdAt: string;
};

type NoticeSendResult = {
  type: string;
  email: { status: string; to?: string; error?: string | null };
  sms: { status: string; to?: string; error?: string | null };
};

// ── Small shared visuals ────────────────────────────────────────────────────

/** Legacy tone→class bridge (kept for existing importers). */
export function toneClass(tone: Tone): string {
  const map: Record<Tone, StatusVariant> = {
    success: "ok",
    warning: "warn",
    danger: "bad",
    info: "info",
    primary: "info",
    neutral: "neutral",
  };
  return pillClass(map[tone]);
}

/**
 * Canonical stage/status pill. Displays the normalized status label; the
 * variant comes from variantForStatus unless explicitly overridden (used for
 * completion / verdict labels that are not application statuses).
 */
export function StatusPill({
  status,
  variant,
  className = "",
}: {
  status: string | null | undefined;
  variant?: StatusVariant;
  className?: string;
}) {
  const label = getStatusMeta(status).label;
  const v: StatusVariant = variant ?? variantForStatus(status);
  return <span className={cn(pillClass(v), "shrink-0", className)}>{label}</span>;
}

function verdictMeta(verdict: string): { chip: string; variant: StatusVariant; meaning: string } {
  switch (verdict) {
    case "ALL_MET":
      return { chip: "Qualified", variant: variantForVerdict("Qualified"), meaning: "Meets the minimum requirements" };
    case "PARTIAL":
      return { chip: "Partial", variant: variantForVerdict("Partial"), meaning: "Partially meets the minimum requirements" };
    case "NONE_MET":
      return { chip: "Not qualified", variant: variantForVerdict("Not qualified"), meaning: "Does not meet the minimum requirements" };
    case "NEEDS_REVIEW":
      return { chip: "Verify", variant: variantForVerdict("Verify"), meaning: "Needs manual verification" };
    case "NO_REQUIREMENTS":
      return { chip: "No reqs", variant: variantForVerdict("No reqs"), meaning: "No published requirements" };
    default:
      return { chip: verdict, variant: variantForVerdict(verdict), meaning: "" };
  }
}

/** MQR verdict pill for queue cards / list rows (null when no verdict). */
export function VerdictPill({ verdict, className = "" }: { verdict: string | null | undefined; className?: string }) {
  if (!verdict) return null;
  const vm = verdictMeta(verdict);
  return <span className={cn(pillClass(vm.variant), "shrink-0", className)}>{vm.chip}</span>;
}

const ghostBtn =
  "dlg-ghost inline-flex min-h-[44px] items-center justify-center gap-2 px-4 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const ctaBtn =
  "dlg-cta inline-flex min-h-[44px] items-center justify-center gap-2 px-5 text-sm transition-all disabled:cursor-not-allowed disabled:opacity-50";
const destructiveGhost =
  "border-[var(--bad)]/30 text-[var(--bad)] hover:bg-[var(--bad-bg)]";

/** Gradient monogram avatar (wave-3) with initials derived from the name. */
function MonogramAvatar({ name, size = 36, warm = false }: { name: string; size?: number; warm?: boolean }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span aria-hidden="true">
      <Monogram size={size} warm={warm} className="rounded-full">{initials || "?"}</Monogram>
    </span>
  );
}

/** Requirement check status → mini matched/missing indicator chip. */
function checkChip(status: string): { icon: typeof Check; tone: ChipTone } {
  switch (status) {
    case "MET":
      return { icon: Check, tone: "emerald" };
    case "NOT_MET":
      return { icon: X, tone: "rose" };
    case "REVIEW":
      return { icon: Eye, tone: "slate" };
    default:
      return { icon: Minus, tone: "slate" };
  }
}

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  const s = String(v).trim();
  return s;
}

function LedgerRow({ label, value, num = false }: { label: string; value: string; num?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-divider py-2.5 last:border-0">
      <span className="shrink-0 pt-0.5 text-xs text-stone">{label}</span>
      {/* min-w-0: long unbreakable values (emails, URLs) must be allowed to
          shrink + break inside the flex row, otherwise the row's min-content
          forces the dialog's grid track wider than small viewports. */}
      <span className={cn("min-w-0 break-words text-right text-sm text-ink", num && "num")}>{value || "—"}</span>
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-body-gray">{children}</p>;
}

function snapshotDisplayDate(v: unknown): string {
  const s = str(v);
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : formatDate(d);
}

// ── Dossier section tabs (underline style) ──────────────────────────────────

const DOSSIER_TABS = [
  { value: "profile", label: "Profile", icon: UserRound },
  { value: "education", label: "Education", icon: GraduationCap },
  { value: "experience", label: "Experience", icon: BriefcaseBusiness },
  { value: "training", label: "Training", icon: BookOpen },
  { value: "eligibility", label: "Eligibility", icon: BadgeCheck },
  { value: "awards", label: "Awards", icon: Award },
  { value: "documents", label: "Documents", icon: FileText },
] as const;

const tabsListCls =
  "h-auto w-full flex-wrap justify-start gap-1 rounded-full bg-fog p-1";
const tabTriggerCls =
  "flex-none gap-1.5 rounded-full border-0 bg-transparent px-3.5 py-2 text-[13px] font-medium text-stone shadow-none transition-colors hover:text-ink data-[state=active]:bg-white data-[state=active]:text-ink data-[state=active]:shadow-sm";

/** Bounded dossier section (modal only): min/max height + internal scroll —
    long lists scroll inside their section instead of stretching the modal. */
const boundedSectionCls =
  "min-h-[280px] max-h-[56dvh] overflow-y-auto scroll-thin lg:min-h-[360px] lg:max-h-[60dvh]";

// ── Snapshot tab renderers ──────────────────────────────────────────────────

function EducationCards({ rows }: { rows: SnapRow[] }) {
  if (!rows.length) return <EmptyNote>No education entries on file.</EmptyNote>;
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i} className="rounded-lg bg-cloud/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-ink">{str(r.degree) || str(r.course) || str(r.specifyOthers) || "—"}</p>
            {r.ongoing === true && <span className="status-pill status-neutral shrink-0">Ongoing</span>}
          </div>
          <p className="mt-1 text-xs text-body-gray">
            {[str(r.educationLevel), str(r.schoolName)].filter(Boolean).join(" · ") || "—"}
          </p>
          <p className="num mt-0.5 text-xs text-stone">
            {[str(r.yearFrom) && `${str(r.yearFrom)}–${str(r.yearTo) || (r.ongoing ? "Present" : "")}`, str(r.yearGraduated) && `Graduated ${str(r.yearGraduated)}`, str(r.unitsEarned) && `${str(r.unitsEarned)} units`]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
          {str(r.awards) && <p className="mt-1 text-xs text-body-gray">Honors: {str(r.awards)}</p>}
        </div>
      ))}
    </div>
  );
}

function ExperienceCards({ rows }: { rows: SnapRow[] }) {
  if (!rows.length) return <EmptyNote>No work experience entries on file.</EmptyNote>;
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i} className="rounded-lg bg-cloud/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-ink">{str(r.positionTitle) || "—"}</p>
            {r.isPresentWork === true && (
              <span className="dlg-pill shrink-0 rounded-full bg-charcoal px-2 py-0.5 text-xs font-medium text-[#ebf0f8]">Present</span>
            )}
          </div>
          <p className="mt-1 text-xs text-body-gray">{str(r.employerName) || "—"}</p>
          <p className="num mt-0.5 text-xs text-stone">
            {[
              (str(r.dateFrom) || str(r.dateTo)) &&
                `${snapshotDisplayDate(r.dateFrom) || "—"} – ${r.isPresentWork ? "Present" : snapshotDisplayDate(r.dateTo) || "—"}`,
              str(r.statusOfEmployment),
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
        </div>
      ))}
    </div>
  );
}

function TrainingCards({ rows }: { rows: SnapRow[] }) {
  if (!rows.length) return <EmptyNote>No training entries on file.</EmptyNote>;
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i} className="rounded-lg bg-cloud/60 p-4">
          <p className="text-sm text-ink">{str(r.title) || "—"}</p>
          <p className="num mt-1 text-xs text-body-gray">
            {[str(r.typeOfTraining), str(r.numberHours) && `${str(r.numberHours)} hrs`, str(r.hourDecimal) && `${str(r.hourDecimal)} hrs`]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
          <p className="num mt-0.5 text-xs text-stone">
            {snapshotDisplayDate(r.dateFrom) || snapshotDisplayDate(r.dateTo)
              ? `${snapshotDisplayDate(r.dateFrom) || "—"} – ${snapshotDisplayDate(r.dateTo) || "—"}`
              : "—"}
          </p>
        </div>
      ))}
    </div>
  );
}

function EligibilityCards({ rows }: { rows: SnapRow[] }) {
  if (!rows.length) return <EmptyNote>No eligibility records on file.</EmptyNote>;
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i} className="rounded-lg bg-cloud/60 p-4">
          <p className="text-sm text-ink">{str(r.title) || str(r.eligibilityTitle) || "—"}</p>
          <p className="num mt-1 text-xs text-body-gray">
            {[str(r.rating) && `Rating: ${str(r.rating)}`, snapshotDisplayDate(r.examDate), str(r.examPlace), str(r.licenseNumber) && `License ${str(r.licenseNumber)}`]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
        </div>
      ))}
    </div>
  );
}

function AwardCards({ rows }: { rows: SnapRow[] }) {
  if (!rows.length) return <EmptyNote>No awards or accomplishments on file.</EmptyNote>;
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i} className="rounded-lg bg-cloud/60 p-4">
          <p className="text-sm text-ink">{str(r.details) || "—"}</p>
          <p className="num mt-1 text-xs text-body-gray">
            {[str(r.recognitionType), str(r.scope), str(r.provider), snapshotDisplayDate(r.dateGranted)]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Decision rail pieces ────────────────────────────────────────────────────

/** Requirement check status → pill (verdict colors). */
function checkPill(status: string): { label: string; variant: StatusVariant } {
  switch (status) {
    case "MET":
      return { label: "Met", variant: "ok" };
    case "NOT_MET":
      return { label: "Not met", variant: "bad" };
    case "REVIEW":
      return { label: "Verify", variant: "neutral" };
    default:
      return { label: "Not required", variant: "neutral" };
  }
}

function RequirementsMatchPanel({ report }: { report: RequirementsReport }) {
  const vm = verdictMeta(report.verdict);
  const allMet = report.requiredCount > 0 && report.metCount === report.requiredCount;
  const summaryCls = allMet ? "text-[var(--ok)]" : report.metCount > 0 ? "text-[var(--warn)]" : "text-stone";
  return (
    <div className="dlg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <IconChip icon={ListChecks} tone="gold" size={36} iconSize={16} />
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold leading-6 text-ink">Requirements match</h3>
            <p className="mt-0.5 text-xs text-body-gray">{vm.meaning}</p>
          </div>
        </div>
        <StatusPill status={vm.chip} variant={vm.variant} className="shrink-0" />
      </div>
      <p className={cn("num mt-2 text-sm font-medium", summaryCls)}>
        {report.metCount} of {report.requiredCount} standards met
      </p>
      {report.checks.length > 0 && (
        <div className="mt-3 max-h-96 space-y-2.5 overflow-y-auto scroll-thin pr-1">
          {report.checks.map((c, i) => {
            const cp = checkPill(c.status);
            const cc = checkChip(c.status);
            return (
              <div key={i} className="rounded-lg bg-white/70 p-3.5">
                <div className="flex items-start gap-2.5">
                  <IconChip icon={cc.icon} tone={cc.tone} size={22} iconSize={12} className="mt-0.5" />
                  <p className="min-w-0 flex-1 text-[13px] leading-5 text-ink line-clamp-2">{c.standard || "—"}</p>
                  <StatusPill status={cp.label} variant={cp.variant} className="shrink-0" />
                </div>
                <p className="num mt-1.5 text-xs leading-5 text-body-gray line-clamp-2">
                  {c.applicantSummary || "No applicant data on file."}
                </p>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  {c.shortfall ? (
                    <p className="text-xs text-[var(--bad)]">{c.shortfall}</p>
                  ) : (
                    <span aria-hidden />
                  )}
                  <span className="dlg-pill shrink-0 rounded-full bg-fog px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-stone">
                    {c.dimension}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CredentialsRow({ payload }: { payload: ReviewPayload }) {
  const p = payload.snapshots.profile;
  const personalCount = p ? Object.values(p).filter((v) => v !== null && v !== "" && v !== undefined).length : 0;
  const items: [string, number][] = [
    ["Personal", personalCount],
    ["Education", payload.snapshots.educations.length],
    ["Work", payload.snapshots.experiences.length],
    ["Training", payload.snapshots.trainings.length],
    ["Eligibility", payload.snapshots.eligibilities.length],
    ["Awards", payload.snapshots.awards.length],
  ];
  return (
    <div className="dlg-card p-4">
      <div className="flex items-center gap-2.5">
        <IconChip icon={IdCard} tone="slate" size={28} iconSize={13} />
        <h3 className="text-[15px] font-semibold leading-6 text-ink">Credentials on file</h3>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {items.map(([label, n]) => (
          <span key={label} className="status-pill status-neutral">
            {label}: <span className="num">{n}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function stateBanner(stage: string): { text: string; cls: string } {
  if (stage === "Shortlisted") return { text: "Applicant has been notified.", cls: "text-stone" };
  if (stage === "Rejected") return { text: "Applicant was not shortlisted.", cls: "text-stone" };
  if (stage === "Under Review") return { text: "Review in progress.", cls: "text-ink" };
  return { text: "Awaiting review.", cls: "text-stone" };
}

// ── Notice form dialog (interview / skills exam) ────────────────────────────

function NoticeFormDialog({
  applicationId,
  kind,
  onClose,
  onSent,
}: {
  applicationId: number;
  kind: "interview" | "skills_exam";
  onClose: () => void;
  onSent: () => void;
}) {
  const [examType, setExamType] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [venue, setVenue] = useState("");
  const [contact, setContact] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const ready = date.trim() !== "" && time.trim() !== "" && venue.trim() !== "";

  const submit = async () => {
    setBusy(true);
    try {
      const res = await apiFetch<NoticeSendResult>(`/api/evaluator/applications/${applicationId}/notice`, {
        method: "POST",
        body: {
          type: kind,
          date: date || undefined,
          time: time || undefined,
          venue: venue || undefined,
          contact: contact || undefined,
          notes: notes || undefined,
          examType: kind === "skills_exam" ? examType || undefined : undefined,
        },
      });
      const label = kind === "interview" ? "Interview invitation" : "Skills-exam notice";
      toast.success(`${label} sent`, {
        description: `Email: ${res.email?.status ?? "unknown"} · SMS: ${res.sms?.status ?? "unknown"}`,
      });
      onSent();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send the notice");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto scroll-thin sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {kind === "interview" ? "Send interview invitation" : "Send skills-exam notice"}
          </DialogTitle>
          <DialogDescription>
            The notice fans out as an email plus a companion SMS to the applicant.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {kind === "skills_exam" && (
            <div className="space-y-1.5">
              <Label htmlFor="notice-exam-type" className="text-xs text-stone">
                Exam type
              </Label>
              <Input
                id="notice-exam-type"
                className="dlg-input"
                value={examType}
                onChange={(e) => setExamType(e.target.value)}
                placeholder="e.g. Encoding / trade test"
              />
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="notice-date" className="text-xs text-stone">
                Date *
              </Label>
              <Input id="notice-date" type="date" className="dlg-input" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notice-time" className="text-xs text-stone">
                Time *
              </Label>
              <Input id="notice-time" type="time" className="dlg-input" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notice-venue" className="text-xs text-stone">
              Venue *
            </Label>
            <Input
              id="notice-venue"
              className="dlg-input"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="Building / room"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notice-contact" className="text-xs text-stone">
              HR contact
            </Label>
            <Input
              id="notice-contact"
              className="dlg-input"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="Name / number for questions"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notice-notes" className="text-xs text-stone">
              Notes
            </Label>
            <Textarea id="notice-notes" className="dlg-input min-h-[80px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <button type="button" className={ghostBtn} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={ctaBtn} disabled={!ready || busy} onClick={() => void submit()}>
            <Send className="h-4 w-4" aria-hidden />
            {busy ? "Sending…" : "Send notice"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Decision composer dialog (Shortlist / Not Qualified) ──────────────────

/** Composer dialog opened from the Decision card: remarks optional, its
    Confirm guarded by a confirmation dialog — same pattern as the direct
    email composer. */
function DecisionDialog({
  applicationId,
  decision,
  email,
  onClose,
  onDecided,
}: {
  applicationId: number;
  decision: "Shortlisted" | "Rejected";
  email: string | null;
  onClose: () => void;
  onDecided: () => void;
}) {
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const shortlist = decision === "Shortlisted";

  const submit = async () => {
    setBusy(true);
    try {
      await apiFetch(`/api/evaluator/applications/${applicationId}`, {
        method: "PATCH",
        body: { status: decision, reason: remarks.trim() || undefined },
      });
      toast.success(`Applicant marked as ${getStatusMeta(decision).label}`, {
        description: email
          ? `A notification email was sent to ${email}.`
          : "No email on record — HR will contact the applicant directly.",
      });
      setConfirmOpen(false);
      onClose();
      onDecided();
    } catch (e) {
      setConfirmOpen(false);
      toast.error(e instanceof Error ? e.message : "Failed to update the application");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog open onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto scroll-thin sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              {shortlist ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--ok)]" aria-hidden />
              ) : (
                <XCircle className="h-5 w-5 shrink-0 text-[var(--bad)]" aria-hidden />
              )}
              <DialogTitle className="font-display text-xl">
                {shortlist ? "Shortlist this applicant" : "Mark as Not Qualified"}
              </DialogTitle>
            </div>
            <DialogDescription>
              {email
                ? `Confirming will notify the applicant at ${email}.`
                : "No email on record — HR will contact the applicant directly."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="decision-remarks" className="text-xs text-stone">
              Remarks (optional) — included as the reason
            </Label>
            <Textarea
              id="decision-remarks"
              className="dlg-input min-h-[100px]"
              placeholder={shortlist ? "e.g. Strong match on the minimum standards" : "e.g. Does not meet the experience requirement"}
              value={remarks}
              maxLength={500}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>
          <DialogFooter>
            <button type="button" className={ghostBtn} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className={ctaBtn} disabled={busy} onClick={() => setConfirmOpen(true)}>
              {shortlist ? (
                <CheckCircle2 className="h-4 w-4 text-[var(--ok)]" aria-hidden />
              ) : (
                <XCircle className="h-4 w-4 text-[var(--bad)]" aria-hidden />
              )}
              Confirm
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decision confirm */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{shortlist ? "Mark as Shortlisted?" : "Mark as Not Qualified?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {email
                ? `A notification email will be sent to ${email}.`
                : "No email on record — HR will contact the applicant directly."}
              {remarks.trim() ? ` Remarks will be included: “${remarks.trim()}”` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={shortlist ? "" : "border border-[var(--bad)]/30 bg-[var(--bad-bg)] text-[var(--bad)] hover:bg-[var(--bad-bg)]/80"}
              onClick={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              {busy ? "Working…" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Direct email card ───────────────────────────────────────────────────────

function parseAttachments(json: string | null): { name: string; bytes: number }[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as { name: string; bytes: number }[]) : [];
  } catch {
    return [];
  }
}

function emailStatusVariant(status: string): StatusVariant {
  return status === "sent" || status === "mock" ? "neutral" : "bad";
}

/** Composer dialog: subject + content, recipient auto-retrieved from the
    applicant profile (the server re-resolves it on send). Send is guarded by
    a confirmation dialog. */
function DirectEmailDialog({
  applicationId,
  to,
  onClose,
  onSent,
}: {
  applicationId: number;
  to: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickFiles = (list: FileList | null) => {
    if (!list) return;
    const next = Array.from(list);
    if (next.length + files.length > 3) {
      toast.error("A maximum of 3 attachments is allowed");
      return;
    }
    if (next.some((f) => f.size > 5 * 1024 * 1024)) {
      toast.error("Each attachment must be 5 MB or smaller");
      return;
    }
    setFiles((prev) => [...prev, ...next].slice(0, 3));
    if (fileRef.current) fileRef.current.value = "";
  };

  const send = async () => {
    if (!message.trim()) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("subject", subject.trim());
      fd.set("message", message.trim());
      for (const f of files) fd.append("attachments", f);
      const res = await apiFetch<{ email: { status: string; error?: string | null }; attachments: number }>(
        `/api/evaluator/applications/${applicationId}/email`,
        { method: "POST", formData: fd }
      );
      if (res.email?.status === "failed") {
        toast.error("Email delivery failed", { description: res.email.error ?? undefined });
      } else {
        toast.success(`Direct email ${res.email?.status}`, {
          description: res.attachments ? `${res.attachments} attachment(s) included.` : undefined,
        });
      }
      setConfirmOpen(false);
      onClose();
      onSent();
    } catch (e) {
      setConfirmOpen(false);
      toast.error(e instanceof Error ? e.message : "Failed to send the email");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog open onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto scroll-thin sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Send a direct email</DialogTitle>
            <DialogDescription>
              The recipient is retrieved automatically from the email on the applicant's profile.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="direct-email-to" className="text-xs text-stone">
                To
              </Label>
              <Input id="direct-email-to" className="dlg-input" value={to} readOnly aria-label="Recipient email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="direct-email-subject" className="text-xs text-stone">
                Subject
              </Label>
              <Input
                id="direct-email-subject"
                className="dlg-input"
                placeholder="Subject"
                value={subject}
                maxLength={200}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="direct-email-message" className="text-xs text-stone">
                Message *
              </Label>
              <Textarea
                id="direct-email-message"
                className="dlg-input min-h-[140px]"
                placeholder="Message *"
                value={message}
                maxLength={5000}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            <div>
              <label className="dlg-ghost focus-ring inline-flex min-h-[44px] cursor-pointer items-center gap-2 px-4 text-sm">
                <Paperclip className="h-4 w-4" aria-hidden />
                Attach files
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => pickFiles(e.target.files)}
                  aria-label="Attach files"
                />
              </label>
              {files.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {files.map((f) => (
                    <li key={f.name} className="flex items-center justify-between gap-2 text-xs text-stone">
                      <span className="truncate">{f.name}</span>
                      <button
                        type="button"
                        className="focus-ring shrink-0 text-[var(--bad)] hover:underline"
                        onClick={() => setFiles((prev) => prev.filter((x) => x !== f))}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <DialogFooter>
            <button type="button" className={ghostBtn} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className={ctaBtn}
              disabled={!message.trim() || busy}
              onClick={() => setConfirmOpen(true)}
            >
              <Send className="h-4 w-4" aria-hidden />
              {busy ? "Sending…" : "Send email"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send confirm */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send this email?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be delivered to {to}.{files.length > 0 ? ` ${files.length} attachment(s) will be included.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              {busy ? "Sending…" : "Send email"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Decision-rail card: opens the composer dialog and lists send history. */
function DirectEmailCard({
  applicationId,
  recipient,
  emails,
  onSent,
}: {
  applicationId: number;
  recipient: string | null;
  emails: DirectEmailRow[] | null;
  onSent: () => void;
}) {
  const [composerOpen, setComposerOpen] = useState(false);

  return (
    <div className="dlg-card p-4">
      <div className="flex items-center gap-2.5">
        <IconChip icon={Mail} tone="slate" size={28} iconSize={13} />
        <h3 className="text-[15px] font-semibold leading-6 text-ink">Direct email</h3>
      </div>
      <p className="mt-1 text-xs text-body-gray">
        {recipient
          ? "Recipient is pulled from the applicant's profile email — attachments ≤ 3 files × 5 MB."
          : "No email on record — the applicant left the profile email blank."}
      </p>
      <button
        type="button"
        className={ctaBtn + " mt-3 w-full"}
        disabled={!recipient}
        onClick={() => setComposerOpen(true)}
      >
        <Send className="h-4 w-4" aria-hidden />
        Send a direct email
      </button>
      <div className="mt-4 border-t border-divider pt-3">
        <p className="text-xs font-medium text-stone">History</p>
        <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto scroll-thin">
          {emails === null ? (
            <p className="text-xs text-body-gray">Loading…</p>
          ) : emails.length === 0 ? (
            <p className="text-xs text-body-gray">No direct emails sent yet.</p>
          ) : (
            emails.map((m) => {
              const atts = parseAttachments(m.attachments);
              return (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="truncate text-ink">{m.subject || "(no subject)"}</span>
                  <span className="flex shrink items-center gap-2 text-pebble">
                    {atts.length > 0 && <span className="num">{atts.length} att.</span>}
                    <span className="num">{timeAgo(m.createdAt)}</span>
                    <span className={pillClass(emailStatusVariant(m.status))}>{m.status}</span>
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
      {composerOpen && recipient && (
        <DirectEmailDialog
          applicationId={applicationId}
          to={recipient}
          onClose={() => setComposerOpen(false)}
          onSent={onSent}
        />
      )}
    </div>
  );
}

// ── The workspace BODY (shared by modal + page) ─────────────────────────────

export function ReviewWorkspace({
  applicationId,
  onClose,
  onDecided,
  bounded = false,
}: {
  applicationId: number;
  onClose?: () => void;
  onDecided?: () => void;
  /** Modal mode: dossier sections get bounded min/max heights with internal
      scroll (the full-page evaluator view keeps natural flow). */
  bounded?: boolean;
}) {
  const [payload, setPayload] = useState<ReviewPayload | null>(null);
  const [notices, setNotices] = useState<NoticeRow[] | null>(null);
  const [emails, setEmails] = useState<DirectEmailRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ status: string; title: string; description: string; destructive?: boolean } | null>(null);
  // Decision composer — Shortlist / Not Qualified each open the dialog.
  const [decisionKind, setDecisionKind] = useState<"Shortlisted" | "Rejected" | null>(null);
  const [busy, setBusy] = useState(false);
  const [noticeKind, setNoticeKind] = useState<"interview" | "skills_exam" | null>(null);
  const [regretOpen, setRegretOpen] = useState(false);
  const [regretBusy, setRegretBusy] = useState(false);
  const [tab, setTab] = useState("profile");

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setError(null);
      try {
        const [p, n, m] = await Promise.all([
          apiFetch<ReviewPayload>(`/api/evaluator/applications/${applicationId}`),
          apiFetch<{ notices: NoticeRow[] }>(`/api/evaluator/applications/${applicationId}/notice`),
          apiFetch<{ directEmails: DirectEmailRow[] }>(`/api/evaluator/applications/${applicationId}/email`),
        ]);
        setPayload(p);
        setNotices(n.notices);
        setEmails(m.directEmails);
      } catch (e) {
        if (!silent) setError(e instanceof Error ? e.message : "Failed to load the application");
      }
    },
    [applicationId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const refetch = useCallback(() => void load(true), [load]);

  const stage = payload ? stageForStatus(payload.status) : "Applied";
  const applicantName = payload ? fullName(payload.applicant) : "Applicant";
  const email = payload?.applicant.emailAddress ?? null;

  const decide = async (status: string) => {
    setBusy(true);
    try {
      await apiFetch(`/api/evaluator/applications/${applicationId}`, {
        method: "PATCH",
        body: { status },
      });
      const label = getStatusMeta(status).label;
      const silentRevert = status === "Applied";
      if (silentRevert) {
        toast.info("Returned to the review queue", { description: "No notification was sent to the applicant." });
      } else {
        toast.success(`Applicant marked as ${label}`, {
          description: email ? `A notification email was sent to ${email}.` : "No email on record — HR will contact the applicant directly.",
        });
      }
      setConfirmAction(null);
      onDecided?.();
      await load(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update the application");
    } finally {
      setBusy(false);
    }
  };

  const sendRegret = async () => {
    setRegretBusy(true);
    try {
      const res = await apiFetch<NoticeSendResult>(`/api/evaluator/applications/${applicationId}/notice`, {
        method: "POST",
        body: { type: "regret" },
      });
      toast.success("Regret letter sent", {
        description: `Email: ${res.email?.status ?? "unknown"} · SMS: ${res.sms?.status ?? "unknown"}`,
      });
      setRegretOpen(false);
      await load(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send the regret letter");
    } finally {
      setRegretBusy(false);
    }
  };

  const openConfirm = (status: string) => {
    const label = getStatusMeta(status).label;
    const consequence = email
      ? `An email will be sent to ${email}.`
      : "No email on record — HR will contact the applicant directly.";
    setConfirmAction({
      status,
      title: `Mark as ${label}?`,
      description: consequence,
      destructive: status === "Rejected",
    });
  };

  const regretAlreadySent = (notices ?? []).some((n) => n.type === "regret" && (n.status === "sent" || n.status === "mock"));
  const noticeLabel: Record<NoticeRow["type"], string> = {
    regret: "Regret letter",
    interview: "Interview invitation",
    skills_exam: "Skills-exam notice",
  };

  if (error) {
    return (
      <div className="dlg-card p-8">
        <EmptyState
          icon={AlertTriangle}
          tone="rose"
          title="Couldn't load the application"
          description={error}
          action={
            <div className="flex items-center justify-center gap-3">
              <button type="button" className={ghostBtn} onClick={() => void load()}>
                Retry
              </button>
              {onClose && (
                <button type="button" className={ghostBtn} onClick={onClose}>
                  Close
                </button>
              )}
            </div>
          }
        />
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_380px]">
        <div className="dlg-card-plain space-y-5 p-5 sm:p-6">
          <div className="space-y-2.5">
            <Skeleton className="h-7 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
          </div>
          <div className="flex gap-2 border-b border-border pb-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-20" />
            ))}
          </div>
          <SkeletonRows rows={6} />
        </div>
        <div className="space-y-4">
          <div className="dlg-card p-4">
            <Skeleton className="mb-3 h-4 w-32" />
            <SkeletonRows rows={3} rowClassName="h-6" />
          </div>
          <div className="dlg-card p-4">
            <Skeleton className="mb-3 h-4 w-24" />
            <SkeletonRows rows={4} rowClassName="h-6" />
          </div>
        </div>
      </div>
    );
  }

  const p = payload.snapshots.profile ?? {};
  const characterRefs = Array.isArray(p.characterReferences) ? (p.characterReferences as SnapRow[]) : [];
  const banner = stateBanner(stage);
  const positionTitle = payload.job.position?.positionTitle || payload.job.title;
  const place = payload.job.position?.placeOfAssignment ?? null;
  const sectionCls = (extra: string) => (bounded ? `${extra} ${boundedSectionCls}` : extra);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_380px]">
      {/* ── LEFT: frozen dossier ── */}
      <div className="dlg-card-plain space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
            <MonogramAvatar name={applicantName} size={48} warm />
            <div className="min-w-0">
              <h2 className="text-xl font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-2xl">{applicantName}</h2>
              <p className="num mt-1 text-sm text-body-gray">
                {[positionTitle, place].filter(Boolean).join(" · ")} · Applied {formatDate(payload.dateApplied)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <StatusPill status={payload.status} />
            <button
              type="button"
              className="focus-ring inline-flex min-h-[44px] items-center text-sm font-medium text-metric-blue underline underline-offset-2 transition-colors hover:text-ink"
              onClick={() => navigate("candidate", { id: String(payload.applicant.id) })}
            >
              View full profile
            </button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className={tabsListCls}>
            {DOSSIER_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className={tabTriggerCls}>
                <t.icon className="size-3.5" aria-hidden />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="profile" className={sectionCls("pt-4")}>
            <div className="rounded-lg bg-cloud/60 p-4">
              <LedgerRow label="Email" value={str(p.emailAddress) || str(payload.applicant.emailAddress)} />
              <LedgerRow label="Mobile" value={str(p.mobileNumber) || str(p.contactNumber)} num />
              <LedgerRow label="Other phone" value={[str(p.contactNumberSec), str(p.telephoneNumber)].filter(Boolean).join(" · ")} num />
              <LedgerRow label="Gender" value={str(p.gender)} />
              <LedgerRow label="Civil status" value={str(p.civilStatus)} />
              <LedgerRow label="Birth date" value={snapshotDisplayDate(p.birthDate)} num />
              <LedgerRow label="Birth place" value={str(p.birthPlace)} />
              <LedgerRow label="Address" value={str(p.presentAddress)} />
            </div>
            <div className="mt-4">
              <p className="text-xs font-medium text-stone">Character references</p>
              {characterRefs.length === 0 ? (
                <p className="mt-1 text-sm text-body-gray">None on file.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {characterRefs.map((r, i) => (
                    <li key={i} className="text-sm text-ink">
                      {[str(r.name), str(r.address), str(r.telephone) || str(r.contactNumber)].filter(Boolean).join(" · ") || "—"}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>
          <TabsContent value="education" className={sectionCls("pt-4")}>
            <EducationCards rows={payload.snapshots.educations} />
          </TabsContent>
          <TabsContent value="experience" className={sectionCls("pt-4")}>
            <ExperienceCards rows={payload.snapshots.experiences} />
          </TabsContent>
          <TabsContent value="training" className={sectionCls("pt-4")}>
            <TrainingCards rows={payload.snapshots.trainings} />
          </TabsContent>
          <TabsContent value="eligibility" className={sectionCls("pt-4")}>
            <EligibilityCards rows={payload.snapshots.eligibilities} />
          </TabsContent>
          <TabsContent value="awards" className={sectionCls("pt-4")}>
            <AwardCards rows={payload.snapshots.awards} />
          </TabsContent>
          <TabsContent value="documents" className="pt-4">
            <div className="rounded-lg bg-cloud/60 p-6 text-center">
              <IconChip icon={FileText} tone="slate" size={40} className="mx-auto" />
              <p className="mt-2 text-sm text-body-gray">Supporting documents are verified in person at the next stage.</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── RIGHT: decision rail — inside the modal it never exceeds the
          dialog interior (92dvh − dialog padding), so the rail scrolls
          internally and the dialog itself never scrolls. */}
      <div
        className={`space-y-4 self-start lg:sticky lg:top-6 ${
          bounded ? "lg:max-h-[calc(92dvh-4rem)]" : "lg:max-h-[calc(100dvh-3rem)]"
        } lg:overflow-y-auto scroll-thin`}
      >
        <RequirementsMatchPanel report={payload.requirements} />
        <CredentialsRow payload={payload} />

        <div className={`rounded-lg bg-cloud/70 p-4 text-sm ${banner.cls}`}>
          <StatusPill status={payload.status} className="mr-2" />
          {banner.text}
        </div>

        {(stage === "Applied" || stage === "Under Review") && (
          <div className="dlg-card space-y-3 p-4">
            <div className="flex items-center gap-2.5">
              <IconChip icon={Gavel} tone="slate" size={28} iconSize={13} />
              <h3 className="text-[15px] font-semibold leading-6 text-ink">Decision</h3>
            </div>
            <div className="space-y-2">
              {stage === "Applied" && (
                <button type="button" className={ghostBtn + " w-full"} onClick={() => openConfirm("Under Review")}>
                  <ScanSearch className="h-4 w-4 text-[var(--warn)]" aria-hidden />
                  Start Review
                </button>
              )}
              <button type="button" className={ctaBtn + " w-full"} onClick={() => setDecisionKind("Shortlisted")}>
                <CheckCircle2 className="h-4 w-4 text-[var(--ok)]" aria-hidden />
                Shortlist
              </button>
              <button
                type="button"
                className={ghostBtn + " w-full " + destructiveGhost}
                onClick={() => setDecisionKind("Rejected")}
              >
                <XCircle className="h-4 w-4 text-[var(--bad)]" aria-hidden />
                Not Qualified
              </button>
            </div>
            <p className="text-xs text-body-gray">
              {email ? `Decisions email ${email}.` : "No email on record for this applicant."}
            </p>
          </div>
        )}

        {(stage === "Shortlisted" || stage === "Rejected") && (
          <div className="dlg-card space-y-3 p-4">
            <div className="flex items-center gap-2.5">
              <IconChip icon={History} tone="slate" size={28} iconSize={13} />
              <h3 className="text-[15px] font-semibold leading-6 text-ink">Revise decision</h3>
            </div>
            <p className="text-xs text-body-gray">Changing the decision notifies the applicant.</p>
            <button
              type="button"
              className={
                ghostBtn + " w-full" + (stage === "Shortlisted" ? " " + destructiveGhost : "")
              }
              onClick={() =>
                stage === "Shortlisted"
                  ? setConfirmAction({
                      status: "Rejected",
                      title: "Mark as Not Qualified?",
                      description: email
                        ? `The decision will be flipped and a regret letter will be emailed to ${email}.`
                        : "The decision will be flipped. No email on record — HR will contact the applicant directly.",
                      destructive: true,
                    })
                  : setConfirmAction({
                      status: "Shortlisted",
                      title: "Mark as Shortlisted?",
                      description: email
                        ? `The decision will be flipped and the shortlist notice will be emailed to ${email}.`
                        : "The decision will be flipped. No email on record — HR will contact the applicant directly.",
                    })
              }
            >
              {stage === "Shortlisted" ? (
                <>
                  <XCircle className="h-4 w-4 text-[var(--bad)]" aria-hidden />
                  Flip to Not Qualified
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 text-[var(--ok)]" aria-hidden />
                  Flip to Shortlisted
                </>
              )}
            </button>
            <button
              type="button"
              className={ghostBtn + " w-full"}
              onClick={() =>
                setConfirmAction({
                  status: "Applied",
                  title: "Return to review queue?",
                  description: "This reverts the application to Applied and does NOT notify the applicant.",
                })
              }
            >
              <RotateCcw className="h-4 w-4 text-stone" aria-hidden />
              Return to Review
            </button>
          </div>
        )}

        {/* Notices */}
        <div className="dlg-card space-y-3 p-4">
          <div className="flex items-center gap-2.5">
            <IconChip icon={Mails} tone="slate" size={28} iconSize={13} />
            <h3 className="text-[15px] font-semibold leading-6 text-ink">Notices</h3>
          </div>
          <div className="max-h-48 space-y-1.5 overflow-y-auto scroll-thin">
            {notices === null ? (
              <p className="text-xs text-body-gray">Loading…</p>
            ) : notices.length === 0 ? (
              <p className="text-xs text-body-gray">No notices sent yet.</p>
            ) : (
              notices.map((n) => (
                <div key={n.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="truncate text-ink">{noticeLabel[n.type] ?? n.type}</span>
                  <span className="flex shrink items-center gap-2 text-pebble">
                    <span className="num">{formatDateTime(n.sentAt)}</span>
                    <span className={pillClass(n.status === "sent" || n.status === "mock" ? "neutral" : "bad")}>{n.status}</span>
                  </span>
                </div>
              ))
            )}
          </div>
          {stage === "Shortlisted" && (
            <div className="space-y-2">
              <button type="button" className={ghostBtn + " w-full"} onClick={() => setNoticeKind("interview")}>
                Send Interview Invitation
              </button>
              <button type="button" className={ghostBtn + " w-full"} onClick={() => setNoticeKind("skills_exam")}>
                Send Skills-Exam Notice
              </button>
            </div>
          )}
          {stage === "Rejected" && (
            <button
              type="button"
              className={ghostBtn + " w-full " + destructiveGhost}
              disabled={regretAlreadySent || regretBusy}
              onClick={() => setRegretOpen(true)}
            >
              {regretAlreadySent ? "Regret letter sent" : regretBusy ? "Sending…" : "Send Regret Letter"}
            </button>
          )}
        </div>

        <DirectEmailCard applicationId={applicationId} recipient={email} emails={emails} onSent={refetch} />
      </div>

      {/* Decision confirm */}
      <AlertDialog open={confirmAction !== null} onOpenChange={(v) => !v && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmAction?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={confirmAction?.destructive ? "border border-[var(--bad)]/30 bg-[var(--bad-bg)] text-[var(--bad)] hover:bg-[var(--bad-bg)]/80" : ""}
              onClick={(e) => {
                e.preventDefault();
                if (confirmAction) void decide(confirmAction.status);
              }}
            >
              {busy ? "Working…" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Regret confirm */}
      <AlertDialog open={regretOpen} onOpenChange={setRegretOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send the regret letter?</AlertDialogTitle>
            <AlertDialogDescription>
              {email
                ? `A formal regret letter will be emailed to ${email}.`
                : "No email on record — the send will be logged as skipped and HR will contact the applicant directly."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="border border-[var(--bad)]/30 bg-[var(--bad-bg)] text-[var(--bad)] hover:bg-[var(--bad-bg)]/80"
              onClick={(e) => {
                e.preventDefault();
                void sendRegret();
              }}
            >
              Send regret letter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Decision composer */}
      {decisionKind && (
        <DecisionDialog
          applicationId={applicationId}
          decision={decisionKind}
          email={email}
          onClose={() => setDecisionKind(null)}
          onDecided={() => {
            onDecided?.();
            void load(true);
          }}
        />
      )}

      {/* Notice form */}
      {noticeKind && (
        <NoticeFormDialog
          applicationId={applicationId}
          kind={noticeKind}
          onClose={() => setNoticeKind(null)}
          onSent={refetch}
        />
      )}
    </div>
  );
}

// ── Deep-link page (default export, prop-detection wrapper) ─────────────────

function ReviewWorkspacePage() {
  const { params } = useHashRoute();
  const id = Number(params.id);
  const valid = Number.isInteger(id) && id > 0;
  const close = useCallback(() => navigate("review-queue"), []);

  return (
    <div className="space-y-6">
      {/* Enterprise page header (PageHeader) — labelled back affordance + title */}
      <PageHeader
        back={{ label: "Back to Review Queue", onClick: close }}
        title="Review Workspace"
        description="Applicant dossier and decision rail."
      />
      {valid ? (
        <ReviewWorkspace applicationId={id} onClose={close} />
      ) : (
        <div className="dlg-card py-6">
          <EmptyState
            icon={FileText}
            title="No application selected"
            description="Open a review from the queue to see the applicant dossier."
            action={
              <button type="button" className={ctaBtn} onClick={close}>
                Go to review queue
              </button>
            }
          />
        </div>
      )}
    </div>
  );
}

export default function ReviewWorkspaceRoute(props: {
  applicationId?: number;
  onClose?: () => void;
  onDecided?: () => void;
}) {
  if (typeof props.applicationId === "number") {
    return <ReviewWorkspace applicationId={props.applicationId} onClose={props.onClose} onDecided={props.onDecided} />;
  }
  return <ReviewWorkspacePage />;
}
