/**
 * admin-app/http.ts
 * HTTP helpers for the admin service.
 * All code/comments in English only.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

export function sendJson(res: ServerResponse, status: number, body: Json): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

export function sendRedirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { Location: location });
  res.end();
}

export function sendText(res: ServerResponse, status: number, text: string): void {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

export async function readJson<T>(req: IncomingMessage): Promise<T> {
  const raw = await readBody(req);
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
}

export async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const size = chunks.reduce((sum, b) => sum + b.length, 0);
    if (size > 1024 * 1024) throw new Error("Request body too large");
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function parseCookies(req: IncomingMessage): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const out: Record<string, string> = {};
  const parts = header.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(val);
  }
  return out;
}

export function setCookie(
  res: ServerResponse,
  options: {
    name: string;
    value: string;
    httpOnly?: boolean;
    path?: string;
    sameSite?: "Lax" | "Strict" | "None";
    secure?: boolean;
    maxAgeSec?: number;
  }
): void {
  const parts = [`${options.name}=${encodeURIComponent(options.value)}`];
  parts.push(`Path=${options.path || "/"}`);
  if (options.httpOnly !== false) parts.push("HttpOnly");
  parts.push(`SameSite=${options.sameSite || "Lax"}`);
  if (options.secure) parts.push("Secure");
  if (typeof options.maxAgeSec === "number") parts.push(`Max-Age=${options.maxAgeSec}`);

  const existing = res.getHeader("Set-Cookie");
  const next = Array.isArray(existing) ? [...existing, parts.join("; ")] : [parts.join("; ")];
  res.setHeader("Set-Cookie", next);
}

export function clearCookie(
  res: ServerResponse,
  options: { name: string; path?: string; secure?: boolean }
): void {
  const cookie: Parameters<typeof setCookie>[1] = {
    name: options.name,
    value: "",
    maxAgeSec: 0,
  };
  if (typeof options.path === "string") cookie.path = options.path;
  if (options.secure) cookie.secure = true;
  setCookie(res, cookie);
}

export async function tryServeStaticFile(params: {
  reqPath: string;
  rootDir: string;
  res: ServerResponse;
}): Promise<boolean> {
  // Security: disallow path traversal
  const rel = params.reqPath.replace(/^\/+/, "");
  if (rel.includes("..")) return false;

  const filePath = path.join(params.rootDir, rel);
  const normalized = path.normalize(filePath);
  if (!normalized.startsWith(path.normalize(params.rootDir + path.sep))) return false;

  try {
    const stat = await fs.stat(normalized);
    if (!stat.isFile()) return false;

    const ext = path.extname(normalized).toLowerCase();
    const contentType = mimeType(ext);
    const data = await fs.readFile(normalized);
    params.res.writeHead(200, { "Content-Type": contentType });
    params.res.end(data);
    return true;
  } catch {
    return false;
  }
}

function mimeType(ext: string): string {
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".ico":
      return "image/x-icon";
    default:
      return "application/octet-stream";
  }
}
