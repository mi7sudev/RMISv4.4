"use client";

// ============================================================================
// RMIS — Public header (spec §7.1): full-width sticky enterprise bar anchored
// to the top edge — hairline bottom border, frosted glass, brand mark left;
// Positions link + primary sign-in affordance right.
// Presentation pass v2 (user feedback):
//   • Floating "top-4 glass card" replaced with a top-0 full-width bar so page
//     content can never poke through the side gaps (the reported overlap).
//   • "Sign up" removed from the nav — "Sign in" is now the single orange CTA
//     (hidden while already on the sign-in view to avoid a dead control).
//   • Container widened to the system-wide 1600px grid (wide-screen fix).
// Presentation pass v3 (Executive Ink): nav links became quiet capsule text
//   buttons (fog hover) and "Sign in" / "Dashboard" the charcoal dlg-cta —
//   one loud control per bar. All navigation behavior is preserved exactly.
// ============================================================================

import { useSession } from "@/components/session-provider";
import { BrandLogo } from "@/components/brand-logo";
import { navigate, ROLE_HOME, useHashRoute } from "@/lib/router";

export function SiteHeader() {
  const { user } = useSession();
  const { view } = useHashRoute();
  const onSignInView = view === "signin";

  return (
    <header className="glass sticky top-0 z-40 border-b border-divider/70 shadow-e1">
      <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <button
          onClick={() => navigate("home")}
          className="flex min-h-[44px] items-center gap-3"
          aria-label="RMIS home"
        >
          {/* Official two-logo lockup — DOST seal + MIRDC emblem. The emblems'
              art carries transparent backgrounds and floats on the header. */}
          <BrandLogo logoSize={26} />
          <span
            className="hidden text-sm font-semibold tracking-[-0.01em] text-ink sm:inline"
          >
            RMIS
          </span>
        </button>

        {/* Right cluster */}
        <nav className="flex items-center gap-2" aria-label="Primary">
          {/* QA 2026-02: the page/tab label must match the website slug —
              the board lives at #/vacant-positions as "Vacant Positions". */}
          {view !== "vacant-positions" && (
            <button
              onClick={() => navigate("vacant-positions")}
              className="inline-flex min-h-[44px] items-center rounded-full px-3 py-2 text-[13.5px] font-medium text-stone transition-colors hover:bg-fog hover:text-ink sm:px-4"
            >
              Vacant Positions
            </button>
          )}
          {view !== "contact" && (
            <button
              onClick={() => navigate("contact")}
              className="hidden min-h-[44px] items-center rounded-full px-3 py-2 text-[13.5px] font-medium text-stone transition-colors hover:bg-fog hover:text-ink sm:inline-flex sm:px-4"
            >
              Contact
            </button>
          )}

          {user ? (
            <button
              onClick={() => navigate(ROLE_HOME[user.role])}
              className="dlg-cta inline-flex h-9 items-center whitespace-nowrap px-5 text-[13.5px]"
            >
              Dashboard
            </button>
          ) : (
            !onSignInView && (
              <button
                onClick={() => navigate("signin")}
                className="dlg-cta inline-flex h-9 items-center whitespace-nowrap px-5 text-[13.5px]"
                aria-label="Sign in to RMIS"
              >
                Sign in
              </button>
            )
          )}
        </nav>
      </div>
    </header>
  );
}

export default SiteHeader;
