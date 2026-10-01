"use client";

// ============================================================================
// RMIS — Registration view (spec §3.4, §7.2): first/last name, email,
// password (≥6, show/hide) + confirmation, mandatory RA 10173 consent.
// Success → auto-login → session refresh → profile builder.
// Gate-aware Turnstile: on the public applicant door the widget mounts
// invisibly (interaction-only) and its token rides along with the register
// call. Tokens are single-use, so after a successful registration the widget
// is reset and we briefly wait for a fresh token before the auto-login — if
// one doesn't arrive in time we fall back to the sign-in page (existing
// path). On the employee door the form is captcha-free.
// Bevel pass: same split-screen as sign-in. Executive Ink pass: the brand
// panel is now the dark `.hero-band` aurora (full-bleed on lg+, compact band
// above the form on mobile) with the white-plate BrandLogo, ink-on-dark
// display heading and glass trust chips; a pure-white editorial form column
// on the right. Rendered inside PublicShell (sticky header + footer), so the
// root flexes to fill the viewport between them. Every field, validation, and
// behavior is preserved exactly.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Activity, Eye, EyeOff, FileSpreadsheet, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Turnstile } from "@/components/turnstile";
import type { TurnstileHandle } from "@/components/turnstile";
import { BrandLogo } from "@/components/brand-logo";
import { IconChip } from "@/components/ui/shell";
import type { ChipTone } from "@/components/ui/shell";
import { useSession } from "@/components/session-provider";
import { apiFetch } from "@/lib/client";
import { navigate } from "@/lib/router";

const TRUST_POINTS: ReadonlyArray<{ icon: LucideIcon; tone: ChipTone; text: string }> = [
  { icon: FileSpreadsheet, tone: "amber", text: "PDS auto-fill" },
  { icon: Activity, tone: "emerald", text: "Real-time status tracking" },
  { icon: ShieldCheck, tone: "plum", text: "Data Privacy Act compliant" },
];

/** Dark brand panel — the Executive Ink hero band. Full-bleed on lg+ (no
 *  rounding, stretches to full column height); on mobile it collapses to a
 *  compact band (p-6) above the form. The watermark is decorative. */
function AuthBrandPanel() {
  return (
    <aside className="hero-band relative overflow-hidden lg:flex lg:w-[42%] lg:flex-col xl:w-[46%]">
      {/* Blueprint grid + ink watermark (decorative) */}
      <div aria-hidden="true" className="hero-grid pointer-events-none absolute inset-0" />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-[130px] -right-8 hidden select-none font-display text-[400px] leading-none text-white/[0.04] lg:block"
      >
        M
      </span>

      <div className="relative z-10 flex w-full flex-col px-6 py-8 sm:px-10 sm:py-10 lg:max-w-md lg:justify-center lg:px-12 lg:py-16 xl:pl-20 xl:pr-16">
        <div className="flex w-fit items-center gap-3">
          {/* Official two-logo lockup on its white plate — tone="dark"
              softens the plate ring for the dark surface. */}
          <BrandLogo logoSize={22} tone="dark" />
          <span className="text-sm font-semibold on-ink">RMIS</span>
        </div>

        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
          Recruitment Management Information System
        </p>

        <h1 className="on-ink mt-8 font-display text-[clamp(26px,2.6vw,38px)] font-semibold leading-[1.18] tracking-[-0.02em] lg:mt-10">
          Build a career that moves the nation forward.
        </h1>
        <p className="on-ink-dim mt-4 max-w-md text-sm leading-relaxed">
          The official hiring portal of the Metals Industry Research and Development Center.
        </p>

        {/* Feature rows as glass chips (icon chips on white/10) — lg+ only,
            so the mobile band stays compact. */}
        <ul className="mt-8 hidden space-y-3 lg:mt-10 lg:block">
          {TRUST_POINTS.map((point) => (
            <li
              key={point.text}
              className="flex items-center gap-3.5 rounded-2xl bg-white/[0.06] p-3.5 ring-1 ring-white/12"
            >
              <IconChip icon={point.icon} tone={point.tone} size={36} iconSize={16} className="bg-white/10!" />
              <span className="text-[13px] font-medium on-ink">{point.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

/** Compact dark brand strip — removed: PublicShell's sticky header already
    carries the brand lockup on small screens (dedup pass). */

type CaptchaConfig = { enabled: boolean; siteKey: string | null };

/** Wait up to `timeoutMs` for the widget to mint a fresh single-use token. */
function waitForToken(get: () => string | null, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const token = get();
      if (token) {
        clearInterval(timer);
        resolve(token);
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        resolve(null);
      }
    }, 150);
  });
}

export default function SignUpView() {
  const { refresh } = useSession();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [captcha, setCaptcha] = useState<CaptchaConfig>({ enabled: false, siteKey: null });
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle | null>(null);
  const captchaTokenRef = useRef<string | null>(null);

  const handleToken = (token: string | null) => {
    captchaTokenRef.current = token;
    setCaptchaToken(token);
  };

  // Gate-aware captcha: ask the server which door we are on. If the config
  // fetch fails the widget simply stays off — the register/login endpoints
  // re-check the gate server-side and will 403 with a clear message.
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

  const validate = (): string | null => {
    if (!firstName.trim()) return "Enter your first name";
    if (!lastName.trim()) return "Enter your last name";
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim()))
      return "Enter a valid email address";
    if (password.length < 6) return "Password must be at least 6 characters";
    if (password !== confirmPassword) return "Passwords do not match";
    if (!consent) return "Please accept the data-privacy notice to continue";
    return null;
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/auth/register", {
        method: "POST",
        body: {
          email: email.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          password,
          captchaToken,
        },
      });
      // Auto-login immediately after registration (spec §3.4). The register
      // call consumed the single-use captcha token, so on the public door we
      // reset the widget and wait for a fresh one first.
      try {
        let loginToken: string | null = captchaToken;
        if (captcha.enabled) {
          handleToken(null);
          turnstileRef.current?.reset();
          loginToken = await waitForToken(() => captchaTokenRef.current, 6000);
        }
        await apiFetch("/api/auth/login", {
          method: "POST",
          body: { identifier: email.trim(), password, captchaToken: loginToken },
        });
        toast.success("Welcome to RMIS");
        // Route to the profile builder BEFORE the session refresh commits:
        // the Router bounces signed-in users off auth views, and the auto-
        // login above already set the session cookie while we are still on
        // #/signup — refreshing first would let that redirect win the race
        // and re-route to the applicant home instead of the builder.
        navigate("profile");
        await refresh();
      } catch {
        toast.success("Account created", {
          description: "Sign in with your new account to continue.",
        });
        navigate("signin");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed. Please try again.");
      // Tokens are single-use — mint a fresh one for the next attempt.
      handleToken(null);
      turnstileRef.current?.reset();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex w-full flex-1 flex-col lg:flex-row">
      <AuthBrandPanel />

      {/* Form column — editorial form on the pure-white canvas (~420px card) */}
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 sm:py-12">
        <div className="w-full max-w-[420px] animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div>
            {/* Card header — mobile/tablet only; the lg+ brand panel carries brand + heading */}
            <div className="lg:hidden">
              <h2 className="text-center font-display text-xl font-semibold tracking-[-0.02em] text-ink">
                Create your account
              </h2>
            </div>
            <p className="mt-2 text-center text-[13px] text-body-gray lg:mt-0 lg:text-left">
              Register to apply for positions at DOST-MIRDC.
            </p>

            <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="firstName" className="mb-1.5 block text-[13px] font-medium text-ink">
                    First name *
                  </label>
                  <Input
                    id="firstName"
                    name="firstName"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="dlg-input h-11 rounded-xl px-4"
                  />
                </div>
                <div>
                  <label htmlFor="lastName" className="mb-1.5 block text-[13px] font-medium text-ink">
                    Last name *
                  </label>
                  <Input
                    id="lastName"
                    name="lastName"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="dlg-input h-11 rounded-xl px-4"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium text-ink">
                  Email *
                </label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="dlg-input h-11 rounded-xl px-4"
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-1.5 block text-[13px] font-medium text-ink">
                  Password * <span className="font-normal text-stone">(minimum 6 characters)</span>
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="dlg-input h-11 rounded-xl px-4 pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-0.5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-stone hover:bg-fog hover:text-ink"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="mb-1.5 block text-[13px] font-medium text-ink">
                  Confirm password *
                </label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="dlg-input h-11 rounded-xl px-4"
                />
              </div>

              {/* Mandatory data-privacy consent (RA 10173) — cloud tint tile */}
              <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-cloud p-4">
                <Checkbox
                  checked={consent}
                  onCheckedChange={(v) => setConsent(v === true)}
                  className="mt-0.5"
                  aria-label="Data privacy consent"
                />
                <span className="text-xs leading-relaxed text-graphite">
                  I have read and accept the data-privacy notice in compliance with the Data Privacy
                  Act of 2012 (RA 10173)
                </span>
              </label>

              {/* Gate-aware Turnstile — invisible (interaction-only) while it
                  auto-solves; occupies zero layout space on the staff door,
                  where it never mounts at all. */}
              {captcha.enabled && captcha.siteKey && (
                <Turnstile
                  ref={turnstileRef}
                  siteKey={captcha.siteKey}
                  onToken={handleToken}
                  appearance="interaction-only"
                />
              )}

              <button
                type="submit"
                disabled={busy}
                className="dlg-cta h-11 w-full text-sm font-medium disabled:opacity-50"
              >
                {busy ? "Creating account…" : "Create account"}
              </button>
            </form>
          </div>

          <div className="mt-8 flex justify-center">
            <button
              onClick={() => navigate("signin")}
              className="min-h-[44px] text-[13px] text-metric-blue underline underline-offset-2 transition-colors hover:text-ink"
            >
              Sign in
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
