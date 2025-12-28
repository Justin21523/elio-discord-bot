import { demoDelete, demoGet, demoPost, isDemoMode } from "./demo";

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string };

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export async function apiGet<T>(path: string): Promise<T> {
  if (isDemoMode()) return demoGet<T>(path);
  const res = await fetch(path, { credentials: "include" });
  const json = (await res.json().catch(() => ({}))) as ApiResponse<T>;
  if (!res.ok || !(json as any).ok) {
    const msg = (json as any).error || res.statusText || "Request failed";
    throw new Error(msg);
  }
  return (json as any).data as T;
}

export async function apiPost<T>(
  path: string,
  body: unknown
): Promise<T> {
  if (isDemoMode()) return demoPost<T>(path, body);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;

  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as ApiResponse<T>;
  if (!res.ok || !(json as any).ok) {
    const msg = (json as any).error || res.statusText || "Request failed";
    throw new Error(msg);
  }
  return (json as any).data as T;
}

export async function apiDelete(path: string): Promise<void> {
  if (isDemoMode()) return demoDelete(path);
  const headers: Record<string, string> = {};
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;

  const res = await fetch(path, {
    method: "DELETE",
    credentials: "include",
    headers,
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || json?.ok === false) {
    const msg = json?.error || res.statusText || "Request failed";
    throw new Error(msg);
  }
}
