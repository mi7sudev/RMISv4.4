// ============================================================================
// RMIS — /api/admin/email (spec §6.6 / §9; QA 2026-02: evaluators get the
// Email Notices view too, read-only)
// GET:  provider info (mock|resend + configured flag), stats { total, sent,
//       failed, skipped, mock, last24h }, last 25 email logs. EVALUATOR or
//       ADMIN.
// POST: test send { to, subject? ≤200, message? ≤2000 } via sendEmail
//       (never throws; auto-logged). Failure → 502. ADMIN only.
// ============================================================================

import { z } from "zod";
import { db } from "@/lib/db";
import { handleApi, ok, err } from "@/lib/api";
import { requireAdminFromReq, requireEvaluatorFromReq } from "@/lib/auth";
import { sendEmail } from "@/lib/notify";

export const dynamic = "force-dynamic";

const testSchema = z.object({
  to: z.string().trim().min(3).max(200),
  subject: z.string().trim().max(200).optional(),
  message: z.string().trim().max(2000).optional(),
});

export const GET = handleApi(async (req: Request) => {
  await requireEvaluatorFromReq(req);

  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
  const [total, sent, failed, skipped, mock, last24h, logs] = await Promise.all([
    db.emailLog.count(),
    db.emailLog.count({ where: { status: "sent" } }),
    db.emailLog.count({ where: { status: "failed" } }),
    db.emailLog.count({ where: { status: "skipped" } }),
    db.emailLog.count({ where: { status: "mock" } }),
    db.emailLog.count({ where: { createdAt: { gte: dayAgo } } }),
    db.emailLog.findMany({ orderBy: { id: "desc" }, take: 25 }),
  ]);

  return ok({
    provider: process.env.EMAIL_PROVIDER || "mock",
    configured: !!process.env.RESEND_API_KEY,
    stats: { total, sent, failed, skipped, mock, last24h },
    logs,
  });
});

export const POST = handleApi(async (req: Request) => {
  await requireAdminFromReq(req);
  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = testSchema.parse(body);

  const result = await sendEmail({
    to: parsed.to,
    subject: parsed.subject || "RMIS test email",
    bodyText: parsed.message || "This is a test email from RMIS.",
    relatedType: "test",
  });

  if (result.status === "failed") {
    return err("Email delivery failed", 502, { error: result.error ?? null, provider: result.provider });
  }
  return ok({ email: result });
});
