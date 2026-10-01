"use client";

// ============================================================================
// RMIS — Workspace header for the signed-in shell: breadcrumb
// (workspace › current view) + ⌘K search trigger + admin notification center.
// ============================================================================

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import CommandMenu from "@/components/shell/command-menu";
import { NotificationCenter } from "@/components/shell/notifications-panel";
import { useSession } from "@/components/session-provider";
import { humanize } from "@/lib/client";
import type { ViewParams } from "@/lib/router";

const VIEW_LABELS: Record<string, string> = {
  job: "Job Workspace",
  candidate: "Candidate Profile",
  "evaluator-review": "Review",
  jobs: "Positions",
  operations: "Command Center",
  recruitment: "Jobs",
  candidates: "Candidates",
  "review-queue": "Review Queue",
  analytics: "Analytics",
  settings: "Settings",
  home: "My Application",
  profile: "My Profile",
};

export function WorkspaceHeader({
  view,
  params,
}: {
  view: string;
  params?: ViewParams;
}) {
  const { user } = useSession();
  const [cmdOpen, setCmdOpen] = useState(false);

  // ⌘K / Ctrl+K opens the command menu (spec §13).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const label = VIEW_LABELS[view] ?? humanize(view) ?? "Workspace";

  return (
    <div className="w-full">
      <div className="glass sticky top-0 z-30 w-full border-b border-divider/60">
        <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
          {/* Breadcrumb — mobile shows only the current label */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden sm:inline-flex">
                <span className="text-sm text-stone">Workspace</span>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden sm:block" />
              <BreadcrumbItem>
                <BreadcrumbPage className="text-sm font-medium text-ink">{label}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Right cluster */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCmdOpen(true)}
              className="dlg-ghost flex h-9 min-h-[36px] items-center gap-2 px-3.5 text-[13px] text-stone"
              aria-label="Search (Command menu)"
            >
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden rounded-md border border-border bg-fog px-1.5 py-0.5 font-mono text-[10px] font-normal text-pebble sm:inline">
                ⌘K
              </kbd>
            </button>
            {user?.role === "ADMIN" && <NotificationCenter />}
          </div>
        </div>
      </div>

      <CommandMenu open={cmdOpen} onOpenChange={setCmdOpen} />
    </div>
  );
}

export default WorkspaceHeader;
