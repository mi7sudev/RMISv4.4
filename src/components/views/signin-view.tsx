"use client";

// ============================================================================
// RMIS — Sign-in view (spec §3.3, §7.3): identifier (email or username) +
// password, demo account chips, welcome toast → session refresh → role home.
// Bevel pass: lg+ split screen with a LIGHT brand panel (Hero Sky gradient,
// ink display heading, white trust tiles) on the left and an editorial form
// directly on the white canvas on the right. Rendered inside PublicShell
// (sticky header + footer), so the root flexes to fill the viewport between
// them. All handlers, API calls, and copy are preserved exactly.
// ============================================================================

import { useState } from "react";
import type { FormEvent } from "react";
import { Activity, Check, FileSpreadsheet, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { BrandLogo } from "@/components/brand-logo";
import { IconChip } from "@/components/ui/shell";
import type { ChipTone } from "@/components/ui/shell";
import { useSession } from "@/components/session-provider";
import { apiFetch } from "@/lib/client";
import { navigate, ROLE_HOME } from "@/lib/router";
import { cn } from "@/lib/utils";

const DEMO_ACCOUNTS = ["testadmin", "testevaluator", "testapplicant"] as const;

const TRUST_POINTS: ReadonlyArray<{ icon: LucideIcon; tone: ChipTone; text: string }> = [
  { icon: FileSpreadsheet, tone: "amber", text: "PDS auto-fill" },
  { icon: Activity, tone: "emerald", text: "Real-time status tracking" },
  { icon: ShieldCheck, tone: "plum", text: "Data Privacy Act compliant" },
];

/** Light brand panel — lg+ only. Hero Sky gradient with ink display type;
 *  the watermark is decorative and pointer-events-none. */
function AuthBrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden bg-[linear-gradient(180deg,#d2e5ff,#fff9ee)] lg:flex lg:w-[42%] xl:w-[46%]">
      {/* Ink watermark (decorative) */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-[130px] -right-8 select-none font-display text-[400px] leading-none text-ink/[0.05]"
      >
        M
      </span>

      <div className="relative z-10 flex w-full max-w-md flex-col justify-center px-12 py-16 xl:pl-20 xl:pr-16">
        <div className="inline-flex w-fit items-center gap-3 rounded-full bg-white py-2 pl-2 pr-4 shadow-e1">
          {/* Official two-logo lockup — the emblems' art carries transparent
              backgrounds, so it floats directly on the white capsule. */}
          <BrandLogo logoSize={22} />
          <span className="text-sm font-semibold text-ink">RMIS</span>
        </div>

        <h1 className="mt-10 font-display text-[clamp(30px,2.6vw,38px)] leading-[1.18] text-ink">
          Build a career that moves the nation forward.
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-body-gray">
          The official hiring portal of the Metals Industry Research and Development Center.
        </p>

        <ul className="mt-10 space-y-3">
          {TRUST_POINTS.map((point) => (
            <li
              key={point.text}
              className="flex items-center gap-3.5 rounded-xl bg-white p-3.5 shadow-e1"
            >
              <IconChip icon={point.icon} tone={point.tone} size={36} iconSize={16} />
              <span className="text-[13px] font-medium text-ink">{point.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

export default function SignInView() {
  const { refresh } = useSession();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!identifier.trim()) {
      toast.error("Enter your email or username");
      return;
    }
    if (!password) {
      toast.error("Enter your password");
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/auth/login", {
        method: "POST",
        body: { identifier: identifier.trim(), password },
      });
      toast.success("Welcome to RMIS");
      const user = await refresh();
      navigate(user ? ROLE_HOME[user.role] : "jobs");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex w-full flex-1 flex-col lg:flex-row">
      <AuthBrandPanel />

      {/* Form column — editorial form directly on the white canvas */}
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 sm:py-12">
        <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div>
            {/* Card header — mobile/tablet only; the lg+ brand panel carries brand + heading */}
            <div className="lg:hidden">
              <h2 className="text-center font-display text-3xl text-ink">Welcome back</h2>
            </div>
            <p className="mt-2 text-center text-sm text-body-gray lg:mt-0 lg:text-left">
              Sign in with your email or username to continue.
            </p>

            <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
              <div>
                <label htmlFor="identifier" className="mb-1.5 block text-sm font-medium text-ink">
                  Email or username
                </label>
                <Input
                  id="identifier"
                  name="identifier"
                  autoComplete="username"
                  placeholder="you@example.gov.ph"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="dlg-input min-h-[44px]"
                />
              </div>
              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-ink">
                  Password
                </label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="dlg-input min-h-[44px]"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="dlg-cta min-h-[44px] w-full text-sm font-medium disabled:opacity-50"
              >
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </form>

            {/* Demo accounts — capsule quick-fill chips (charcoal when active) */}
            <div className="mt-6 border-t border-border pt-5">
              <p className="text-xs font-medium uppercase tracking-wider text-stone">Demo accounts</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {DEMO_ACCOUNTS.map((name) => {
                  const selected = identifier === name && password === "password123";
                  return (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setIdentifier(name);
                        setPassword("password123");
                      }}
                      className={cn(
                        "inline-flex min-h-[44px] items-center gap-1.5 px-4 text-xs font-medium transition-all duration-150",
                        selected ? "dlg-cta" : "dlg-ghost"
                      )}
                    >
                      {selected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                      {name}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-stone">
                password123 · staff accounts are restricted to the MIRDC intranet; applicants can
                sign in from any network.
              </p>
            </div>
          </div>

          {/* Links */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <button
              onClick={() => navigate("signup")}
              className="min-h-[44px] text-sm text-metric-blue underline underline-offset-2 transition-colors hover:text-ink"
            >
              Create an account
            </button>
            <button
              onClick={() => navigate("jobs")}
              className="min-h-[44px] text-sm text-metric-blue underline underline-offset-2 transition-colors hover:text-ink"
            >
              Back to positions
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
