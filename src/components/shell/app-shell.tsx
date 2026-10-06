"use client";

// ============================================================================
// RMIS — Application shells (spec §13): AppShell for signed-in users
// (NavRail + mobile top bar + WorkspaceHeader + main + Footer) and
// PublicShell for the anonymous jobs board (SiteHeader + main + Footer).
// Sticky-footer rule: root is min-h-screen flex flex-col; main is flex-1;
// footer sits at mt-auto.
// ============================================================================

import { useSession } from "@/components/session-provider";
import { BrandLogo } from "@/components/brand-logo";
import { MobileNav } from "@/components/shell/mobile-nav";
import { NavRail } from "@/components/shell/nav-rail";
import { WorkspaceHeader } from "@/components/shell/workspace-header";
import { Footer } from "@/components/shell/footer";
import { SiteHeader } from "@/components/shell/site-header";
import { navigate, ROLE_HOME } from "@/lib/router";
import type { ViewParams } from "@/lib/router";

export function AppShell({
  view,
  params,
  children,
}: {
  view: string;
  params: ViewParams;
  children: React.ReactNode;
}) {
  const { user } = useSession();

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex flex-1 items-stretch">
        {/* Desktop left rail (lg+) */}
        <NavRail view={view} />

        {/* Content column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile top bar with sheet menu — light rail strip. Composed
              inline instead of the .rail class: a horizontal bar takes a
              bottom hairline, not the rail's right-side border. */}
          <div className="sticky top-0 z-40 flex h-16 items-center gap-1.5 border-b border-[var(--rail-border)] bg-[linear-gradient(180deg,var(--rail-bg-top)_0%,var(--rail-bg-bottom)_100%)] px-3 text-[var(--rail-text)] sm:px-4 lg:hidden">
            <MobileNav view={view} />
            <button
              onClick={() => {
                if (user) navigate(ROLE_HOME[user.role]);
              }}
              className="flex min-h-[44px] items-center gap-2.5"
              aria-label="Go to my workspace"
            >
              {/* Official unified brand mark — transparent art, so it floats
                  directly on the light rail strip. */}
              <BrandLogo logoSize={22} tone="light" />
              <span className="text-sm font-semibold text-ink">RMIS</span>
            </button>
          </div>

          <WorkspaceHeader view={view} params={params} />

          <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
            {/* Keyed by view so each navigation replays the subtle mount
                transition (tw-animate-css) — one place for every workspace view. */}
            <div key={view} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              {children}
            </div>
          </main>

          <Footer />
        </div>
      </div>
    </div>
  );
}

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      {/* flex-col so full-bleed children (auth split-screen) can flex-1 to the
          viewport between the sticky header and the sticky footer. */}
      <main className="flex w-full flex-1 flex-col">{children}</main>
      <Footer />
    </div>
  );
}

export default AppShell;
