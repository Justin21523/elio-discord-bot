export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string };

export async function apiGet<T>(path: string): Promise<T> {
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
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
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
  const res = await fetch(path, {
    method: "DELETE",
    credentials: "include",
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || json?.ok === false) {
    const msg = json?.error || res.statusText || "Request failed";
    throw new Error(msg);
  }
}

