"use client";

// ============================================================================
// RMIS — Sign-in view (spec §3.3, §7.3): identifier (email or username) +
// password, demo account chips, welcome toast → session refresh → role home.
// Gate-aware Turnstile: the widget only mounts when GET /api/auth/captcha
// says this request arrived on the public applicant door — it renders
// invisibly (interaction-only) and auto-clears humans; the token rides along
// in the login payload. On the employee door the form is captcha-free.
// Bevel pass: lg+ split screen with a LIGHT brand panel (Hero Sky gradient,
// ink display heading, white trust tiles) on the left and an editorial form
// directly on the white canvas on the right. Rendered inside PublicShell
// (sticky header + footer), so the root flexes to fill the viewport between
// them. All handlers, API calls, and copy are preserved exactly.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Activity, Check, FileSpreadsheet, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Turnstile } from "@/components/turnstile";
import type { TurnstileHandle } from "@/components/turnstile";
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

        {/* QA 2026-02: spell out the acronym in full — the system name is
            "Recruitment Management Information System", not "Recruitment portal". */}
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-body-gray">
          Recruitment Management Information System
        </p>

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

type CaptchaConfig = { enabled: boolean; siteKey: string | null };

export default function SignInView() {
  const { refresh } = useSession();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [captcha, setCaptcha] = useState<CaptchaConfig>({ enabled: false, siteKey: null });
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle | null>(null);

  // QA 2026-02 — Forgot password (applicants, evaluators, administrators).
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);

  const submitForgot = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      toast.error("Enter the email on your account");
      return;
    }
    setForgotBusy(true);
    try {
      const res = await apiFetch<{ message: string }>("/api/auth/forgot-password", {
        method: "POST",
        body: { email: forgotEmail.trim() },
      });
      toast.success("Check your inbox", { description: res.message });
      setForgotOpen(false);
      setForgotEmail("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the reset email");
    } finally {
      setForgotBusy(false);
    }
  };

  // Gate-aware captcha: ask the server which door we are on. If the config
  // fetch fails the widget simply stays off — the login endpoint re-checks
  // the gate server-side and will 403 with a clear message if one is needed.
  useEffect(() => {
    let cancelled = false;
    apiFetch<CaptchaConfig>("/api/auth/captcha")
      .then((cfg) => {
        if (!cancelled) setCaptcha(cfg);
      })
      .catch(() => {
        /* widget stays off; server-side chokepoint still applies */
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
        body: { identifier: identifier.trim(), password, captchaToken },
      });
      toast.success("Welcome to RMIS");
      const user = await refresh();
      navigate(user ? ROLE_HOME[user.role] : "jobs");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed. Please try again.");
      // Tokens are single-use — mint a fresh one for the next attempt.
      setCaptchaToken(null);
      turnstileRef.current?.reset();
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
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label htmlFor="password" className="block text-sm font-medium text-ink">
                    Password
                  </label>
                  {/* QA 2026-02: forgot-password option for applicants,
                      evaluators, and administrators. */}
                  <button
                    type="button"
                    onClick={() => setForgotOpen(true)}
                    className="min-h-[44px] text-sm text-metric-blue underline underline-offset-2 transition-colors hover:text-ink"
                  >
                    Forgot password?
                  </button>
                </div>
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

              {/* Gate-aware Turnstile — invisible (interaction-only) while it
                  auto-solves; occupies zero layout space on the staff door,
                  where it never mounts at all. */}
              {captcha.enabled && captcha.siteKey && (
                <Turnstile
                  ref={turnstileRef}
                  siteKey={captcha.siteKey}
                  onToken={setCaptchaToken}
                  appearance="interaction-only"
                />
              )}

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
              onClick={() => navigate("vacant-positions")}
              className="min-h-[44px] text-sm text-metric-blue underline underline-offset-2 transition-colors hover:text-ink"
            >
              Back to vacant positions
            </button>
          </div>
        </div>
      </div>

      {/* Forgot password dialog (QA 2026-02) */}
      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="dlg-card-plain sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl tracking-[-0.02em] text-ink">Reset your password</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-body-gray">
              Enter the email address on your account (applicants, evaluators, and administrators
              alike) and we'll send you a reset link. The link expires in 30 minutes.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitForgot} className="space-y-4" noValidate>
            <div>
              <label htmlFor="forgot-email" className="mb-1.5 block text-sm font-medium text-ink">
                Email address
              </label>
              <Input
                id="forgot-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.gov.ph"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                className="dlg-input min-h-[44px]"
              />
            </div>
            <DialogFooter className="gap-2">
              <button
                type="button"
                onClick={() => setForgotOpen(false)}
                className="dlg-ghost min-h-[44px] px-5 py-2.5 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={forgotBusy}
                className="dlg-cta min-h-[44px] px-5 py-2.5 text-sm font-medium disabled:opacity-50"
              >
                {forgotBusy ? "Sending…" : "Send reset link"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
