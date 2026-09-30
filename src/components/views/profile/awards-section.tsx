"use client";

// ============================================================================
// RMIS — Profile builder · Section 06 Awards (spec §7.4). Entry cards +
// add/edit dialog + confirm delete. Edits are delete + recreate (§6.3).
// Bevel pass: local white section panel (dlg-card-plain) + cloud/60 entry
// tiles + header save indicator + functional destructive styling (--bad);
// all save/delete behavior unchanged.
// ============================================================================

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Trophy, type LucideIcon } from "lucide-react";
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
import { EmptyState, IconChip, type ChipTone } from "@/components/ui/shell";
import { apiFetch, formatDate } from "@/lib/client";
import FormDialog from "./form-dialog";
import { SaveHint, useSavedFlash } from "./save-hint";
import type { AwardRow } from "./section-types";

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

const RECOGNITION_TYPES = ["Award", "Accomplishment"];
const SCOPES = ["Individual", "Group", "Local", "Foreign", "International"];

export default function AwardsSection({
  items,
  onChanged,
}: {
  items: AwardRow[];
  onChanged: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AwardRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [savedFlash, flashSaved] = useSavedFlash();

  const initial = editing
    ? {
        recognitionType: editing.recognitionType ?? "",
        scope: editing.scope ?? "",
        details: editing.details ?? "",
        category: editing.category ?? "",
        provider: editing.provider ?? "",
        dateGranted: editing.dateGranted ?? "",
        points: editing.points ?? "",
      }
    : {};

  const save = async (values: Record<string, unknown>) => {
    setBusy(true);
    try {
      if (editing) await apiFetch(`/api/applicant/awards/${editing.id}`, { method: "DELETE" });
      await apiFetch("/api/applicant/awards", { method: "POST", body: values });
      toast.success(editing ? "Award updated" : "Award added");
      setOpen(false);
      setEditing(null);
      flashSaved();
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to save this entry");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await apiFetch(`/api/applicant/awards/${id}`, { method: "DELETE" });
      toast.success("Award removed");
      setDeleteId(null);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to remove this entry");
    }
  };

  return (
    <SectionPanel
      icon={Trophy}
      chipTone="gold"
      title="Awards"
      description="Non-academic distinctions and accomplishments."
      actions={
        <div className="flex items-center gap-3">
          <SaveHint saving={busy} saved={savedFlash} />
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
            className="dlg-ghost inline-flex min-h-[44px] w-fit items-center gap-2 px-5 py-2.5 text-sm"
          >
            <Plus className="h-4 w-4" /> Add Award
          </button>
        </div>
      }
    >
      {items.length === 0 ? (
        <EmptyState compact icon={Trophy} tone="gold" title="No awards recorded yet" description="Recognition and accomplishments you have received." />
      ) : (
        <div className="space-y-3">
          {items.map((row) => (
            <div key={row.id} className="rounded-lg bg-cloud/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{row.details ?? "—"}</p>
                  <p className="num mt-1 text-sm text-body-gray">
                    {[row.recognitionType, row.scope, row.category, row.provider]
                      .filter(Boolean)
                      .join(" · ")}
                    {row.dateGranted ? ` · ${formatDate(row.dateGranted)}` : ""}
                  </p>
                  {row.points != null && <p className="num mt-0.5 text-xs text-stone">Points: {row.points}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(row);
                      setOpen(true);
                    }}
                    className="focus-ring min-h-[44px] px-3 text-xs font-medium text-stone underline-offset-4 hover:text-ink hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteId(row.id)}
                    aria-label="Delete award"
                    className="focus-ring grid h-9 w-9 place-items-center rounded-full text-stone transition-colors hover:bg-[var(--bad-bg)] hover:text-[var(--bad)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <FormDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setEditing(null);
        }}
        title={editing ? "Edit Award" : "Add Award"}
        busy={busy}
        initial={initial}
        submitLabel={editing ? "Save Entry" : "Add Entry"}
        onSubmit={save}
        fields={[
          {
            key: "recognitionType",
            label: "Recognition Type",
            type: "select",
            options: RECOGNITION_TYPES.map((t) => ({ value: t, label: t })),
          },
          {
            key: "scope",
            label: "Scope",
            type: "select",
            options: SCOPES.map((s) => ({ value: s, label: s })),
          },
          { key: "details", label: "Details", type: "textarea", required: true, placeholder: "What was conferred, and why" },
          { key: "category", label: "Category", type: "text" },
          { key: "provider", label: "Awarding Body", type: "text" },
          { key: "dateGranted", label: "Date Granted", type: "date" },
          { key: "points", label: "Points", type: "number", placeholder: "0" },
        ]}
      />

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="dlg-card-plain">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl text-ink">Remove this award?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-body-gray">
              This permanently removes the entry from your profile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dlg-ghost min-h-[44px] px-5 py-2.5 text-sm">Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (deleteId !== null) void remove(deleteId);
              }}
              className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-[var(--bad)]/30 bg-white px-5 py-2.5 text-sm font-medium text-[var(--bad)] transition-colors hover:bg-[var(--bad-bg)]"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionPanel>
  );
}
