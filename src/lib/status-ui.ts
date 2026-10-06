// ============================================================================
// RMIS — status → UI variant mapping (presentation layer).
// Bridges lib/status.ts tone vocabulary onto the Dialog functional status
// system defined in globals.css (ok / warn / bad / info / neutral).
// UI-only: no business logic lives here.
// ============================================================================

export type StatusVariant = "ok" | "warn" | "bad" | "info" | "neutral";

import { getStatusMeta, type Tone, type StageKey } from "@/lib/status";

const TONE_TO_VARIANT: Record<Tone, StatusVariant> = {
  success: "ok",
  warning: "warn",
  danger: "bad",
  info: "info",
  // "primary" statuses are the in-review family (Under Review / Screening /
  // Evaluation / Interview…) — they must render as the amber clock chip so
  // tables agree with the pipeline funnel and filter tabs (QA 2026-02).
  primary: "warn",
  neutral: "neutral",
};

/** Pipeline stage → functional variant. Shared by the job workspace pipeline,
 *  the analytics funnel and the candidate mini-pipeline so the three always
 *  agree on hue AND glyph. */
export const STAGE_VARIANT: Record<StageKey, StatusVariant> = {
  "Applied": "info",
  "Under Review": "warn",
  "Shortlisted": "ok",
  "Rejected": "bad",
};

/** Canonical variant for ANY stored application/job status spelling. */
export function variantForStatus(status: string | null | undefined): StatusVariant {
  return TONE_TO_VARIANT[getStatusMeta(status).tone];
}

/** MQR / requirements verdict → variant. */
export function variantForVerdict(verdict: string | null | undefined): StatusVariant {
  const v = (verdict || "").toLowerCase();
  if (v.includes("not qualified") || v === "no" || v === "unqualified") return "bad";
  if (v === "partial" || v.includes("partial")) return "warn";
  if (v.includes("qualified") || v === "yes" || v === "met" || v.includes("met")) return "ok";
  return "neutral";
}

/** Profile completion state → variant. */
export function variantForCompletion(complete: boolean | null | undefined): StatusVariant {
  if (complete === true) return "ok";
  if (complete === false) return "warn";
  return "neutral";
}

/** Job posting status → variant (OPEN is hiring = ok; CLOSED neutral). */
export function variantForJobStatus(status: string | null | undefined): StatusVariant {
  const key = (status || "").toUpperCase();
  if (key === "OPEN") return "ok";
  if (key === "CLOSED") return "neutral";
  return variantForStatus(status);
}

/** CSS class for the status-pill primitive in globals.css. */
export function pillClass(variant: StatusVariant): string {
  return `status-pill status-${variant}`;
}
