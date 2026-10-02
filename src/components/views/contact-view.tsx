"use client";

// ============================================================================
// RMIS — Public contact view (QA 2026-02, ADMIN/EVALUATOR "Contact Requests —
// management of inquiries or requests submitted through the system"). A simple
// and honest inquiry form for applicants and employees; submissions land in
// Settings → Contact Requests for the HR team. Rendered inside PublicShell.
// ============================================================================

import { useState } from "react";
import type { FormEvent } from "react";
import { LifeBuoy, Mail, MapPin, Phone } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/ui/shell";
import { apiFetch } from "@/lib/client";

type Status = "idle" | "busy" | "sent";

const CHANNELS = [
  { icon: MapPin, label: "Visit us", value: "Metals Industry Research and Development Center, Gen. Santos Ave., Bicutan, Taguig City" },
  { icon: Phone, label: "Call us", value: "(632) 8837-2431 loc. 413" },
  { icon: Mail, label: "Email us", value: "hr@mirdc.gov.ph" },
];

export default function ContactView() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("busy");
    try {
      const res = await apiFetch<{ submitted: boolean; message: string }>("/api/contact", {
        method: "POST",
        body: { name: name.trim(), email: email.trim(), subject: subject.trim(), message: message.trim() },
      });
      if (res.submitted) {
        setStatus("sent");
        toast.success("Inquiry sent", { description: res.message });
      } else {
        setStatus("idle");
        toast.error(res.message || "Could not send your inquiry");
      }
    } catch (err) {
      setStatus("idle");
      toast.error(err instanceof Error ? err.message : "Could not send your inquiry");
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pb-14 pt-8 sm:px-6 lg:px-8">
      {/* Enterprise page header (PageHeader) — shared anatomy across ALL pages */}
      <PageHeader
        className="max-w-2xl"
        eyebrow="Get in touch"
        title="Contact the Recruitment Team"
        description="Questions about a posting, your application, or your account? Send us an inquiry and the MIRDC Human Resources team will respond through email."
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Form */}
        <div className="dlg-card-plain p-5 sm:p-6">
          {status === "sent" ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-cloud text-metric-blue">
                <LifeBuoy className="h-6 w-6" aria-hidden="true" />
              </span>
              <h2 className="font-display text-xl text-ink">Inquiry received</h2>
              <p className="max-w-sm text-sm leading-relaxed text-body-gray">
                Thank you, your request is now in the HR queue. Keep an eye on your inbox for the
                response.
              </p>
              <button
                type="button"
                onClick={() => {
                  setStatus("idle");
                  setName("");
                  setEmail("");
                  setSubject("");
                  setMessage("");
                }}
                className="dlg-ghost mt-2 min-h-[44px] px-6 text-sm"
              >
                Send another inquiry
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="contact-name" className="mb-1.5 block text-sm font-medium text-ink">
                    Full name <span aria-hidden="true" className="text-[var(--bad)]">*</span>
                  </label>
                  <Input
                    id="contact-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your full name"
                    className="dlg-input min-h-[44px]"
                    maxLength={120}
                  />
                </div>
                <div>
                  <label htmlFor="contact-email" className="mb-1.5 block text-sm font-medium text-ink">
                    Email address <span aria-hidden="true" className="text-[var(--bad)]">*</span>
                  </label>
                  <Input
                    id="contact-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.gov.ph"
                    className="dlg-input min-h-[44px]"
                    maxLength={200}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="contact-subject" className="mb-1.5 block text-sm font-medium text-ink">
                  Subject <span aria-hidden="true" className="text-[var(--bad)]">*</span>
                </label>
                <Input
                  id="contact-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Clarification on Science Research Specialist II posting"
                  className="dlg-input min-h-[44px]"
                  maxLength={200}
                />
              </div>
              <div>
                <label htmlFor="contact-message" className="mb-1.5 block text-sm font-medium text-ink">
                  Message <span aria-hidden="true" className="text-[var(--bad)]">*</span>
                </label>
                <Textarea
                  id="contact-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="How can we help?"
                  className="dlg-input min-h-[140px]"
                  maxLength={4000}
                />
                <p className="mt-1 text-xs text-stone">Up to 4,000 characters.</p>
              </div>
              <button
                type="submit"
                disabled={status === "busy"}
                className="dlg-cta min-h-[44px] w-full text-sm font-medium disabled:opacity-50 sm:w-auto sm:px-10"
              >
                {status === "busy" ? "Sending…" : "Send inquiry"}
              </button>
            </form>
          )}
        </div>

        {/* Channels */}
        <aside className="space-y-3">
          {CHANNELS.map((c) => (
            <div key={c.label} className="dlg-card flex items-start gap-3.5 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cloud text-metric-blue">
                <c.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-stone">{c.label}</p>
                <p className="mt-1 text-sm leading-relaxed text-body-gray">{c.value}</p>
              </div>
            </div>
          ))}
          <p className="px-1 text-xs leading-relaxed text-stone">
            Responses are typically sent within 2–3 working days. For account access issues, use the
            “Forgot password?” option on the sign-in page.
          </p>
        </aside>
      </div>
    </div>
  );
}
