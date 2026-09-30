"use client";

// ============================================================================
// RMIS — Profile builder · Section 07 Supporting Documents (spec §7.4, §10).
// Storage-only by design (no extraction here). A category is REQUIRED before
// any upload; multi-file batch upload posts sequentially with per-file
// toasts; rows show name / size / category / date (+ status pill for
// extractable categories, extraction error via tooltip) with single and
// checkbox batch delete.
// Bevel pass: local white section panel, cloud/60 tiles, StatusPill document
// statuses, .num metrics, functional --bad destructive styling. All behavior
// unchanged.
// ============================================================================

import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, FileUp, Loader2, Paperclip, Trash2, type LucideIcon } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, IconChip, StatusPill, type ChipTone } from "@/components/ui/shell";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { apiFetch, formatDate, humanize } from "@/lib/client";
import { DOCUMENT_CATEGORIES, EXTRACTABLE_CATEGORIES } from "@/lib/validation";
import type { DocumentWire } from "@/lib/router";
import { SaveHint, useSavedFlash } from "./save-hint";
import type { StatusVariant } from "@/lib/status-ui";

/**
 * Bevel section panel (shared workspace layout system): white surface, 24px,
 * icon-chip heading row with a body-gray caption — local stand-in for the
 * old-theme ui/shell SectionCard.
 */
function SectionPanel({
  icon,
  chipTone,
  title,
  description,
  actions,
  children,
}: {
  icon: LucideIcon;
  chipTone: ChipTone;
  title: string;
  description: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="dlg-card-plain min-w-0 p-5 sm:p-6" aria-label={title}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <IconChip icon={icon} tone={chipTone} size={36} iconSize={16} />
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold tracking-[-0.01em] text-ink sm:text-lg">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-body-gray">{description}</p>}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div>{children}</div>
    </section>
  );
}

const CATEGORY_NONE = "__select__";
const EXTRACTABLE = EXTRACTABLE_CATEGORIES as readonly string[];

/** File extension → short uppercase label for the slate mini chip (display-only). */
function fileKind(name: string): string {
  const ext = name.includes(".") ? (name.split(".").pop() ?? "") : "";
  const labels: Record<string, string> = {
    pdf: "PDF",
    xlsx: "XLSX",
    xls: "XLS",
    xlsm: "XLSM",
    doc: "DOC",
    docx: "DOCX",
    png: "IMG",
    jpg: "IMG",
    jpeg: "IMG",
    gif: "IMG",
    webp: "IMG",
  };
  const key = ext.toLowerCase();
  if (labels[key]) return labels[key];
  return ext ? ext.toUpperCase().slice(0, 4) : "FILE";
}

/** Document extraction status → label + functional variant (§2 status system). */
function statusChip(doc: DocumentWire): { label: string; variant: StatusVariant } | null {
  if (!EXTRACTABLE.includes(doc.category)) return null;
  switch (doc.status) {
    case "EXTRACTED":
      return { label: "Extracted", variant: "ok" };
    case "PARTIALLY_EXTRACTED":
      return { label: "Partial", variant: "warn" };
    case "FAILED":
      return { label: "Failed", variant: "bad" };
    case "PROCESSING":
      return { label: "Processing", variant: "neutral" };
    default:
      return { label: "Uploaded", variant: "neutral" };
  }
}

export default function DocumentsSection({
  docs,
  onChanged,
}: {
  docs: DocumentWire[];
  onChanged: () => void | Promise<void>;
}) {
  const [category, setCategory] = useState("");
  const [categoryError, setCategoryError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTargets, setDeleteTargets] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [savedFlash, flashSaved] = useSavedFlash();
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFiles = async (files: FileList) => {
    if (!category) {
      setCategoryError(true);
      toast.error("Select a category before uploading");
      inputRef.current?.blur();
      return;
    }
    setCategoryError(false);
    setUploading(true);
    let okCount = 0;
    for (const file of Array.from(files)) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("category", category);
        await apiFetch("/api/applicant/documents", { method: "POST", formData: fd });
        toast.success(`${file.name} uploaded`);
        okCount += 1;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `${file.name} could not be uploaded`);
      }
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    if (okCount > 0) {
      flashSaved();
      await onChanged();
    }
  };

  const runDelete = async (ids: string[]) => {
    setDeleting(true);
    let okCount = 0;
    for (const id of ids) {
      try {
        await apiFetch(`/api/applicant/documents/${id}`, { method: "DELETE" });
        okCount += 1;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "A document could not be deleted");
      }
    }
    setDeleting(false);
    setDeleteTargets(null);
    setSelected(new Set());
    if (okCount > 0) {
      toast.success(okCount === 1 ? "Document deleted" : `${okCount} documents deleted`);
      await onChanged();
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <SectionPanel
      icon={FileText}
      chipTone="slate"
      title="Supporting Documents"
      description="Credentials for HR verification — stored as-is. PDS extraction lives at the top of this page."
      actions={<SaveHint saving={uploading} saved={savedFlash} />}
    >
      {/* Upload rail — category REQUIRED before any file is accepted (§7.4) */}
      <div className="rounded-lg bg-cloud/60 p-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)] sm:items-end">
          <div>
            <p className="mb-1.5 text-xs font-medium text-stone">
              Category<span className="text-[var(--bad)]"> *</span>
            </p>
            <Select
              value={category !== "" ? category : CATEGORY_NONE}
              onValueChange={(v) => {
                setCategory(v === CATEGORY_NONE ? "" : v);
                setCategoryError(false);
              }}
              disabled={uploading}
            >
              <SelectTrigger
                className={`dlg-input min-h-[44px] w-full bg-white ${categoryError ? "ring-1 ring-inset ring-[var(--bad)]" : ""}`}
              >
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent className="z-[60]">
                {DOCUMENT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {humanize(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {categoryError && <p className="mt-1 text-xs text-[var(--bad)]">Choose a category first.</p>}
          </div>
          <button
            type="button"
            onClick={() => {
              if (!category) {
                setCategoryError(true);
                toast.error("Select a category before uploading");
                return;
              }
              inputRef.current?.click();
            }}
            disabled={uploading}
            className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-dashed px-5 py-3 text-sm font-medium transition-colors ${
              categoryError
                ? "border-[var(--bad)]/40 bg-white text-[var(--bad)]"
                : "border-divider bg-white text-ink hover:bg-[radial-gradient(420px_160px_at_50%_0%,rgba(65,94,238,0.055),transparent_70%)]"
            } disabled:opacity-50`}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            {uploading ? "Uploading…" : "Choose files to upload"}
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length > 0) void uploadFiles(files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Batch action bar */}
      {selected.size > 0 && (
        <div className="mt-4 flex items-center justify-between rounded-lg bg-cloud/60 px-4 py-2">
          <span className="num text-xs text-stone">{selected.size} selected</span>
          <button
            type="button"
            onClick={() => setDeleteTargets([...selected])}
            disabled={deleting}
            className="focus-ring inline-flex min-h-[44px] items-center gap-2 px-4 text-sm font-medium text-[var(--bad)] disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" /> Delete selected
          </button>
        </div>
      )}

      {/* File rows */}
      {docs.length === 0 ? (
        <EmptyState compact icon={Paperclip} tone="slate" title="No documents on file yet" description="Upload credentials HR will need for verification." className="mt-4" />
      ) : (
        <TooltipProvider delayDuration={150}>
          {/* No inner max-height below lg: the section column is already a
              bounded scroller — a nested scroll pane traps touch gestures
              on phones. The cap returns on lg where the column is roomy. */}
          <div className="mt-4 space-y-2 overflow-y-auto scroll-thin pr-1 lg:max-h-96">
            {docs.map((doc) => {
              const chip = statusChip(doc);
              return (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 rounded-lg bg-cloud/60 px-3 py-2.5 transition-colors hover:bg-cloud"
                >
                  <Checkbox
                    checked={selected.has(doc.id)}
                    onCheckedChange={() => toggle(doc.id)}
                    aria-label={`Select ${doc.originalName}`}
                    className="shrink-0"
                  />
                  <span className="chip chip-slate h-6 shrink-0 px-2 text-[10px] font-semibold tracking-wide" aria-hidden="true">
                    {fileKind(doc.originalName)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink" title={doc.originalName}>
                      {doc.originalName}
                    </p>
                    <p className="num text-xs text-stone">
                      {humanize(doc.category)} · {Math.max(1, Math.round(doc.size / 1024))} KB · {formatDate(doc.createdAt)}
                    </p>
                  </div>
                  {chip && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <StatusPill status={chip.label} variant={chip.variant} className="shrink-0 cursor-default" />
                      </TooltipTrigger>
                      {doc.extractionError && (
                        <TooltipContent className="max-w-xs text-xs">{doc.extractionError}</TooltipContent>
                      )}
                    </Tooltip>
                  )}
                  <button
                    type="button"
                    onClick={() => setDeleteTargets([doc.id])}
                    aria-label={`Delete ${doc.originalName}`}
                    className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-full text-stone transition-colors hover:bg-[var(--bad-bg)] hover:text-[var(--bad)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </TooltipProvider>
      )}

      <AlertDialog open={deleteTargets !== null} onOpenChange={(o) => !o && setDeleteTargets(null)}>
        <AlertDialogContent className="dlg-card-plain">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl text-ink">
              {deleteTargets !== null && deleteTargets.length > 1 ? `Delete ${deleteTargets.length} documents?` : "Delete this document?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-body-gray">
              The file will be permanently removed from your records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dlg-ghost min-h-[44px] px-5 py-2.5 text-sm">Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (deleteTargets) void runDelete(deleteTargets);
              }}
              disabled={deleting}
              className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-[var(--bad)]/30 bg-white px-5 py-2.5 text-sm font-medium text-[var(--bad)] transition-colors hover:bg-[var(--bad-bg)] disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionPanel>
  );
}
