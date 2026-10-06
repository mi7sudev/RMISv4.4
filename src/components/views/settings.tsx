"use client";

// ============================================================================
// RMIS — Admin settings (spec §7.14, `#/settings?tab=users|audit|sms|email`).
// Sub-nav: Users & Roles / Audit Log / SMS Gateway / Email Notices. Deep
// linkable; the command center links to ?tab=audit.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Inbox, Mail, Pencil, ScrollText, Search, Send, ShieldCheck, Trash2, UsersRound } from "lucide-react";
import { useSession } from "@/components/session-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { EmptyState, FilterChip, IconChip, Monogram, nameInitials, PageHeader, Pagination, SkeletonRows, StatusPill, dialogScroll } from "@/components/ui/shell";
import { AuditFeedRow } from "@/components/ui/audit-row";
import { apiFetch, formatDateTime, humanize, timeAgo } from "@/lib/client";
import { useHashRoute, navigate } from "@/lib/router";
import { pillClass } from "@/lib/status-ui";
import { cn } from "@/lib/utils";
import { ghostBadModifier } from "@/components/ui/buttons";
import { ghostBtn, ctaBtn, iconBtn, iconBtnBad } from "@/components/views/recruitment";

// QA 2026-02: Settings contents are role-scoped — administrators get the full
// configuration set (Users & Security, Audit Log, SMS Gateway, Email Notices,
// Contact Requests); evaluators get Email Notices (read-only) + Contact
// Requests, per the approved module map.
const ALL_TABS = [
  { key: "users", label: "Users & Security", icon: UsersRound, roles: ["ADMIN"] },
  { key: "audit", label: "Audit Log", icon: ShieldCheck, roles: ["ADMIN"] },
  { key: "sms", label: "SMS Gateway", icon: Send, roles: ["ADMIN"] },
  { key: "email", label: "Email Notices", icon: Mail, roles: ["ADMIN", "EVALUATOR"] },
  { key: "contact", label: "Contact Requests", icon: Inbox, roles: ["ADMIN", "EVALUATOR"] },
] as const;

type TabKey = (typeof ALL_TABS)[number]["key"];

function labelCls() {
  return "mb-1.5 block text-xs font-medium text-stone";
}

// Monogram initials, filter chips, pagination and the audit-feed rows are the
// shared primitives (ui/shell + ui/audit-row) — no local copies.

// ───────────────────────────────────────────────────────────── Users panel

type UserRow = {
  id: string;
  username: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: "ADMIN" | "EVALUATOR" | "APPLICANT";
  blocked: boolean;
  createdAt: string;
  applicant?: { id: number; isProfileComplete: boolean } | null;
};

function UsersPanel() {
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("ALL");
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const [busyId, setBusyId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [hardTarget, setHardTarget] = useState<UserRow | null>(null);
  const [disableTarget, setDisableTarget] = useState<UserRow | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setRows(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (q.trim()) params.set("q", q.trim());
      if (role !== "ALL") params.set("role", role);
      const data = await apiFetch<{ data: UserRow[]; total: number }>(`/api/admin/users?${params.toString()}`);
      setRows(data.data);
      setTotal(data.total);
    } catch (e) {
      if (!silent) toast.error(e instanceof Error ? e.message : "Failed to load users");
      setRows([]);
    }
  }, [q, role, page]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const toggleActive = async (u: UserRow) => {
    setBusyId(u.id);
    try {
      if (!u.blocked) {
        setDisableTarget(u); // confirm first
      } else {
        await apiFetch(`/api/admin/users/${u.id}`, { method: "PATCH", body: { isActive: true } });
        toast.success(`${u.username} re-enabled`);
        await load(true);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  const confirmDisable = async () => {
    if (!disableTarget) return;
    try {
      await apiFetch(`/api/admin/users/${disableTarget.id}`, { method: "DELETE" });
      toast.success(`${disableTarget.username} disabled`);
      await load(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
    setDisableTarget(null);
  };

  const confirmHardDelete = async () => {
    if (!hardTarget) return;
    try {
      await apiFetch(`/api/admin/users/${hardTarget.id}?hard=1`, { method: "DELETE" });
      toast.success(`${hardTarget.username} permanently deleted`);
      await load(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
    setHardTarget(null);
  };

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <IconChip icon={UsersRound} tone="slate" size={36} iconSize={16} />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold tracking-[-0.01em] text-ink">Users &amp; Security</h2>
          <p className="text-xs text-body-gray">
            <span className="num">{total}</span> account{total === 1 ? "" : "s"}
          </p>
        </div>
        <button type="button" className={ctaBtn} onClick={() => setCreateOpen(true)}>Create User</button>
      </div>

      <div className="dlg-card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:p-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pebble" aria-hidden />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search name, email or username…" className="dlg-input min-h-[44px] pl-9" />
        </div>
        <Select value={role} onValueChange={(v) => { setRole(v); setPage(1); }}>
          <SelectTrigger className="dlg-input min-h-[44px] w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All roles</SelectItem>
            <SelectItem value="APPLICANT">Applicant</SelectItem>
            <SelectItem value="EVALUATOR">Evaluator</SelectItem>
            <SelectItem value="ADMIN">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="dlg-card table-card overflow-hidden">
        <div className="max-h-96 overflow-x-auto overflow-y-auto scroll-thin">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="sticky top-0 z-10 bg-fog text-left eyebrow">
              <tr>
                <th scope="col" className="px-5 py-3.5">User</th>
                <th scope="col" className="px-4 py-3.5">Role</th>
                <th scope="col" className="px-4 py-3.5">Active</th>
                <th scope="col" className="px-5 py-3.5 text-right"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows === null && (
                <tr><td colSpan={4} className="p-4"><SkeletonRows rows={4} rowClassName="h-12" /></td></tr>
              )}
              {rows?.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6">
                    <EmptyState icon={UsersRound} tone="slate" title="No accounts match your filters" compact />
                  </td>
                </tr>
              )}
              {rows?.map((u) => (
                <tr key={u.id} className="group/row border-b border-[var(--border)] transition-colors last:border-0 hover:bg-fog/60">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <span aria-hidden="true" className="contents">
                        <Monogram size={32} className="rounded-full">{nameInitials([u.firstName, u.lastName].filter(Boolean).join(" ") || u.username)}</Monogram>
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">{[u.firstName, u.lastName].filter(Boolean).join(" ") || u.username}</p>
                        <p className="num text-xs text-pebble">{u.email} · @{u.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5"><span className={pillClass("neutral")}>{u.role}</span></td>
                  <td className="px-4 py-3.5">
                    <Switch checked={!u.blocked} disabled={busyId === u.id} onCheckedChange={() => void toggleActive(u)} aria-label={`Toggle ${u.username}`} />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end gap-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100 max-lg:opacity-100">
                      <button
                        type="button"
                        className={iconBtn}
                        aria-label={`Edit ${u.username}`}
                        title="Edit"
                        onClick={() => setEditUser(u)}
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        className={iconBtnBad}
                        aria-label={`Delete ${u.username}`}
                        title="Delete"
                        onClick={() => setHardTarget(u)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {pages > 1 && (
        <Pagination page={page} pageCount={pages} total={total} onPage={setPage} unit="accounts" />
      )}

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={() => void load(true)} />
      {editUser && (
        <EditUserDialog user={editUser} onOpenChange={(o) => !o && setEditUser(null)} onSaved={() => void load(true)} />
      )}

      <AlertDialog open={!!disableTarget} onOpenChange={(o) => !o && setDisableTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable {disableTarget?.username}?</AlertDialogTitle>
            <AlertDialogDescription>
              The account will be signed out and cannot sign in until re-enabled. Nothing is permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDisable()}>Disable</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!hardTarget} onOpenChange={(o) => !o && setHardTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete {hardTarget?.username}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the account and its applicant profile. Administrators and your own account are protected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(ghostBadModifier, "min-h-[44px] px-4 text-sm font-medium")}
              onClick={() => void confirmHardDelete()}
            >
              Delete forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CreateUserDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const [form, setForm] = useState({ email: "", username: "", password: "", role: "APPLICANT", firstName: "", lastName: "" });
  const [busy, setBusy] = useState(false);
  const usernameError = form.username.length > 0 && form.username.length < 3 ? "Username must be at least 3 characters" : null;
  const passwordError = form.password.length > 0 && form.password.length < 6 ? "Password must be at least 6 characters" : null;

  const submit = async () => {
    setBusy(true);
    try {
      await apiFetch("/api/admin/users", { method: "POST", body: form });
      toast.success("Account created");
      onOpenChange(false);
      setForm({ email: "", username: "", password: "", role: "APPLICANT", firstName: "", lastName: "" });
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`dlg-card-plain ${dialogScroll} sm:max-w-md`}>
        <DialogHeader className="text-left">
          <DialogTitle className="font-display text-2xl text-ink">Create User</DialogTitle>
          <DialogDescription className="text-sm text-stone">Staff accounts can only sign in from the MIRDC intranet.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label className={labelCls()}>Email *</Label><Input className="dlg-input min-h-[44px]" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@mirdc.gov.ph" /></div>
          <div>
            <Label className={labelCls()}>Username *</Label>
            <Input className="dlg-input min-h-[44px]" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            {usernameError && <p className="mt-1 text-xs text-[var(--bad)]">{usernameError}</p>}
          </div>
          <div>
            <Label className={labelCls()}>Password *</Label>
            <Input type="password" className="dlg-input min-h-[44px]" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            {passwordError && <p className="mt-1 text-xs text-[var(--bad)]">{passwordError}</p>}
          </div>
          <div>
            <Label className={labelCls()}>Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger className="dlg-input min-h-[44px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="APPLICANT">Applicant</SelectItem>
                <SelectItem value="EVALUATOR">Evaluator</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><Label className={labelCls()}>First name</Label><Input className="dlg-input min-h-[44px]" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
            <div><Label className={labelCls()}>Last name</Label><Input className="dlg-input min-h-[44px]" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
          </div>
        </div>
        <DialogFooter className="flex-col gap-3 sm:flex-row">
          <button type="button" className={ghostBtn} onClick={() => onOpenChange(false)}>Cancel</button>
          <button
            type="button"
            className={ctaBtn}
            disabled={busy || !form.email || usernameError !== null || passwordError !== null || form.password.length < 6 || form.username.length < 3}
            onClick={() => void submit()}
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({ user, onOpenChange, onSaved }: { user: UserRow; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const [form, setForm] = useState({ firstName: user.firstName ?? "", lastName: user.lastName ?? "", role: user.role, password: "" });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { firstName: form.firstName, lastName: form.lastName, role: form.role };
      if (form.password) body.password = form.password;
      await apiFetch(`/api/admin/users/${user.id}`, { method: "PATCH", body });
      toast.success("Account updated");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className={`dlg-card-plain ${dialogScroll} sm:max-w-md`}>
        <DialogHeader className="text-left">
          <DialogTitle className="font-display text-2xl text-ink">Edit @{user.username}</DialogTitle>
          <DialogDescription className="text-sm text-stone">{user.email}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><Label className={labelCls()}>First name</Label><Input className="dlg-input min-h-[44px]" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
            <div><Label className={labelCls()}>Last name</Label><Input className="dlg-input min-h-[44px]" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
          </div>
          <div>
            <Label className={labelCls()}>Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as UserRow["role"] })}>
              <SelectTrigger className="dlg-input min-h-[44px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="APPLICANT">Applicant</SelectItem>
                <SelectItem value="EVALUATOR">Evaluator</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className={labelCls()}>Reset password</Label>
            <Input type="password" className="dlg-input min-h-[44px]" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Leave blank to keep current" />
            {form.password.length > 0 && form.password.length < 6 && <p className="mt-1 text-xs text-[var(--bad)]">Password must be at least 6 characters</p>}
          </div>
        </div>
        <DialogFooter className="flex-col gap-3 sm:flex-row">
          <button type="button" className={ghostBtn} onClick={() => onOpenChange(false)}>Cancel</button>
          <button type="button" className={ctaBtn} disabled={busy || (form.password.length > 0 && form.password.length < 6)} onClick={() => void submit()}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────────────────────────────────────────── Audit panel

type AuditRow = {
  id: number;
  timestamp: string;
  userLabel: string | null;
  userRole: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  description: string | null;
  ipAddress: string | null;
};

function AuditPanel() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [summary, setSummary] = useState<{ totalEvents: number; byRole: Record<string, number> } | null>(null);
  const [actions, setActions] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("ALL");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const load = useCallback(async (silent = false) => {
    if (!silent) setRows(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (q.trim()) params.set("search", q.trim());
      if (action !== "ALL") params.set("action", action);
      const data = await apiFetch<{
        data: AuditRow[];
        total: number;
        actions: string[];
        summary: { totalEvents: number; onPage: number; topActions: { action: string; count: number }[]; byRole: Record<string, number> };
      }>(`/api/admin/audit-logs?${params.toString()}`);
      setRows(data.data);
      setSummary({ totalEvents: data.summary.totalEvents, byRole: data.summary.byRole });
      setActions(data.actions);
    } catch (e) {
      if (!silent) toast.error(e instanceof Error ? e.message : "Failed to load audit log");
      setRows([]);
    }
  }, [q, action, page]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const pages = Math.max(1, Math.ceil((rows === null ? 0 : summary?.totalEvents ?? 0) / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <IconChip icon={ScrollText} tone="plum" size={36} iconSize={16} />
        <h2 className="text-base font-semibold tracking-[-0.01em] text-ink">Audit Log</h2>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {(
          [
            ["Total events", summary?.totalEvents],
            ...(["ADMIN", "EVALUATOR", "APPLICANT"] as const).map((r) => [humanize(r), summary?.byRole?.[r] ?? 0] as const),
          ] as [string, number | undefined][]
        ).map(([label, value]) => (
          <div key={label} className="dlg-card p-6">
            <p className="eyebrow">{label}</p>
            <p className="num mt-4 text-3xl font-semibold tracking-[-0.02em] text-ink">{value ?? "-"}</p>
          </div>
        ))}
      </div>

      <div className="dlg-card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:p-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pebble" aria-hidden />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search descriptions and actors…" className="dlg-input min-h-[44px] pl-9" />
        </div>
        <Select value={action} onValueChange={(v) => { setAction(v); setPage(1); }}>
          <SelectTrigger className="dlg-input min-h-[44px] w-full sm:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All actions</SelectItem>
            {actions.map((a) => <SelectItem key={a} value={a}>{humanize(a)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="dlg-card-plain overflow-hidden">
        <div className="max-h-96 overflow-y-auto scroll-thin p-2">
          {rows === null && <div className="p-2"><SkeletonRows rows={6} rowClassName="h-11" /></div>}
          {rows?.length === 0 && <EmptyState icon={ScrollText} tone="plum" title="No audit events match" compact />}
          {rows?.map((r) => (
            <AuditFeedRow
              key={r.id}
              variant="ledger"
              timestamp={r.timestamp}
              userLabel={r.userLabel}
              userRole={r.userRole}
              action={r.action}
              description={r.description}
            />
          ))}
        </div>
      </div>

      {pages > 1 && (
        <Pagination page={page} pageCount={pages} total={summary?.totalEvents ?? 0} onPage={setPage} unit="events" />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────── Messaging panels (SMS/email)

type MsgLog = {
  id: number;
  to: string;
  subject?: string;
  message?: string;
  provider: string;
  status: string;
  error: string | null;
  createdAt: string;
  attachments?: string | null;
};

type MsgPanelData = {
  provider: string;
  configured: boolean;
  stats: { total: number; sent: number; failed: number; skipped?: number; mock?: number; last24h: number };
  logs: MsgLog[];
};

/** Delivery status → functional status tone pill. */
function StatusChip({ status }: { status: string }) {
  const variant =
    status === "sent" ? "ok"
    : status === "failed" ? "bad"
    : status === "mock" ? "warn"
    : "neutral";
  return <StatusPill status={status} variant={variant} />;
}

function MessagingPanel({ kind, readOnly = false }: { kind: "sms" | "email"; readOnly?: boolean }) {
  const [data, setData] = useState<MsgPanelData | null>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setData(null);
    try {
      setData(await apiFetch<MsgPanelData>(`/api/admin/${kind}`));
    } catch (e) {
      if (!silent) toast.error(e instanceof Error ? e.message : "Failed to load");
      setData({ provider: "mock", configured: false, stats: { total: 0, sent: 0, failed: 0, last24h: 0 }, logs: [] });
    }
  }, [kind]);

  useEffect(() => { void load(); }, [load]);

  const testSend = async () => {
    setBusy(true);
    try {
      const body = kind === "sms" ? { to, message: message || undefined } : { to, subject: subject || undefined, message: message || undefined };
      const res = await apiFetch<{ email?: { status: string }; sms?: { status: string } }>(`/api/admin/${kind}`, { method: "POST", body });
      const status = res.email?.status ?? res.sms?.status ?? "sent";
      if (status === "sent") toast.success(`Test ${kind} sent`);
      else if (status === "mock") toast.info(`Test ${kind} logged in mock mode`, { description: "Configure a provider to deliver for real." });
      else if (status === "skipped") toast.warning("Recipient skipped", { description: "Check the address or mobile number format." });
      else toast.error(`Delivery failed. Check the logs`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(false);
      // Refresh the ledger even after a failed attempt — the row is logged
      // (status "failed") and the admin should see it without leaving the tab.
      await load(true);
    }
  };

  const tiles: [string, number | undefined][] = [
    ["Total", data?.stats.total],
    ["Sent", data?.stats.sent],
    ["Failed", data?.stats.failed],
    ["Last 24h", data?.stats.last24h],
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {kind === "sms" ? (
          <IconChip icon={Send} tone="gold" size={36} iconSize={16} />
        ) : (
          <IconChip icon={Mail} tone="emerald" size={36} iconSize={16} />
        )}
        <h2 className="text-base font-semibold tracking-[-0.01em] text-ink">
          {kind === "sms" ? "SMS Gateway" : "Email Notices"}
        </h2>
      </div>
      <div className="dlg-card-plain p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Active provider</p>
            <p className="num mt-1 text-lg font-semibold text-ink">{humanize(data?.provider ?? "…")}</p>
            {data?.provider === "mock" ? (
              <p className="mt-1 text-xs text-body-gray">Messages are logged only.</p>
            ) : null}
          </div>
          {data?.provider === "mock" ? (
            <StatusPill status="Mock mode" variant="neutral" />
          ) : (
            <StatusPill status={data?.configured ? "Configured" : "Not configured"} variant={data?.configured ? "ok" : "warn"} />
          )}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {tiles.map(([label, value]) => (
            <div key={label} className="rounded-lg bg-cloud p-4">
              <p className="eyebrow">{label}</p>
              <p className="num mt-2 text-3xl font-semibold tracking-[-0.02em] text-ink">{value ?? "-"}</p>
            </div>
          ))}
        </div>
      </div>

      {readOnly ? (
        <p className="rounded-xl bg-cloud/70 px-4 py-2.5 text-xs leading-relaxed text-stone" role="note">
          <span className="font-semibold text-ink">Read-only view:</span> notification sending and
          gateway configuration are managed by system administrators.
        </p>
      ) : (
      <div className="dlg-card-plain p-5 sm:p-6">
        <p className="mb-4 text-base font-semibold tracking-[-0.01em] text-ink">Test send</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className={labelCls()}>{kind === "sms" ? "Mobile number (09…)" : "Recipient email"}</Label>
            <Input className="dlg-input min-h-[44px]" value={to} onChange={(e) => setTo(e.target.value)} placeholder={kind === "sms" ? "09171234567" : "name@example.com"} />
          </div>
          {kind === "email" && (
            <div>
              <Label className={labelCls()}>Subject</Label>
              <Input className="dlg-input min-h-[44px]" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="RMIS test email" />
            </div>
          )}
          <div className={kind === "email" ? "sm:col-span-2" : ""}>
            <Label className={labelCls()}>Message</Label>
            <Input className="dlg-input min-h-[44px]" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Optional message" />
          </div>
        </div>
        <button type="button" className={`${ctaBtn} mt-4`} disabled={busy || !to.trim()} onClick={() => void testSend()}>
          {busy ? "Sending…" : `Send test ${kind}`}
        </button>
      </div>
      )}

      <div className="dlg-card table-card overflow-hidden">
        <div className="max-h-96 overflow-x-auto overflow-y-auto scroll-thin">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="sticky top-0 z-10 bg-fog text-left eyebrow">
              <tr>
                <th scope="col" className="px-5 py-3.5">To</th>
                <th scope="col" className="px-4 py-3.5">{kind === "sms" ? "Message" : "Subject"}</th>
                <th scope="col" className="px-4 py-3.5">Status</th>
                <th scope="col" className="px-5 py-3.5 text-right">When</th>
              </tr>
            </thead>
            <tbody>
              {data === null && <tr><td colSpan={4} className="p-4"><SkeletonRows rows={4} rowClassName="h-12" /></td></tr>}
              {data?.logs.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6">
                    <EmptyState
                      icon={kind === "sms" ? Send : Mail}
                      tone={kind === "sms" ? "gold" : "emerald"}
                      title="Nothing sent yet"
                      description="Send a test message to see its delivery log here."
                      compact
                    />
                  </td>
                </tr>
              )}
              {data?.logs.map((l) => (
                <tr key={l.id} className="border-b border-[var(--border)] align-top transition-colors last:border-0 hover:bg-fog/60">
                  <td className="px-5 py-3.5 font-medium text-ink">{l.to}</td>
                  <td className="max-w-[280px] truncate px-4 py-3.5 text-body-gray">{l.subject ?? l.message ?? "-"}</td>
                  <td className="px-4 py-3.5">
                    <StatusChip status={l.status} />
                    {l.error && <p className="mt-1 text-xs text-body-gray">{l.error}</p>}
                  </td>
                  <td className="num px-5 py-3.5 text-right text-xs text-body-gray" title={formatDateTime(l.createdAt)}>
                    {timeAgo(l.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────── Contact Requests panel (QA)

type ContactRow = {
  id: number;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: "OPEN" | "RESOLVED";
  createdAt: string;
  resolvedAt: string | null;
  handledBy?: { firstName: string | null; lastName: string | null; username: string } | null;
};

function ContactPanel() {
  const [rows, setRows] = useState<ContactRow[] | null>(null);
  const [filter, setFilter] = useState<"ALL" | "OPEN" | "RESOLVED">("ALL");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setRows(null);
    try {
      const q = filter === "ALL" ? "" : `?status=${filter}`;
      const res = await apiFetch<{ data: ContactRow[] }>(`/api/admin/contact-requests${q}`);
      setRows(res.data);
    } catch (e) {
      if (!silent) toast.error(e instanceof Error ? e.message : "Failed to load contact requests");
      setRows([]);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const setStatus = async (id: number, status: "OPEN" | "RESOLVED") => {
    setBusyId(id);
    try {
      await apiFetch("/api/admin/contact-requests", { method: "PATCH", body: { id, status } });
      toast.success(status === "RESOLVED" ? "Marked as resolved" : "Reopened");
      await load(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <IconChip icon={Inbox} tone="slate" size={36} iconSize={16} />
        <h2 className="text-base font-semibold tracking-[-0.01em] text-ink">Contact Requests</h2>
        <span className="ml-auto">
          <StatusPill status={`${rows?.length ?? "…"}`} variant="neutral" className="num" />
        </span>
      </div>
      <p className="text-sm leading-relaxed text-body-gray">
        Inquiries and requests submitted through the public Contact page. Reply to the sender
        through their email address, then mark the request as resolved.
      </p>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
        {(["ALL", "OPEN", "RESOLVED"] as const).map((f) => (
          <FilterChip
            key={f}
            active={filter === f}
            onClick={() => setFilter(f)}
          >
            {f === "ALL" ? "All" : f === "OPEN" ? "Open" : "Resolved"}
          </FilterChip>
        ))}
      </div>

      <div className="dlg-card table-card overflow-hidden">
        <div className="max-h-96 overflow-x-auto overflow-y-auto scroll-thin">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="sticky top-0 z-10 bg-fog text-left eyebrow">
              <tr>
                <th scope="col" className="px-5 py-3.5">From</th>
                <th scope="col" className="px-4 py-3.5">Subject</th>
                <th scope="col" className="px-4 py-3.5">Status</th>
                <th scope="col" className="px-5 py-3.5 text-right">Received</th>
                <th scope="col" className="px-4 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows === null && <tr><td colSpan={5} className="p-4"><SkeletonRows rows={4} rowClassName="h-14" /></td></tr>}
              {rows?.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6">
                    <EmptyState
                      icon={Inbox}
                      tone="slate"
                      title="No contact requests yet"
                      description="Messages from the public Contact page will appear here."
                      compact
                    />
                  </td>
                </tr>
              )}
              {rows?.map((r) => (
                <tr key={r.id} className="border-b border-[var(--border)] align-top transition-colors last:border-0 hover:bg-fog/60">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-ink">{r.name}</p>
                    <p className="mt-0.5 text-xs text-body-gray">{r.email}</p>
                  </td>
                  <td className="max-w-[320px] px-4 py-3.5">
                    <p className="font-medium text-ink">{r.subject}</p>
                    <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-body-gray">{r.message}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusPill status={r.status === "RESOLVED" ? "Resolved" : "Open"} variant={r.status === "RESOLVED" ? "ok" : "warn"} />
                    {r.handledBy && (
                      <p className="mt-1 text-xs text-stone">
                        by {[r.handledBy.firstName, r.handledBy.lastName].filter(Boolean).join(" ") || r.handledBy.username}
                      </p>
                    )}
                  </td>
                  <td className="num px-5 py-3.5 text-right text-xs text-body-gray" title={formatDateTime(r.createdAt)}>
                    {timeAgo(r.createdAt)}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => void setStatus(r.id, r.status === "RESOLVED" ? "OPEN" : "RESOLVED")}
                      className={r.status === "RESOLVED" ? `${ghostBtn} min-h-[36px] px-3 text-xs` : `${ctaBtn} min-h-[36px] px-3 text-xs`}
                    >
                      {busyId === r.id ? "…" : r.status === "RESOLVED" ? "Reopen" : "Resolve"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────── Root view

export default function Settings() {
  const { user } = useSession();
  const role = user?.role ?? "ADMIN";
  const tabs = ALL_TABS.filter((t) => (t.roles as readonly string[]).includes(role));
  const route = useHashRoute();
  const tabParam = route.params.tab;
  const defaultTab: TabKey = role === "ADMIN" ? "users" : "email";
  const tab: TabKey = tabs.some((t) => t.key === tabParam) ? (tabParam as TabKey) : defaultTab;

  return (
    <div className="space-y-6">
      {/* Enterprise page header (PageHeader) — shared anatomy across all views */}
      <PageHeader
        title="Settings"
        description="Manage accounts, review the audit trail, and configure notification channels."
      />

      <div className="grid gap-6 lg:grid-cols-[240px_1fr] lg:items-start">
        {/* Left vertical tab rail (white card); horizontal scroll pills on mobile.
            min-w-0: the nowrap tab buttons' min-content must not widen the auto
            track on phones (observed OV 231-286 at 320/375). */}
        {/* dlg-card-plain (not dlg-card): .dlg-card sets position:relative in
            unlayered CSS, which would override lg:sticky from the utilities
            layer and silently kill the desktop pin. */}
        <nav className="dlg-card-plain min-w-0 p-2 lg:sticky lg:top-6" aria-label="Settings sections">
          <div className="flex gap-1 overflow-x-auto scroll-thin lg:flex-col lg:overflow-visible">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => navigate("settings", { tab: t.key })}
                aria-current={tab === t.key ? "page" : undefined}
                className={`focus-ring inline-flex h-11 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-4 text-sm transition-colors ${
                  tab === t.key ? "bg-cloud text-ink" : "text-stone hover:bg-fog hover:text-ink"
                }`}
              >
                <t.icon className="h-4 w-4 shrink-0" aria-hidden />
                {t.label}
              </button>
            ))}
          </div>
        </nav>

        <div className="min-w-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {tab === "users" && <UsersPanel />}
          {tab === "audit" && <AuditPanel />}
          {tab === "sms" && <MessagingPanel kind="sms" />}
          {tab === "email" && <MessagingPanel kind="email" readOnly={role !== "ADMIN"} />}
          {tab === "contact" && <ContactPanel />}
        </div>
      </div>
    </div>
  );
}
