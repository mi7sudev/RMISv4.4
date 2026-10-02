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
// Bevel pass: same split-screen as sign-in — LIGHT brand panel (Hero Sky
// gradient, ink display heading, white trust tiles) on lg+, editorial form
// directly on the white canvas. Rendered inside PublicShell (sticky header
// + footer), so the root flexes to fill the viewport between them. Every
// field, validation, and behavior is preserved exactly.
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

      {/* Form column — editorial form directly on the white canvas */}
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 sm:py-12">
        <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div>
            {/* Card header — mobile/tablet only; the lg+ brand panel carries brand + heading */}
            <div className="lg:hidden">
              <h2 className="text-center font-display text-3xl text-ink">
                Create your account
              </h2>
            </div>
            <p className="mt-2 text-center text-sm text-body-gray lg:mt-0 lg:text-left">
              Register to apply for positions at DOST-MIRDC.
            </p>

            <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="firstName" className="mb-1.5 block text-sm font-medium text-ink">
                    First name *
                  </label>
                  <Input
                    id="firstName"
                    name="firstName"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="dlg-input min-h-[44px]"
                  />
                </div>
                <div>
                  <label htmlFor="lastName" className="mb-1.5 block text-sm font-medium text-ink">
                    Last name *
                  </label>
                  <Input
                    id="lastName"
                    name="lastName"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="dlg-input min-h-[44px]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink">
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
                  className="dlg-input min-h-[44px]"
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-ink">
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
                    className="dlg-input min-h-[44px] pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-0.5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-stone hover:bg-cloud hover:text-ink"
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
                <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium text-ink">
                  Confirm password *
                </label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="dlg-input min-h-[44px]"
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
                className="dlg-cta min-h-[44px] w-full text-sm font-medium disabled:opacity-50"
              >
                {busy ? "Creating account…" : "Create account"}
              </button>
            </form>
          </div>

          <div className="mt-8 flex justify-center">
            <button
              onClick={() => navigate("signin")}
              className="min-h-[44px] text-sm text-metric-blue underline underline-offset-2 transition-colors hover:text-ink"
            >
              Sign in
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
