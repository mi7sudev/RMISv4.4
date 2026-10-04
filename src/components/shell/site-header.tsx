"use client";

// ============================================================================
// RMIS — Public header (Bevel "Floating Capsule Navigation", spec §7.1):
// a Paper White rounded-32 capsule bar, frosted (12–20px backdrop blur),
// floating over the page and remaining available as content moves beneath.
// The sticky wrapper is pointer-events-none so the capsule's side gaps never
// create dead zones (the old full-bar takeover is gone); the capsule itself
// is pointer-events-auto. 16px internal control spacing. Brand text =
// Ink 18px/25.2 weight 500 +0.16px tracking (text-brand-nav); secondary
// links = Body Gray 16px/22.4 weight 500 (text-nav); the sign-in/dashboard
// conversion control is the Charcoal Download Pill (dlg-cta, 128px radius).
// All navigation behavior is preserved exactly.
// ============================================================================

import { useSession } from "@/components/session-provider";
import { BrandLogo } from "@/components/brand-logo";
import { navigate, ROLE_HOME, useHashRoute } from "@/lib/router";

export function SiteHeader() {
  const { user } = useSession();
  const { view } = useHashRoute();
  const onSignInView = view === "signin";

  return (
    <header className="pointer-events-none sticky top-0 z-40 px-3 pt-3 sm:px-4 sm:pt-4">
      <nav
        className="glass pointer-events-auto mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between gap-4 rounded-[32px] border border-divider/70 shadow-e1"
        aria-label="Primary"
      >
        {/* Brand — Ink 18px/25.2 weight 500 +0.162px tracking (brand-nav) */}
        <button
          onClick={() => navigate("home")}
          className="flex min-h-[44px] items-center gap-3"
          aria-label="RMIS home"
        >
          {/* Official unified brand mark — DOST pinwheel + MIRDC gear crest
              in a single emblem (see brand-logo). Floats on the capsule. */}
          <BrandLogo logoSize={26} />
          <span className="text-brand-nav hidden font-medium text-ink sm:inline">RMIS</span>
        </button>

        {/* Right cluster — 16px internal control spacing (gap-4) */}
        <div className="flex items-center gap-4">
          {/* QA 2026-02: the page/tab label must match the website slug —
              the board lives at #/vacant-positions as "Vacant Positions". */}
          {/* Secondary links — spec §Floating Capsule Navigation: quiet
              Body Gray 16px/500 text links, not bordered pills. The Sign in
              capsule stays the cluster's single strong control. */}
          {view !== "vacant-positions" && (
            <button
              onClick={() => navigate("vacant-positions")}
              className="text-nav inline-flex min-h-[44px] items-center whitespace-nowrap px-3 font-medium text-body-gray transition-colors hover:text-ink sm:px-4"
            >
              Vacant Positions
            </button>
          )}
          {view !== "contact" && (
            <button
              onClick={() => navigate("contact")}
              className="text-nav hidden min-h-[44px] items-center whitespace-nowrap px-3 font-medium text-body-gray transition-colors hover:text-ink sm:inline-flex sm:px-4"
            >
              Contact
            </button>
          )}

          {user ? (
            <button
              onClick={() => navigate(ROLE_HOME[user.role])}
              className="dlg-cta text-nav inline-flex min-h-[44px] items-center whitespace-nowrap px-5 font-medium"
            >
              Dashboard
            </button>
          ) : (
            !onSignInView && (
              <button
                onClick={() => navigate("signin")}
                className="dlg-cta text-nav inline-flex min-h-[44px] items-center whitespace-nowrap px-5 font-medium"
                aria-label="Sign in to RMIS"
              >
                Sign in
              </button>
            )
          )}
        </div>
      </nav>
    </header>
  );
}

export default SiteHeader;
