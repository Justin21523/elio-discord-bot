export type AuditPrefill = {
  action?: string;
  guildId?: string | null;
  actorUserId?: string;
  risk?: string;
  ok?: string;
};

const KEY = "admin_audit_prefill_v1";

export function setAuditPrefill(prefill: AuditPrefill): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefill));
  } catch {
    // ignore
  }
}

export function consumeAuditPrefill(): AuditPrefill | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    localStorage.removeItem(KEY);
    const parsed = JSON.parse(raw) as AuditPrefill;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

