import React, { useCallback, useEffect, useMemo, useState } from "react";

import { apiDelete, apiGet, apiPost } from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Card, EmptyState, ErrorBanner, PageHeader, Tag } from "../components/ui";
import type { MeResponse, RagReloadResponse, RagSearchResponse, RagSourceDoc, RagSourceRow, RagUpsertResponse } from "../types";

type ConfirmState =
  | { kind: "delete"; name: string }
  | null;

export function RagPage(props: { me: MeResponse; selectedGuildId: string }) {
  const canEdit = Boolean(props.me.superAdmin);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [filter, setFilter] = useState("");
  const [rows, setRows] = useState<RagSourceRow[]>([]);

  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftMeta, setDraftMeta] = useState<RagSourceDoc | null>(null);

  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const [query, setQuery] = useState("who is elio?");
  const [topK, setTopK] = useState(3);
  const [minScore, setMinScore] = useState(0.05);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchOutput, setSearchOutput] = useState<string>("—");

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const q = filter.trim();
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      const list = await apiGet<RagSourceRow[]>(`/api/rag/sources?${params.toString()}`);
      setRows(Array.isArray(list) ? list : []);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const openSource = useCallback(async (name: string) => {
    setError(null);
    try {
      const doc = await apiGet<RagSourceDoc>(`/api/rag/sources/${encodeURIComponent(name)}`);
      setSelectedName(doc.name);
      setDraftName(doc.name);
      setDraftContent(doc.content || "");
      setDraftMeta(doc);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selectedName) return;
    const stillExists = rows.some((r) => r.name === selectedName);
    if (!stillExists) {
      setSelectedName(null);
      setDraftMeta(null);
      setDraftName("");
      setDraftContent("");
    }
  }, [rows, selectedName]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => `${r.name} ${r.title || ""}`.toLowerCase().includes(q));
  }, [filter, rows]);

  function newSource() {
    setSelectedName(null);
    setDraftMeta(null);
    setDraftName("new_source.md");
    setDraftContent(`---\ntitle: \"New Source\"\n---\n\n# New Source\n\nWrite knowledge here.\n`);
    setSearchOutput("—");
  }

  async function saveSource() {
    if (!canEdit) return;
    setError(null);
    setSaving(true);
    try {
      const name = draftName.trim();
      const content = draftContent;
      const out = await apiPost<RagUpsertResponse>("/api/rag/sources", { name, content });
      await refresh();
      if (out?.name) {
        await openSource(out.name);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function deleteSource(name: string) {
    if (!canEdit) return;
    setError(null);
    setSaving(true);
    try {
      await apiDelete(`/api/rag/sources/${encodeURIComponent(name)}`);
      setConfirm(null);
      await refresh();
      if (selectedName === name) {
        setSelectedName(null);
        setDraftMeta(null);
        setDraftName("");
        setDraftContent("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function reloadRag() {
    if (!canEdit) return;
    setError(null);
    setSaving(true);
    try {
      await apiPost<RagReloadResponse>("/api/bot/ai/rag/reload", {});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function runSearch() {
    setError(null);
    setSearchBusy(true);
    setSearchOutput("—");
    try {
      const out = await apiPost<RagSearchResponse>("/api/bot/ai/rag/search", {
        query,
        topK,
        minScore,
      });
      setSearchOutput(JSON.stringify(out, null, 2));
    } catch (e) {
      setSearchOutput(e instanceof Error ? e.message : String(e));
    } finally {
      setSearchBusy(false);
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="RAG"
        subtitle="Manage local markdown knowledge sources + run search tests (bot runtime)"
        actions={
          <div className="rowGap">
            <button className="button" type="button" onClick={refresh} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            {canEdit ? (
              <>
                <button className="button" type="button" onClick={reloadRag} disabled={saving}>
                  Reload in bot
                </button>
                <button className="button primary" type="button" onClick={newSource}>
                  New source
                </button>
              </>
            ) : null}
          </div>
        }
      />

      {error ? <ErrorBanner message={error} /> : null}

      {!props.selectedGuildId ? (
        <Card>
          <EmptyState title="Select a guild first" detail="Use the Guild selector in the top bar." />
        </Card>
      ) : (
        <div className="grid2">
          <Card title="Sources">
            <label>
              <div className="label">Search</div>
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="filename or title" />
            </label>
            <div className="rowGap">
              <div className="muted">
                Showing <span className="monospace">{filtered.length}</span> of{" "}
                <span className="monospace">{rows.length}</span>.
              </div>
              {canEdit ? <Tag tone="warn">edits are global</Tag> : <Tag tone="neutral">read-only</Tag>}
            </div>
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Title</th>
                    <th>Updated</th>
                    <th style={{ width: 110 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.name} className={r.name === selectedName ? "rowSelected" : undefined}>
                      <td className="monospace">{r.name}</td>
                      <td>{r.title || "—"}</td>
                      <td className="muted">{r.updatedAt ? new Date(r.updatedAt).toLocaleString() : "—"}</td>
                      <td>
                        <button className="button" type="button" onClick={() => openSource(r.name)}>
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="muted">
                        No sources
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Editor">
            {!draftName ? (
              <EmptyState title="Select a source" detail="Open one from the list, or create a new source." />
            ) : (
              <>
                {!canEdit ? (
                  <div className="muted">Read-only. Add your Discord userId to `ADMIN_WEB_SUPER_ADMIN_USER_IDS` to edit.</div>
                ) : null}

                <label>
                  <div className="label">Filename</div>
                  <input value={draftName} onChange={(e) => setDraftName(e.target.value)} disabled={Boolean(selectedName) || !canEdit} />
                </label>

                <label>
                  <div className="label">Content (markdown)</div>
                  <textarea value={draftContent} onChange={(e) => setDraftContent(e.target.value)} rows={18} disabled={!canEdit} />
                </label>

                <div className="rowGap">
                  <button className="button primary" type="button" onClick={saveSource} disabled={!canEdit || saving}>
                    {saving ? "Saving…" : "Save"}
                  </button>
                  {selectedName && canEdit ? (
                    <button className="button danger" type="button" onClick={() => setConfirm({ kind: "delete", name: selectedName })} disabled={saving}>
                      Delete
                    </button>
                  ) : null}
                  {draftMeta ? (
                    <div className="muted monospace">
                      {draftMeta.sizeBytes} bytes · {new Date(draftMeta.updatedAt).toLocaleString()}
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </Card>

          <Card title="Query Test">
            <div className="muted">
              Uses bot runtime bridge. Requires `BOT_ADMIN_ENABLED=true` (bot) and `BOT_ADMIN_URL` (admin-web).
            </div>

            <label>
              <div className="label">Query</div>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ask about lore…" />
            </label>

            <div className="formGrid2">
              <label>
                <div className="label">Top K</div>
                <input type="number" min={1} max={10} value={topK} onChange={(e) => setTopK(Number.parseInt(e.target.value || "3", 10) || 3)} />
              </label>
              <label>
                <div className="label">Min score</div>
                <input type="number" step="0.01" min={0} max={1} value={minScore} onChange={(e) => setMinScore(Number.parseFloat(e.target.value || "0.05") || 0.05)} />
              </label>
              <div />
              <div />
            </div>

            <div className="rowGap">
              <button className="button primary" type="button" onClick={runSearch} disabled={searchBusy}>
                {searchBusy ? "Searching…" : "Run search"}
              </button>
            </div>

            <pre className="pre">{searchOutput}</pre>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={confirm?.kind === "delete"}
        title="Delete RAG source?"
        description="This removes the markdown file from the server. This is a high-risk operation."
        phrase={confirm?.kind === "delete" ? confirm.name : undefined}
        confirmLabel="Delete"
        confirmTone="danger"
        busy={saving}
        onCancel={() => setConfirm(null)}
        onConfirm={() => (confirm?.kind === "delete" ? void deleteSource(confirm.name) : undefined)}
      />
    </div>
  );
}

