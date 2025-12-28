import React, { useCallback, useEffect, useMemo, useState } from "react";

import { apiGet, apiPost } from "../api";
import { Card, EmptyState, ErrorBanner, PageHeader, Tag } from "../components/ui";
import type { MeResponse, PersonaDoc, PersonaSummary } from "../types";

type PersonaTestResult =
  | { ok: true; data: { text?: string; ragSources?: string[] } & Record<string, unknown> }
  | { ok: false; error: { message?: string } & Record<string, unknown> };

export function PersonasPage(props: { me: MeResponse; selectedGuildId: string }) {
  const canEdit = Boolean(props.me.superAdmin);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [filter, setFilter] = useState("");
  const [rows, setRows] = useState<PersonaSummary[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PersonaDoc | null>(null);
  const [traitsText, setTraitsText] = useState<string>("{}");
  const [saving, setSaving] = useState(false);

  const [testMessage, setTestMessage] = useState("hey! what should we do today?");
  const [testUseRag, setTestUseRag] = useState(true);
  const [testMaxTokens, setTestMaxTokens] = useState(80);
  const [testTemperature, setTestTemperature] = useState(0.9);
  const [testOutput, setTestOutput] = useState<string>("");
  const [testBusy, setTestBusy] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const q = filter.trim();
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (canEdit) params.set("includeDisabled", "true");
      const list = await apiGet<PersonaSummary[]>(`/api/personas?${params.toString()}`);
      setRows(Array.isArray(list) ? list : []);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [canEdit, filter]);

  const loadPersona = useCallback(async (id: string) => {
    setError(null);
    try {
      const doc = await apiGet<PersonaDoc>(`/api/personas/${encodeURIComponent(id)}`);
      setSelectedId(id);
      setDraft(doc);
      setTraitsText(JSON.stringify(doc?.traits || {}, null, 2));
      setTestOutput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selectedId) return;
    const stillExists = rows.some((r) => r.id === selectedId);
    if (!stillExists) {
      setSelectedId(null);
      setDraft(null);
    }
  }, [rows, selectedId]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const h = `${r.name} ${r.description || ""}`.toLowerCase();
      return h.includes(q);
    });
  }, [filter, rows]);

  const draftOpeners = useMemo(() => (draft?.openers || []).join("\n"), [draft?.openers]);
  const draftLikes = useMemo(() => (draft?.likes || []).join("\n"), [draft?.likes]);
  const draftDislikes = useMemo(() => (draft?.dislikes || []).join("\n"), [draft?.dislikes]);
  const traitsStatus = useMemo(() => {
    try {
      const parsed = JSON.parse((traitsText || "").trim() || "{}") as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { ok: false as const, error: "JSON must be an object" };
      }
      return { ok: true as const, value: parsed as Record<string, number> };
    } catch {
      return { ok: false as const, error: "Invalid JSON" };
    }
  }, [traitsText]);

  function newPersona() {
    setSelectedId(null);
    setDraft({
      id: null,
      name: "",
      enabled: true,
      avatar: null,
      avatarUrl: null,
      color: null,
      description: null,
      system_prompt: null,
      openers: [],
      likes: [],
      dislikes: [],
      traits: {},
      personality: null,
      speaking_style: null,
      createdAt: null,
      updatedAt: null,
    });
    setTraitsText("{}");
    setTestOutput("");
  }

  async function onSave() {
    if (!draft) return;
    if (!canEdit) return;

    const name = draft.name.trim();
    if (!name) {
      setError("name is required");
      return;
    }

    if (!traitsStatus.ok) {
      setError(`traits: ${traitsStatus.error}`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        name,
        enabled: draft.enabled,
        avatar: draft.avatar,
        avatarUrl: draft.avatarUrl,
        color: draft.color,
        description: draft.description,
        system_prompt: draft.system_prompt,
        openers: draft.openers,
        likes: draft.likes,
        dislikes: draft.dislikes,
        traits: traitsStatus.value,
        personality: draft.personality,
        speaking_style: draft.speaking_style,
      };

      if (draft.id) {
        const updated = await apiPost<PersonaDoc>(`/api/personas/${encodeURIComponent(draft.id)}`, payload);
        setDraft(updated);
        setTraitsText(JSON.stringify(updated?.traits || {}, null, 2));
        await refresh();
      } else {
        const created = await apiPost<{ id: string }>(`/api/personas`, payload);
        await refresh();
        if (created?.id) {
          await loadPersona(created.id);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    if (!draft) return;
    if (!draft.name.trim()) {
      setError("Select a persona first");
      return;
    }
    setError(null);
    setTestBusy(true);
    setTestOutput("");
    try {
      const result = await apiPost<PersonaTestResult>("/api/bot/ai/persona/reply", {
        personaName: draft.name,
        message: testMessage,
        useRag: testUseRag,
        maxTokens: testMaxTokens,
        temperature: testTemperature,
      });

      const text = result?.ok ? String(result.data?.text || "") : "";
      const errMsg =
        !result?.ok
          ? typeof (result as any)?.error?.message === "string"
            ? String((result as any).error.message)
            : typeof (result as any)?.error === "string"
              ? String((result as any).error)
              : "Unknown error"
          : "";
      const sources = result?.ok && Array.isArray((result.data as any)?.ragSources) ? (result.data as any).ragSources : [];

      setTestOutput(
        [
          text ? `Reply:\n${text}` : errMsg ? `Error:\n${errMsg}` : "No reply text returned.",
          sources.length ? `\nRAG sources:\n- ${sources.join("\n- ")}` : "",
          "\nRaw:\n" + JSON.stringify(result, null, 2),
        ]
          .filter(Boolean)
          .join("\n")
      );
    } catch (e) {
      setTestOutput(e instanceof Error ? e.message : String(e));
    } finally {
      setTestBusy(false);
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Personas"
        subtitle="Persona catalog (Mongo: personas) + quick LLM reply testbench"
        actions={
          <div className="rowGap">
            <button className="button" type="button" onClick={refresh} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            {canEdit ? (
              <button className="button primary" type="button" onClick={newPersona}>
                New persona
              </button>
            ) : null}
          </div>
        }
      />

      {error ? <ErrorBanner message={error} /> : null}

      {!props.selectedGuildId ? (
        <Card>
          <EmptyState title="Select a guild first" detail="Personas include per-guild settings and testing." />
        </Card>
      ) : (
        <div className="grid2">
          <Card title="Catalog">
            <label>
              <div className="label">Search</div>
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="name or description" />
            </label>
            <div className="muted">
              Showing <span className="monospace">{filtered.length}</span> of{" "}
              <span className="monospace">{rows.length}</span>.
            </div>
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th style={{ width: 110 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.id || p.name} className={p.id === selectedId ? "rowSelected" : undefined}>
                      <td>
                        <div className="cellTitle">{p.name}</div>
                        <div className="cellSub muted">{p.description || "—"}</div>
                      </td>
                      <td>{p.enabled ? <Tag tone="good">enabled</Tag> : <Tag tone="warn">disabled</Tag>}</td>
                      <td className="muted">{p.updatedAt ? new Date(p.updatedAt).toLocaleString() : "—"}</td>
                      <td>
                        <button className="button" type="button" onClick={() => (p.id ? loadPersona(p.id) : null)} disabled={!p.id}>
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="muted">
                        No personas
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Editor">
            {!draft ? (
              <EmptyState title="Select a persona" detail="Pick one from the catalog, or create a new persona." />
            ) : (
              <>
                {!canEdit ? (
                  <div className="muted">Read-only. Add your Discord userId to `ADMIN_WEB_SUPER_ADMIN_USER_IDS` to edit.</div>
                ) : null}

                <div className="formGrid2">
                  <label>
                    <div className="label">Name</div>
                    <input
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      disabled={!canEdit}
                    />
                  </label>

                  <label>
                    <div className="label">Enabled</div>
                    <select
                      value={draft.enabled ? "yes" : "no"}
                      onChange={(e) => setDraft({ ...draft, enabled: e.target.value === "yes" })}
                      disabled={!canEdit}
                    >
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </label>

                  <label>
                    <div className="label">Color (decimal)</div>
                    <input
                      value={draft.color ?? ""}
                      onChange={(e) => setDraft({ ...draft, color: e.target.value ? Number.parseInt(e.target.value, 10) : null })}
                      disabled={!canEdit}
                      placeholder="3066993"
                    />
                  </label>

                  <label>
                    <div className="label">Avatar URL</div>
                    <input
                      value={draft.avatarUrl || draft.avatar || ""}
                      onChange={(e) => setDraft({ ...draft, avatarUrl: e.target.value, avatar: null })}
                      disabled={!canEdit}
                      placeholder="https://…"
                    />
                  </label>
                </div>

                <label>
                  <div className="label">Description</div>
                  <textarea
                    value={draft.description || ""}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    disabled={!canEdit}
                    rows={3}
                  />
                </label>

                <label>
                  <div className="label">System prompt</div>
                  <textarea
                    value={draft.system_prompt || ""}
                    onChange={(e) => setDraft({ ...draft, system_prompt: e.target.value })}
                    disabled={!canEdit}
                    rows={10}
                  />
                </label>

                <div className="grid2">
                  <label>
                    <div className="label">Openers (one per line)</div>
                    <textarea
                      value={draftOpeners}
                      onChange={(e) => setDraft({ ...draft, openers: splitLines(e.target.value) })}
                      disabled={!canEdit}
                      rows={6}
                    />
                  </label>

                  <label>
                    <div className="label">Traits (JSON)</div>
                    <textarea
                      value={traitsText}
                      onChange={(e) => setTraitsText(e.target.value)}
                      disabled={!canEdit}
                      rows={6}
                    />
                    <div className="rowGap">
                      {traitsStatus.ok ? <Tag tone="good">valid JSON</Tag> : <Tag tone="bad">{traitsStatus.error}</Tag>}
                      <div className="muted">Applied on save.</div>
                    </div>
                  </label>
                </div>

                <div className="grid2">
                  <label>
                    <div className="label">Likes (one per line)</div>
                    <textarea
                      value={draftLikes}
                      onChange={(e) => setDraft({ ...draft, likes: splitLines(e.target.value) })}
                      disabled={!canEdit}
                      rows={5}
                    />
                  </label>
                  <label>
                    <div className="label">Dislikes (one per line)</div>
                    <textarea
                      value={draftDislikes}
                      onChange={(e) => setDraft({ ...draft, dislikes: splitLines(e.target.value) })}
                      disabled={!canEdit}
                      rows={5}
                    />
                  </label>
                </div>

                <div className="grid2">
                  <label>
                    <div className="label">Personality</div>
                    <textarea
                      value={draft.personality || ""}
                      onChange={(e) => setDraft({ ...draft, personality: e.target.value })}
                      disabled={!canEdit}
                      rows={4}
                    />
                  </label>
                  <label>
                    <div className="label">Speaking style</div>
                    <textarea
                      value={draft.speaking_style || ""}
                      onChange={(e) => setDraft({ ...draft, speaking_style: e.target.value })}
                      disabled={!canEdit}
                      rows={4}
                    />
                  </label>
                </div>

                <div className="rowGap" style={{ marginTop: 8 }}>
                  <button className="button primary" type="button" onClick={onSave} disabled={!canEdit || saving}>
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <div className="muted monospace">{draft.id ? `id: ${draft.id}` : "new persona"}</div>
                </div>
              </>
            )}
          </Card>

          <Card title="Testbench">
            {!draft ? (
              <EmptyState title="Select a persona" detail="Pick a persona to run a sample LLM reply." />
            ) : (
              <>
                <div className="muted">
                  Uses bot runtime bridge. Requires `BOT_ADMIN_ENABLED=true` (bot) and `BOT_ADMIN_URL` (admin-web).
                </div>

                <label>
                  <div className="label">Message</div>
                  <textarea value={testMessage} onChange={(e) => setTestMessage(e.target.value)} rows={3} />
                </label>

                <div className="formGrid2">
                  <label>
                    <div className="label">Use RAG</div>
                    <select value={testUseRag ? "yes" : "no"} onChange={(e) => setTestUseRag(e.target.value === "yes")}>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </label>
                  <label>
                    <div className="label">Max tokens</div>
                    <input
                      type="number"
                      min={1}
                      max={256}
                      value={testMaxTokens}
                      onChange={(e) => setTestMaxTokens(clampInt(e.target.value, 1, 256, 80))}
                    />
                  </label>
                  <label>
                    <div className="label">Temperature</div>
                    <input
                      type="number"
                      step="0.05"
                      min={0}
                      max={2}
                      value={testTemperature}
                      onChange={(e) => setTestTemperature(clampFloat(e.target.value, 0, 2, 0.9))}
                    />
                  </label>
                  <div />
                </div>

                <div className="rowGap">
                  <button className="button primary" type="button" onClick={runTest} disabled={testBusy}>
                    {testBusy ? "Running…" : `Run as ${draft.name || "persona"}`}
                  </button>
                </div>

                <pre className="pre">{testOutput || "—"}</pre>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function splitLines(input: string): string[] {
  return input
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const n = Number.parseInt(raw || "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampFloat(raw: string, min: number, max: number, fallback: number): number {
  const n = Number.parseFloat(raw || "");
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
