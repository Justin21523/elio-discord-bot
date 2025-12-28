import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import SyncRoundedIcon from "@mui/icons-material/SyncRounded";

import CodeMirror from "@uiw/react-codemirror";
import { markdown as cmMarkdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useColorScheme } from "@mui/material/styles";

import { apiDelete, apiGet, apiPost } from "../api";
import { useToast } from "../AppProviders";
import { DataTable } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { RowActionsMenu } from "../components/RowActionsMenu";
import { SectionAnchors } from "../components/SectionAnchors";
import { setAuditPrefill } from "../util/auditPrefill";
import type { MeResponse, RagReloadResponse, RagSearchResponse, RagSourceDoc, RagSourceRow, RagUpsertResponse } from "../types";

type TabKey = "edit" | "preview" | "test";

export function RagPage(props: { me: MeResponse; selectedGuildId: string; navigate: (to: string) => void }) {
  const toast = useToast();
  const { mode } = useColorScheme();
  const canEdit = Boolean(props.me.superAdmin);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<RagSourceRow[]>([]);

  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftMeta, setDraftMeta] = useState<RagSourceDoc | null>(null);
  const [baseline, setBaseline] = useState("");

  const [tab, setTab] = useState<TabKey>("edit");

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);

  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const [pendingOpenName, setPendingOpenName] = useState<string | null>(null);
  const [pendingNew, setPendingNew] = useState(false);

  const [searchQuery, setSearchQuery] = useState("who is elio?");
  const [topK, setTopK] = useState(3);
  const [minScore, setMinScore] = useState(0.05);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchResults, setSearchResults] = useState<RagSearchResponse["results"]>([]);

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const q = query.trim();
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
  }, [query]);

  const openSource = useCallback(async (name: string) => {
    setError(null);
    try {
      const doc = await apiGet<RagSourceDoc>(`/api/rag/sources/${encodeURIComponent(name)}`);
      setSelectedName(doc.name);
      setDraftName(doc.name);
      setDraftContent(doc.content || "");
      setDraftMeta(doc);
      setBaseline(JSON.stringify({ name: doc.name, content: doc.content || "" }));
      setTab("edit");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const isDirty = useMemo(() => {
    if (!draftName) return false;
    return baseline !== "" && JSON.stringify({ name: draftName.trim(), content: draftContent }) !== baseline;
  }, [baseline, draftContent, draftName]);

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isSave = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s";
      if (!isSave) return;
      if (!canEdit) return;
      if (!draftName) return;
      e.preventDefault();
      setConfirmSaveOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canEdit, draftName]);

  useEffect(() => {
    if (!selectedName) return;
    const stillExists = rows.some((r) => r.name === selectedName);
    if (!stillExists) {
      setSelectedName(null);
      setDraftMeta(null);
      setDraftName("");
      setDraftContent("");
      setBaseline("");
    }
  }, [rows, selectedName]);

  const filenameError = useMemo(() => {
    const name = draftName.trim();
    if (!name) return "Filename is required";
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.md$/.test(name)) return "Must be a safe .md filename (letters/numbers/._-)";
    return null;
  }, [draftName]);

  function applyNewSource() {
    const name = "new_source.md";
    const content = `---\ntitle: \"New Source\"\n---\n\n# New Source\n\nWrite knowledge here.\n`;
    setSelectedName(null);
    setDraftMeta(null);
    setDraftName(name);
    setDraftContent(content);
    setBaseline(JSON.stringify({ name, content }));
    setTab("edit");
    setSearchResults([]);
  }

  function requestOpen(name: string) {
    if (isDirty) {
      setPendingOpenName(name);
      setPendingNew(false);
      setUnsavedOpen(true);
      return;
    }
    void openSource(name);
  }

  function requestNew() {
    if (isDirty) {
      setPendingOpenName(null);
      setPendingNew(true);
      setUnsavedOpen(true);
      return;
    }
    applyNewSource();
  }

  async function saveSource(): Promise<boolean> {
    if (!canEdit) return false;
    setError(null);

    const name = draftName.trim();
    if (!name || filenameError) {
      const msg = filenameError || "Invalid filename";
      setError(msg);
      toast.error(msg);
      return false;
    }
    if (!draftContent.trim()) {
      setError("content is required");
      toast.error("content is required");
      return false;
    }

    setSaving(true);
    try {
      const out = await apiPost<RagUpsertResponse>("/api/rag/sources", { name, content: draftContent });
      toast.push({
        message: out.created ? "Source created." : "Source saved.",
        tone: "success",
        actionLabel: "View audit",
        onAction: () => {
          setAuditPrefill({ action: "rag.upsertSource" });
          props.navigate("/audit");
        },
      });
      await refresh();
      await openSource(out.name);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error(msg);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function deleteSource() {
    if (!canEdit) return;
    if (!selectedName) return;
    setError(null);
    setSaving(true);
    try {
      await apiDelete(`/api/rag/sources/${encodeURIComponent(selectedName)}`);
      toast.push({
        message: "Source deleted.",
        tone: "success",
        actionLabel: "View audit",
        onAction: () => {
          setAuditPrefill({ action: "rag.deleteSource" });
          props.navigate("/audit");
        },
      });
      setConfirmDeleteOpen(false);
      await refresh();
      setSelectedName(null);
      setDraftMeta(null);
      setDraftName("");
      setDraftContent("");
      setBaseline("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error(msg);
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
      toast.push({
        message: "Bot RAG reloaded.",
        tone: "success",
        actionLabel: "View audit",
        onAction: () => {
          setAuditPrefill({ action: "rag.reload" });
          props.navigate("/audit");
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function runSearch() {
    setError(null);
    setSearchBusy(true);
    try {
      const out = await apiPost<RagSearchResponse>("/api/bot/ai/rag/search", {
        query: searchQuery,
        topK,
        minScore,
      });
      setSearchResults(Array.isArray(out.results) ? out.results : []);
      toast.success("Search completed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setSearchResults([]);
    } finally {
      setSearchBusy(false);
    }
  }

  const listColumns = useMemo(() => {
    const mono = { fontFamily: "monospace" } as const;
    return [
      {
        field: "name",
        headerName: "Name",
        flex: 1,
        minWidth: 180,
        renderCell: (p: any) => <span style={mono}>{String(p.value)}</span>,
      },
      { field: "title", headerName: "Title", flex: 1, minWidth: 180, valueGetter: (p: any) => p.row.title || "—" },
      {
        field: "updatedAt",
        headerName: "Updated",
        width: 170,
        renderCell: (p: any) => (
          <Typography variant="body2" color="text.secondary" sx={{ fontFamily: "monospace" }}>
            {p.value ? new Date(String(p.value)).toLocaleString() : "—"}
          </Typography>
        ),
      },
      {
        field: "sizeBytes",
        headerName: "Size",
        width: 110,
        renderCell: (p: any) => (
          <Typography variant="body2" color="text.secondary" sx={{ fontFamily: "monospace" }}>
            {Number(p.value || 0).toLocaleString()}
          </Typography>
        ),
      },
      {
        field: "__actions",
        headerName: "",
        width: 80,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        renderCell: (p: any) => {
          const row = p.row as RagSourceRow;
          return (
            <RowActionsMenu
              actions={[
                { label: "Open", onClick: () => requestOpen(row.name) },
              ]}
            />
          );
        },
      },
    ];
  }, [requestOpen]);

  const resultColumns = useMemo(() => {
    const mono = { fontFamily: "monospace" } as const;
    return [
      { field: "title", headerName: "Title", flex: 1, minWidth: 180 },
      { field: "source", headerName: "Source", width: 220, renderCell: (p: any) => <span style={mono}>{String(p.value)}</span> },
      { field: "score", headerName: "Score", width: 120, renderCell: (p: any) => <span style={mono}>{Number(p.value || 0).toFixed(3)}</span> },
    ];
  }, []);

  const anchors = useMemo(() => {
    return [
      { id: "rag-editor", label: "Editor" },
      { id: "rag-preview", label: "Preview" },
      { id: "rag-test", label: "Query Test" },
    ];
  }, []);

  if (!props.selectedGuildId) {
    return (
      <Stack spacing={2.5}>
        <PageHeader title="RAG" scope="global" subtitle="Manage local markdown knowledge sources + run search tests" />
        <EmptyState title="Select a guild first" detail="Use the Guild selector in the top bar." />
      </Stack>
    );
  }

  return (
    <Stack spacing={2.5}>
      <PageHeader
        title="RAG"
        scope="global"
        subtitle="Manage local markdown sources + run search tests (bot runtime)"
        actions={
          <>
            <Button variant="outlined" startIcon={<RefreshRoundedIcon />} onClick={refresh} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
            {canEdit ? (
              <>
                <Button variant="outlined" startIcon={<SyncRoundedIcon />} onClick={() => void reloadRag()} disabled={saving}>
                  Reload in bot
                </Button>
                <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={requestNew}>
                  New source
                </Button>
              </>
            ) : null}
          </>
        }
      />

      {error ? <Alert severity="error">{error}</Alert> : null}

      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Stack spacing={1.25}>
                <Typography variant="subtitle1" sx={{ fontWeight: 950 }}>
                  Sources
                </Typography>
                <TextField value={query} onChange={(e) => setQuery(e.target.value)} label="Search (server-side)" placeholder="filename or title" />
                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 1 }}>
                  <Chip label={`${rows.length} loaded`} variant="outlined" />
                  {canEdit ? <Chip color="warning" label="edits are global" variant="outlined" /> : <Chip label="read-only" variant="outlined" />}
                </Stack>
                <DataTable
                  rows={rows}
                  columns={listColumns as any}
                  loading={loading}
                  getRowId={(row) => row.name}
                  onRowClick={(p) => requestOpen(String((p.row as any).name))}
                  height={620}
                />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              {!draftName ? (
                <EmptyState title="Select a source" detail="Open one from the list, or create a new source." />
              ) : (
                <Stack spacing={1.5}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 1 }}>
                    {isDirty ? <Chip color="warning" label="Unsaved changes" variant="outlined" /> : <Chip color="success" label="Saved" variant="outlined" />}
                    {draftMeta ? (
                      <Chip label={`${draftMeta.sizeBytes} bytes`} variant="outlined" sx={{ fontFamily: "monospace" }} />
                    ) : null}
                    {!canEdit ? <Chip label="read-only" variant="outlined" /> : null}
                    <Box sx={{ flex: 1 }} />
                    {canEdit ? (
                      <>
                        <Button
                          variant="outlined"
                          color="error"
                          startIcon={<DeleteRoundedIcon />}
                          onClick={() => setConfirmDeleteOpen(true)}
                          disabled={saving || !selectedName}
                        >
                          Delete
                        </Button>
                        <Button
                          variant="contained"
                          startIcon={<SaveRoundedIcon />}
                          onClick={() => setConfirmSaveOpen(true)}
                          disabled={saving}
                        >
                          Save
                        </Button>
                      </>
                    ) : null}
                  </Stack>

                  <Tabs value={tab} onChange={(_, v) => setTab(v as TabKey)} variant="scrollable" allowScrollButtonsMobile>
                    <Tab value="edit" label="Edit" />
                    <Tab value="preview" label="Preview" />
                    <Tab value="test" label="Query test" />
                  </Tabs>

                  <Divider />

                  {tab === "edit" ? (
                    <Stack spacing={1.25} id="rag-editor">
                      <TextField
                        label="Filename"
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        disabled={Boolean(selectedName) || !canEdit}
                        error={Boolean(filenameError)}
                        helperText={filenameError || " "}
                      />
                      <Typography variant="caption" color="text.secondary">
                        Markdown source. Use Ctrl/Cmd+S to save.
                      </Typography>
                      <CodeMirror
                        value={draftContent}
                        height="420px"
                        theme={mode === "dark" ? oneDark : undefined}
                        extensions={[cmMarkdown()]}
                        onChange={(value) => setDraftContent(value)}
                        editable={canEdit}
                      />
                    </Stack>
                  ) : null}

                  {tab === "preview" ? (
                    <Box id="rag-preview" sx={{ p: 1, borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{draftContent}</ReactMarkdown>
                    </Box>
                  ) : null}

                  {tab === "test" ? (
                    <Stack spacing={1.25} id="rag-test">
                      <Typography variant="body2" color="text.secondary">
                        Uses bot runtime bridge. Requires <code>BOT_ADMIN_ENABLED=true</code> (bot) and <code>BOT_ADMIN_URL</code> (admin-web).
                      </Typography>
                      <TextField label="Query" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                      <Grid container spacing={1.5}>
                        <Grid item xs={12} md={6}>
                          <TextField
                            type="number"
                            label="Top K"
                            inputProps={{ min: 1, max: 10 }}
                            value={topK}
                            onChange={(e) => setTopK(Math.max(1, Math.min(10, Number.parseInt(e.target.value || "3", 10) || 3)))}
                          />
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <TextField
                            type="number"
                            label="Min score"
                            inputProps={{ min: 0, max: 1, step: 0.01 }}
                            value={minScore}
                            onChange={(e) => setMinScore(Math.max(0, Math.min(1, Number.parseFloat(e.target.value || "0.05") || 0.05)))}
                          />
                        </Grid>
                      </Grid>
                      <Button variant="contained" onClick={() => void runSearch()} disabled={searchBusy}>
                        {searchBusy ? "Searching…" : "Run search"}
                      </Button>
                      {searchResults.length === 0 && !searchBusy ? (
                        <Typography variant="body2" color="text.secondary">
                          No results.
                        </Typography>
                      ) : null}
                      <DataTable
                        rows={searchResults}
                        columns={resultColumns as any}
                        loading={searchBusy}
                        getRowId={(row) => `${row.source}_${row.title}_${row.score}`}
                        height={420}
                      />
                    </Stack>
                  ) : null}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={2} sx={{ display: { xs: "none", md: "block" } }}>
          <SectionAnchors anchors={anchors} />
        </Grid>
      </Grid>

      <Dialog open={confirmSaveOpen} onClose={() => setConfirmSaveOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 950 }}>Save RAG source?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This updates global knowledge used by the bot. Make sure the markdown is correct.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmSaveOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            startIcon={<SaveRoundedIcon />}
            onClick={async () => {
              const ok = await saveSource();
              if (ok) setConfirmSaveOpen(false);
            }}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 950 }}>Delete source?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This removes the markdown file from the server. This is a high-risk operation.
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            Source: <span style={{ fontFamily: "monospace" }}>{selectedName || "—"}</span>
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmDeleteOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="contained" color="error" startIcon={<DeleteRoundedIcon />} onClick={() => void deleteSource()} disabled={saving}>
            {saving ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={unsavedOpen} onClose={() => setUnsavedOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 950 }}>Unsaved changes</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            You have unsaved changes. Save first, or discard changes to continue.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setUnsavedOpen(false)}>Cancel</Button>
          <Button
            color="warning"
            variant="contained"
            onClick={() => {
              setUnsavedOpen(false);
              if (pendingOpenName) void openSource(pendingOpenName);
              else if (pendingNew) applyNewSource();
              setPendingOpenName(null);
              setPendingNew(false);
            }}
          >
            Discard
          </Button>
          {canEdit ? (
            <Button
              variant="contained"
              onClick={async () => {
                const ok = await saveSource();
                if (!ok) return;
                setUnsavedOpen(false);
                if (pendingOpenName) void openSource(pendingOpenName);
                else if (pendingNew) applyNewSource();
                setPendingOpenName(null);
                setPendingNew(false);
              }}
            >
              Save
            </Button>
          ) : null}
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
