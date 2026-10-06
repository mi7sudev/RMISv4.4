"use client";

// ============================================================================
// RMIS — Mobile navigation sheet (left drawer): all rail sections, the
// applicant "How hiring works" info circle, account block, sign out.
// Triggered from the mobile top bar in AppShell. The bottom stack mirrors
// the desktop rail: journey circle → divider line → user profile card.
// ============================================================================

import { useState } from "react";
import { LogOut, Menu } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NAV_CONFIG, displayNameOf, initialsOf, performSignOut } from "@/components/shell/nav-rail";
import { RailJourneyInfo } from "@/components/shell/rail-journey-info";
import { BrandLogo } from "@/components/brand-logo";
import { useSession } from "@/components/session-provider";
import { navigate, ROLE_HOME } from "@/lib/router";

export function MobileNav({ view }: { view: string }) {
  const { user } = useSession();
  const [open, setOpen] = useState(false);

  if (!user) return null;
  const groups = NAV_CONFIG[user.role] ?? [];
  const go = (target: string) => {
    setOpen(false);
    navigate(target);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink transition-colors hover:bg-[var(--rail-hover-bg)]"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(300px,85vw)] rounded-none bg-white p-0 sm:w-[340px]">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SheetDescription className="sr-only">Workspace sections and account</SheetDescription>
        <div className="flex h-full flex-col">
          {/* Brand */}
          <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4">
            <button
              onClick={() => go(ROLE_HOME[user.role])}
              className="flex min-h-[44px] items-center gap-3"
            >
              <BrandLogo logoSize={26} />
              <span className="text-brand-nav font-medium text-ink">RMIS</span>
            </button>
          </div>

          {/* Sections */}
          <nav className="flex-1 space-y-5 overflow-y-auto scroll-thin px-3 py-4" aria-label="Workspace">
            {groups.map((g) => (
              <div key={g.group}>
                <p className="eyebrow mb-1.5 px-3 text-pebble">{g.group}</p>
                <ul className="space-y-1">
                  {g.items.map((item) => {
                    const active = item.view === view;
                    return (
                      <li key={item.view}>
                        <button
                          onClick={() => go(item.view)}
                          aria-current={active ? "page" : undefined}
                          className={`flex min-h-[44px] w-full items-center gap-3 rounded-full px-3.5 text-sm transition-colors ${
                            active ? "bg-cloud font-medium text-ink" : "text-stone hover:bg-fog hover:text-ink"
                          }`}
                        >
                          <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                          <span className="truncate">{item.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          {/* APPLICANT drawer: the "How hiring works" circle sits above the
              bottom divider — same circle → line → profile-card stack as the
              desktop rail. Disc flush with the account avatar below it. */}
          {user.role === "APPLICANT" && (
            <div className="shrink-0 px-4 pb-1.5">
              <RailJourneyInfo variant="drawer" />
            </div>
          )}

          {/* Account block */}
          <div className="shrink-0 space-y-3 border-t border-border p-4">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                {initialsOf(user)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{displayNameOf(user)}</p>
                <p className="truncate text-xs text-pebble">{user.email}</p>
              </div>
            </div>
            <button
              onClick={performSignOut}
              className="dlg-ghost flex min-h-[44px] w-full items-center justify-center gap-2 px-5 text-sm text-dusty-rose"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default MobileNav;
