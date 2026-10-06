"use client";

// ============================================================================
// RMIS — PDS upload & auto-extraction (spec §7.5, §8.4), rendered as the
// compact "PDS Upload" row inside the profile header card.
// Collapsed by default (the resting look); expanding reveals the pipeline:
// upload (category PDS) → extract → auto-apply, with Uploading → Extracting
// → Applying phase progress. ONE-EXTRACTION LOCK: once any extractable
// document is EXTRACTED/PARTIALLY_EXTRACTED the dropzone is replaced by a
// locked strip whose only way back is "Clear Forms & Re-upload" → confirm →
// POST /api/applicant/profile/clear (files stay). Extraction errors show the
// server message + file name + Try Again. Bevel pass: WHITE collapsible card
// (sits on the record panel's cloud tint) with a cloud dashed drop zone,
// Metric Blue progress/ring, capsule destructive actions. Presentation-only
// changes.
// ============================================================================

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, CloudUpload, Loader2, Lock, RefreshCcw } from "lucide-react";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { IconChip } from "@/components/ui/shell";
import { apiFetch } from "@/lib/client";
import { EXTRACTABLE_CATEGORIES } from "@/lib/validation";
import type { DocumentWire } from "@/lib/router";
import { cn } from "@/lib/utils";
import { useSession } from "@/components/session-provider";

const EXTRACTABLE = EXTRACTABLE_CATEGORIES as readonly string[];

type Phase = "idle" | "uploading" | "extracting" | "applying";

type QualityInfo = {
  score: number;
  grade: string;
  needsReview: number;
  issues?: { severity: string; section: string; field: string; message: string }[];
};

type ExtractResponse = {
  results: { id: string; status: string; error?: string; quality?: QualityInfo }[];
  merged: (Record<string, unknown> & { quality?: QualityInfo }) | null;
  parserPath?: string;
};

type AutoApplyResponse = {
  applied: Record<string, number>;
  replaced: { personal: number };
  totalFilled: number;
  totalReplaced: number;
  message: string;
};

const PHASE_LABEL: Record<Phase, string> = {
  idle: "",
  uploading: "Uploading your PDS…",
  extracting: "Extracting from your PDS…",
  applying: "Applying to your profile…",
};

export default function PdsUploadCard({
  docs,
  onProfileReplaced,
  onDocsChanged,
}: {
  docs: DocumentWire[];
  /** Called after auto-apply / clear — reloads profile + docs and re-seeds forms. */
  onProfileReplaced: () => void | Promise<void>;
  /** Called when document statuses changed without touching the profile. */
  onDocsChanged: () => void | Promise<void>;
}) {
  const { refresh } = useSession();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<{ message: string; fileName: string } | null>(null);
  const [lastApply, setLastApply] = useState<AutoApplyResponse | null>(null);
  const [quality, setQuality] = useState<QualityInfo | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const locked = useMemo(
    () => docs.some((d) => EXTRACTABLE.includes(d.category) && (d.status === "EXTRACTED" || d.status === "PARTIALLY_EXTRACTED")),
    [docs]
  );
  const busy = phase !== "idle";

  /** Quiet .num rows describing what the last auto-apply filled, per section. */
  const applyRows = useMemo(() => {
    if (!lastApply) return [];
    const rows: [string, number][] = [
      ["Personal details", lastApply.applied.personal],
      ["Education entries", lastApply.applied.education],
      ["Work experience entries", lastApply.applied.work],
      ["Training entries", lastApply.applied.training],
      ["Eligibility entries", lastApply.applied.eligibility],
      ["Awards", lastApply.applied.awards],
      ["Existing personal values replaced", lastApply.replaced.personal],
    ];
    return rows.filter(([, n]) => n > 0);
  }, [lastApply]);

  const runPipeline = async (file: File) => {
    setError(null);
    setLastApply(null);
    setQuality(null);
    try {
      // 1 — Upload (category PDS).
      setPhase("uploading");
      setProgress(20);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", "PDS");
      const doc = await apiFetch<{ id: string }>("/api/applicant/documents", { method: "POST", formData: fd });

      // 2 — Extract (streaming endpoint; apiFetch tolerates keep-alive bytes).
      setPhase("extracting");
      setProgress(55);
      const ext = await apiFetch<ExtractResponse>("/api/applicant/documents/extract", {
        method: "POST",
        body: { documentIds: [doc.id] },
      });
      setProgress(75);

      if (!ext.merged) {
        const failed = ext.results?.find((r) => r.error);
        setError({
          message:
            failed?.error ??
            "Extraction failed. Try a filled PDS file: Excel CS Form 212 (.xlsx or legacy .xls, Excel 2019 and older), PDF, DOCX, or a clear photo of the form.",
          fileName: file.name,
        });
        setPhase("idle");
        setProgress(0);
        await onDocsChanged();
        return;
      }
      setQuality(ext.merged.quality ?? null);

      // 3 — Auto-apply (§8.4: personal overrides, sections replace).
      setPhase("applying");
      setProgress(90);
      const applied = await apiFetch<AutoApplyResponse>("/api/applicant/profile/auto-apply", {
        method: "POST",
        body: { extraction: ext.merged },
      });
      setProgress(100);
      toast.success(`${applied.totalFilled} fields updated`, {
        description:
          applied.totalReplaced > 0
            ? `${applied.totalReplaced} existing value${applied.totalReplaced === 1 ? " was" : "s were"} replaced. Review each section before applying.`
            : "Review each section before applying.",
      });
      setLastApply(applied);
      setPhase("idle");
      setProgress(0);
      await onProfileReplaced();
      await refresh();
    } catch (e) {
      setError({
        message: e instanceof Error ? e.message : "Something went wrong while processing your PDS.",
        fileName: file.name,
      });
      setPhase("idle");
      setProgress(0);
      await onDocsChanged();
    }
  };

  const clearProfile = async () => {
    setClearing(true);
    try {
      await apiFetch("/api/applicant/profile/clear", { method: "POST" });
      toast.success("Profile cleared", {
        description: "Your forms are empty again. Upload your PDS to auto-fill them.",
      });
      setClearOpen(false);
      setLastApply(null);
      setQuality(null);
      await onProfileReplaced();
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to clear your profile");
    } finally {
      setClearing(false);
    }
  };

  const pickFile = () => inputRef.current?.click();

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="dlg-card-plain overflow-hidden"
    >
      {/* Compact resting row — the screenshot look: chip · title · drop hints */}
      <CollapsibleTrigger asChild>
        <button
          type="button"
          aria-expanded={open}
          className="flex min-h-[44px] w-full items-center gap-3 p-3.5 text-left transition-colors hover:bg-cloud/60"
        >
          <IconChip icon={CloudUpload} tone="plum" size={40} />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-1.5">
              <span className="text-base font-semibold tracking-[-0.01em] text-ink">PDS Upload</span>
            </span>
            <span className="mt-0.5 block truncate text-xs text-stone">
              Drop PDS, resume, or certificates · XLSX / XLS (Excel 2019 and older), PDF, DOCX, images · 10MB max
            </span>
          </span>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 text-stone transition-transform duration-200", open && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="border-t border-divider p-4">
          {/* Phase progress — thin capsule bar with a Metric Blue fill */}
          {busy && (
            <div className="mb-4">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-cloud/60">
                <div
                  className="h-full rounded-full bg-metric-blue motion-safe:transition-[width] duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-2 flex items-center gap-2 text-xs text-stone">
                <Loader2 className="h-3 w-3 animate-spin" /> {PHASE_LABEL[phase]}
              </p>
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-xl bg-[var(--bad-bg)] p-4">
              <p className="text-sm text-ink">{error.message}</p>
              <p className="mt-0.5 text-xs text-stone">{error.fileName}</p>
              <button
                type="button"
                onClick={pickFile}
                className="dlg-ghost mt-3 inline-flex min-h-[44px] items-center gap-2 px-5 py-2 text-sm"
              >
                <RefreshCcw className="h-3.5 w-3.5" /> Try Again
              </button>
            </div>
          )}

          {/* Extraction result — quiet rows with tabular counts */}
          {!busy && (applyRows.length > 0 || quality) && (
            <div className="mb-4 rounded-xl bg-cloud/60 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xs font-medium text-stone">Extraction applied to your profile</p>
                {quality && (
                  <p className="flex items-center gap-1.5 text-xs text-stone">
                    <span
                      className={cn(
                        "inline-flex h-5 min-w-[2.5rem] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold text-white",
                        quality.grade === "A" ? "bg-[var(--good, #0a9565)]" : quality.grade === "B" ? "bg-metric-blue" : quality.grade === "C" ? "bg-amber-500" : "bg-[var(--bad)]"
                      )}
                    >
                      {quality.grade} · {quality.score}/100
                    </span>
                    extraction quality
                  </p>
                )}
              </div>
              {applyRows.length > 0 && (
                <dl className="mt-2 divide-y divide-divider">
                  {applyRows.map(([label, count]) => (
                    <div key={label} className="flex items-baseline justify-between gap-4 py-1.5 first:pt-0 last:pb-0">
                      <dt className="text-xs text-stone">{label}</dt>
                      <dd className="num text-xs font-medium text-ink">{count}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {quality && quality.needsReview > 0 && (
                <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-ink">
                  {quality.needsReview} value{quality.needsReview === 1 ? " needs" : "s need"} review — low-confidence reads
                  {quality.issues?.length ? ` and ${quality.issues.length} checker note${quality.issues.length === 1 ? "" : "s"}` : ""}. Please verify them on your forms below.
                </p>
              )}
              {quality && quality.issues && quality.issues.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {quality.issues.slice(0, 3).map((iss, i) => (
                    <li key={i} className="text-[11px] leading-relaxed text-stone">
                      · {iss.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {locked ? (
            /* One-extraction lock (§7.5) — the only way back is a full clear. */
            <div className="flex flex-col gap-3 rounded-xl bg-cloud/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <IconChip icon={Lock} tone="ink" size={36} iconSize={16} className="mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-ink">Profile auto-filled from your PDS</p>
                  <p className="mt-0.5 text-xs text-stone">
                    Extraction already ran on your documents. Clear your forms to start over.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setClearOpen(true)}
                disabled={clearing}
                className="inline-flex min-h-[44px] w-fit shrink-0 items-center justify-center rounded-full border border-[var(--bad)]/30 bg-white px-5 py-2.5 text-sm font-medium text-[var(--bad)] transition-colors hover:bg-[var(--bad-bg)] disabled:opacity-50"
              >
                {clearing ? "Clearing…" : "Clear Forms & Re-upload"}
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={pickFile}
                disabled={busy}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f && !busy) void runPipeline(f);
                }}
                className={cn(
                  "focus-ring flex min-h-[132px] w-full flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-divider bg-cloud/60 p-6 text-center transition-all duration-200 hover:bg-cloud disabled:opacity-60",
                  dragOver &&
                    "border-metric-blue bg-cloud ring-2 ring-metric-blue/30 bg-[radial-gradient(460px_200px_at_50%_10%,rgba(21,145,220,0.10),transparent_70%)]"
                )}
              >
                <IconChip icon={CloudUpload} tone="plum" size={44} />
                <span className="text-sm font-medium text-ink">Upload PDS (CS Form 212)</span>
                <span className="text-xs text-stone">XLSX, PDF, DOCX or image · 2017 & 2026 editions · up to 10 MB</span>
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xlsx,.xls,.xlsm"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void runPipeline(f);
                }}
              />
            </>
          )}
        </div>
      </CollapsibleContent>

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent className="dlg-card-plain">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-semibold leading-[1.1] tracking-[-0.01em] text-ink">Clear all forms and re-upload?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-body-gray">
              This erases ALL of your profile information — personal details, education, work experience, training,
              eligibility, and awards — and marks your profile incomplete again. Your uploaded files stay for HR review.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dlg-ghost min-h-[44px] px-5 py-2.5 text-sm">Keep my data</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void clearProfile();
              }}
              disabled={clearing}
              className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-[var(--bad)]/30 bg-white px-5 py-2.5 text-sm font-medium text-[var(--bad)] transition-colors hover:bg-[var(--bad-bg)] disabled:opacity-50"
            >
              {clearing ? "Clearing…" : "Clear Everything"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Collapsible>
  );
}
