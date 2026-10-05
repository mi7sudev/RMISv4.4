"use client";

// ============================================================================
// RMIS — Desktop left navigation rail (spec §13 view registry, §7.10 nav
// config). PREMIUM DARK RAIL (Linear/Notion pattern): deep-ink gradient,
// glass hover states, glowing active pill, blue brand mark. LABELED w-64 by
// default; the collapse toggle sits in the brand row next to "MIRDC
// Recruitment" (persisted in localStorage "rmis.rail-expanded"). When
// collapsed to the w-16 icon-only rail there is NO expand button — clicking
// anywhere on the rail (brand plate or empty chrome) expands it instead.
// Bottom: user dropdown with sign out.
// ============================================================================

import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  Briefcase,
  ChartColumn,
  Gauge,
  House,
  LogOut,
  PanelLeftClose,
  ScanSearch,
  Settings2,
  UserRound,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { RailJourneyCard } from "@/components/shell/rail-journey-card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSession } from "@/components/session-provider";
import { navigate, ROLE_HOME } from "@/lib/router";
import type { Role, SessionUser } from "@/lib/router";

// ── Navigation config (per role) ────────────────────────────────────────────

export type NavItem = { view: string; label: string; icon: LucideIcon };
export type NavGroup = { group: string; items: NavItem[] };

export const NAV_CONFIG: Record<Role, NavGroup[]> = {
  ADMIN: [
    {
      group: "Operations",
      items: [{ view: "operations", label: "Command Center", icon: Gauge }],
    },
    {
      group: "Recruitment",
      items: [
        { view: "recruitment", label: "Jobs", icon: Briefcase },
        // QA 2026-02: renamed from "Candidates" — this screen lists ALL
        // registered system users, not just applied candidates.
        { view: "candidates", label: "Users", icon: UsersRound },
        { view: "review-queue", label: "Review", icon: ScanSearch },
      ],
    },
    {
      group: "Insights",
      items: [{ view: "analytics", label: "Analytics", icon: ChartColumn }],
    },
    {
      group: "Administration",
      items: [{ view: "settings", label: "Settings", icon: Settings2 }],
    },
  ],
  EVALUATOR: [
    {
      group: "My Work",
      items: [{ view: "review-queue", label: "Review Queue", icon: ScanSearch }],
    },
    {
      group: "Browse",
      items: [
        { view: "candidates", label: "Candidates", icon: UsersRound },
        { view: "recruitment", label: "Jobs", icon: Briefcase },
      ],
    },
    {
      group: "Insights",
      // QA 2026-02: evaluators see recruitment-related analytics only.
      items: [{ view: "analytics", label: "Analytics", icon: ChartColumn }],
    },
    {
      group: "Configuration",
      // QA 2026-02: Email Notices + Contact Requests for evaluators.
      items: [{ view: "settings", label: "Settings", icon: Settings2 }],
    },
  ],
  APPLICANT: [
    { group: "Portal", items: [{ view: "home", label: "Home", icon: House }] },
    { group: "Account", items: [{ view: "profile", label: "Profile", icon: UserRound }] },
  ],
};

/** Detail views highlight their parent rail section. */
const PARENT_VIEW: Record<string, string> = {
  job: "recruitment",
  candidate: "candidates",
  "evaluator-review": "review-queue",
};

// ── Shared helpers ──────────────────────────────────────────────────────────

export function performSignOut() {
  // Fire-and-forget audit/logout (spec §3.5) — never blocks navigation.
  void fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
  navigate("signin");
  window.location.reload();
}

export function initialsOf(user: SessionUser): string {
  const a = user.firstName?.[0] ?? "";
  const b = user.lastName?.[0] ?? "";
  const s = `${a}${b}` || user.username?.slice(0, 2) || user.email?.slice(0, 2) || "?";
  return s.toUpperCase();
}

export function displayNameOf(user: SessionUser): string {
  return (
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.username ||
    user.email ||
    "Account"
  );
}

// ── NavRail ─────────────────────────────────────────────────────────────────

export function NavRail({ view }: { view: string }) {
  const { user } = useSession();
  // Enterprise default: labeled rail. localStorage "0" opts out.
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    try {
      setExpanded(window.localStorage.getItem("rmis.rail-expanded") !== "0");
    } catch {
      /* storage unavailable */
    }
  }, []);

  const toggleExpanded = () => {
    setExpanded((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("rmis.rail-expanded", next ? "1" : "0");
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  };

  // Collapsed rail: clicking anywhere on the rail chrome expands it. Clicks
  // that land on a real control (nav icon buttons, account menu) keep their
  // own behavior — only "empty" chrome expands the rail. The brand plate
  // button handles its own collapsed-state expand below.
  const handleRailClick = (e: ReactMouseEvent<HTMLElement>) => {
    if (expanded) return;
    if ((e.target as HTMLElement).closest("button, a, [role='button']")) return;
    toggleExpanded();
  };

  if (!user) return null;
  const groups = NAV_CONFIG[user.role] ?? [];
  const activeKey = PARENT_VIEW[view] ?? view;

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        onClick={handleRailClick}
        className={`rail sticky top-0 hidden h-dvh shrink-0 flex-col text-[var(--rail-text)] transition-[width] duration-200 lg:flex ${
          expanded ? "w-64" : "w-16 cursor-pointer"
        }`}
      >
        {/* Keyboard path for the click-to-expand rail — there is intentionally
            no VISIBLE expand button when collapsed. */}
        {!expanded && (
          <button type="button" onClick={toggleExpanded} className="sr-only">
            Expand navigation
          </button>
        )}
        {/* Brand → role home when expanded; when collapsed the brand plate is
            the rail's most prominent affordance, so it expands the rail. */}
        <div className={`flex h-16 shrink-0 items-center gap-1 ${expanded ? "px-3" : "justify-center"}`}>
          <button
            onClick={() => (expanded ? navigate(ROLE_HOME[user.role]) : toggleExpanded())}
            className={`flex min-h-[44px] items-center gap-3 ${expanded ? "min-w-0 flex-1" : ""}`}
            aria-label={expanded ? "Go to my workspace" : "Expand navigation"}
          >
            {/* Official unified brand mark — see brand-logo. */}
            {expanded ? (
              <BrandLogo logoSize={22} tone="light" />
            ) : (
              <BrandLogo logoSize={16} tone="light" />
            )}
            {expanded && (
              <span className="min-w-0 text-left">
                <span className="text-brand-nav block truncate font-medium text-ink">RMIS</span>
              </span>
            )}
          </button>
          {/* Collapse toggle lives next to the brand title (moved from the
              bottom bar) so the expanded rail closes from where it opens. */}
          {expanded && (
            <button
              onClick={toggleExpanded}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--rail-text-dim)] transition-colors hover:bg-[var(--rail-hover-bg)] hover:text-ink"
              aria-label="Collapse navigation"
              title="Collapse navigation"
            >
              <PanelLeftClose className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Sections — groups first, then the applicant journey infographic
            pinned to the foot of the scroll area (mt-auto; it scrolls away
            gracefully on short viewports and hides when the rail collapses). */}
        <nav
          className="flex flex-1 flex-col overflow-y-auto scroll-thin px-2.5 py-4"
          aria-label="Workspace"
        >
          <div className="space-y-6">
            {groups.map((g) => (
            <div key={g.group}>
              {expanded ? (
                <p className="eyebrow mb-2 px-3 text-[var(--rail-text-dim)]">{g.group}</p>
              ) : (
                <div className="mx-auto mb-2 h-px w-6 bg-[var(--rail-border)]" aria-hidden="true" />
              )}
              <ul className="space-y-1">
                {g.items.map((item) => {
                  const active = item.view === activeKey;
                  const button = (
                    <button
                      onClick={() => navigate(item.view)}
                      aria-current={active ? "page" : undefined}
                      className={`group relative flex min-h-[44px] w-full items-center gap-3 rounded-full text-sm transition-all duration-150 ${
                        expanded ? "px-3.5" : "justify-center px-0"
                      } ${
                        active
                          ? "bg-[var(--rail-active-bg)] font-medium text-ink"
                          : "text-[var(--rail-text)] hover:bg-[var(--rail-hover-bg)] hover:text-ink"
                      }`}
                    >
                      {/* Brand-blue active indicator — small legacy-RMIS accent */}
                      <span
                        aria-hidden="true"
                        className={`absolute -left-2.5 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full transition-opacity duration-200 ${
                          active ? "opacity-100" : "opacity-0"
                        }`}
                        style={{ background: "var(--primary)" }}
                      />
                      <item.icon
                        className={`h-[18px] w-[18px] shrink-0 transition-colors ${
                          active
                            ? "text-ink"
                            : "text-[var(--rail-text-dim)] group-hover:text-ink"
                        }`}
                        aria-hidden="true"
                      />
                      {expanded && <span className="truncate">{item.label}</span>}
                    </button>
                  );
                  return (
                    <li key={item.view}>
                      {expanded ? (
                        button
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>{button}</TooltipTrigger>
                          <TooltipContent side="right" className="rounded-lg bg-ink text-xs text-white">
                            {item.label}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
            ))}
          </div>

          {user.role === "APPLICANT" && expanded && <RailJourneyCard />}
        </nav>

        {/* Bottom: user dropdown (the collapse toggle lives in the brand row) */}
        <div className="shrink-0 p-2.5" style={{ borderTop: "1px solid var(--rail-border)" }}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`flex min-h-[44px] w-full items-center gap-3 rounded-full text-left transition-colors hover:bg-[var(--rail-hover-bg)] ${
                  expanded ? "px-2" : "justify-center px-0"
                }`}
                aria-label="Account menu"
              >
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-primary-foreground"
                  style={{ background: "var(--primary)" }}
                >
                  {initialsOf(user)}
                </span>
                {expanded && (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">
                      {displayNameOf(user)}
                    </span>
                    <span className="block truncate text-xs text-[var(--rail-text-dim)]">{user.role}</span>
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-64 rounded-2xl">
              <DropdownMenuLabel>
                <span className="block truncate text-sm font-medium text-ink">
                  {displayNameOf(user)}
                </span>
                <span className="block truncate text-xs text-pebble">{user.email}</span>
                <span className="dlg-pill mt-1.5 inline-flex bg-fog px-2.5 py-0.5 text-[11px] font-medium text-graphite">
                  {user.role}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={performSignOut}
                className="cursor-pointer gap-2 text-[var(--bad)] focus:text-[var(--bad)]"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </TooltipProvider>
  );
}

export default NavRail;
