"use client";

// ============================================================================
// RMIS — Reset password view (QA 2026-02, sign-in item 3). Reached from the
// emailed link (#/reset-password?token=…): verifies the token by using it,
// collects a new password twice, then hands the user back to sign-in.
// Rendered inside PublicShell (header + footer).
// Executive Ink pass: lg+ split screen — the dark `.hero-band` brand panel
// (full-bleed, blueprint grid, white-plate BrandLogo) carries brand + heading;
// a pure-white ~420px form card sits on the right. Mobile keeps the previous
// centered single card with its compact in-card header. Token verify, submit
// and redirect behavior are preserved exactly.
// ============================================================================

import { useState } from "react";
import type { FormEvent } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { BrandLogo } from "@/components/brand-logo";
import { apiFetch } from "@/lib/client";
import { navigate, useHashRoute } from "@/lib/router";

export default function ResetPasswordView() {
  const { params } = useHashRoute();
  const token = params.token ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const missingToken = token.trim() === "";

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/auth/reset-password", { method: "POST", body: { token, password } });
      setDone(true);
      toast.success("Password updated", {
        description: "You can now sign in with your new password.",
      });
      setTimeout(() => navigate("signin"), 1200);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reset your password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex w-full flex-1 flex-col lg:flex-row">
      {/* Brand panel — dark Executive Ink hero band (lg+ only) */}
      <aside className="hero-band relative hidden overflow-hidden lg:flex lg:w-[42%] lg:flex-col xl:w-[46%]">
        <div aria-hidden="true" className="hero-grid pointer-events-none absolute inset-0" />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-[130px] -right-8 hidden select-none font-display text-[400px] leading-none text-white/[0.04] lg:block"
        >
          M
        </span>

        <div className="relative z-10 flex w-full max-w-md flex-col justify-center px-12 py-16 xl:pl-20 xl:pr-16">
          <div className="flex w-fit items-center gap-3">
            <BrandLogo logoSize={22} tone="dark" />
            <span className="text-sm font-semibold on-ink">RMIS</span>
          </div>

          <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
            Account recovery
          </p>
          <h1 className="on-ink mt-8 font-display text-[clamp(26px,2.6vw,38px)] font-semibold leading-[1.18] tracking-[-0.02em] lg:mt-10">
            Choose a new password
          </h1>
          <p className="on-ink-dim mt-4 max-w-md text-sm leading-relaxed">
            Pick a strong password of at least 6 characters for your Recruitment Management
            Information System account.
          </p>
        </div>
      </aside>

      {/* Form column — pure-white canvas with a ~420px card */}
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 sm:py-12">
        <div className="w-full max-w-[420px] animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="data-card p-6 sm:p-8">
            {/* Card header — mobile/tablet only; the lg+ brand panel carries brand + heading */}
            <div className="lg:hidden">
              <div className="flex items-center gap-3">
                <BrandLogo logoSize={24} />
                <span className="text-sm font-semibold text-ink">RMIS</span>
              </div>

              <div className="mt-6 flex items-start gap-3.5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cloud text-metric-blue">
                  <KeyRound className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h1 className="font-display text-xl font-semibold tracking-[-0.02em] text-ink">
                    Choose a new password
                  </h1>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-body-gray">
                    Pick a strong password of at least 6 characters for your Recruitment Management
                    Information System account.
                  </p>
                </div>
              </div>
            </div>

            {missingToken ? (
              <div className="mt-6 rounded-xl bg-[var(--bad-bg)] p-4 text-sm text-ink lg:mt-0">
                This reset link is missing its token. Please request a new password reset email.
                <button
                  type="button"
                  onClick={() => navigate("signin")}
                  className="mt-3 block min-h-[44px] text-[13px] font-medium text-metric-blue underline underline-offset-2"
                >
                  Back to sign in
                </button>
              </div>
            ) : done ? (
              <div className="mt-6 rounded-xl bg-fog p-4 text-sm text-body-gray lg:mt-0">
                <p className="flex items-center gap-2 font-medium text-ink">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Password updated
                </p>
                <p className="mt-1">Redirecting you to the sign-in page…</p>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-6 space-y-4 lg:mt-0" noValidate>
                <div>
                  <label htmlFor="new-password" className="mb-1.5 block text-[13px] font-medium text-ink">
                    New password
                  </label>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="dlg-input h-11 rounded-xl px-4"
                  />
                </div>
                <div>
                  <label htmlFor="confirm-password" className="mb-1.5 block text-[13px] font-medium text-ink">
                    Confirm new password
                  </label>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Re-enter your new password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="dlg-input h-11 rounded-xl px-4"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="dlg-cta h-11 w-full text-sm font-medium disabled:opacity-50"
                >
                  {busy ? "Updating…" : "Update password"}
                </button>
                <button
                  type="button"
                  onClick={() => navigate("signin")}
                  className="block min-h-[44px] w-full text-center text-[13px] text-metric-blue underline underline-offset-2 transition-colors hover:text-ink"
                >
                  Back to sign in
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
