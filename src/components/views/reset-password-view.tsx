"use client";

// ============================================================================
// RMIS — Reset password view (QA 2026-02, sign-in item 3). Reached from the
// emailed link (#/reset-password?token=…): verifies the token by using it,
// collects a new password twice, then hands the user back to sign-in.
// Rendered inside PublicShell (header + footer).
// ============================================================================

import { useState } from "react";
import type { FormEvent } from "react";
import { AlertCircle, KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Callout, IconChip } from "@/components/ui/shell";
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
    <div className="flex w-full flex-1 flex-col">
      <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="dlg-card-plain p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <BrandLogo logoSize={24} />
              <span className="text-sm font-semibold text-ink">RMIS</span>
            </div>

            <div className="mt-6 flex items-start gap-3.5">
              <IconChip icon={KeyRound} tone="blue" size={44} iconSize={20} />
              <div>
                <h1 className="text-2xl font-semibold leading-[1.1] tracking-[-0.01em] text-ink">Choose a new password</h1>
                <p className="mt-1.5 text-sm leading-relaxed text-body-gray">
                  Pick a strong password of at least 6 characters for your Recruitment Management
                  Information System account.
                </p>
              </div>
            </div>

            {missingToken ? (
              <Callout tone="bad" icon={AlertCircle} className="mt-6">
                This reset link is missing its token. Please request a new password reset email.
                <button
                  type="button"
                  onClick={() => navigate("signin")}
                  className="mt-3 block min-h-[44px] text-sm font-medium text-metric-blue underline underline-offset-2"
                >
                  Back to sign in
                </button>
              </Callout>
            ) : done ? (
              <Callout tone="ok" icon={ShieldCheck} title="Password updated" className="mt-6">
                Redirecting you to the sign-in page…
              </Callout>
            ) : (
              <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
                <div>
                  <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-ink">
                    New password
                  </label>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="dlg-input min-h-[44px]"
                  />
                </div>
                <div>
                  <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-ink">
                    Confirm new password
                  </label>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Re-enter your new password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="dlg-input min-h-[44px]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="dlg-cta text-nav min-h-[44px] w-full font-medium disabled:opacity-50"
                >
                  {busy ? "Updating…" : "Update password"}
                </button>
                <button
                  type="button"
                  onClick={() => navigate("signin")}
                  className="block min-h-[44px] w-full text-center text-sm text-metric-blue underline underline-offset-2 transition-colors hover:text-ink"
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
