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
  FormControlLabel,
  Grid,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";

import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";

import { apiGet, apiPost } from "../api";
import { useToast } from "../AppProviders";
import { DataTable } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { RowActionsMenu } from "../components/RowActionsMenu";
import { SectionAnchors } from "../components/SectionAnchors";
import { useColorScheme } from "@mui/material/styles";
import { setAuditPrefill } from "../util/auditPrefill";
import type { MeResponse, PersonaDoc, PersonaSummary } from "../types";

type PersonaTestResult =
  | { ok: true; data: { text?: string; ragSources?: string[] } & Record<string, unknown> }
  | { ok: false; error: { message?: string } & Record<string, unknown> };

type TabKey = "basics" | "prompt" | "traits" | "lists" | "test";

export function PersonasPage(props: { me: MeResponse; selectedGuildId: string; navigate: (to: string) => void }) {
  const toast = useToast();
  const { mode } = useColorScheme();

  const canEdit = Boolean(props.me.superAdmin);

  const [error, setError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [query, setQuery] = useState("");
  const [includeDisabled, setIncludeDisabled] = useState(false);
  const [rows, setRows] = useState<PersonaSummary[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PersonaDoc | null>(null);
  const [traitsText, setTraitsText] = useState<string>("{}");
  const [baseline, setBaseline] = useState<string>("");

  const [tab, setTab] = useState<TabKey>("basics");

  const [testMessage, setTestMessage] = useState("hey! what should we do today?");
  const [testUseRag, setTestUseRag] = useState(true);
  const [testMaxTokens, setTestMaxTokens] = useState(80);
  const [testTemperature, setTestTemperature] = useState(0.9);
  const [testOutput, setTestOutput] = useState<string>("—");
  const [testBusy, setTestBusy] = useState(false);

  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);

  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const [pendingSelectId, setPendingSelectId] = useState<string | null>(null);
  const [pendingNew, setPendingNew] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    setListLoading(true);
    try {
      const q = query.trim();
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (includeDisabled && canEdit) params.set("includeDisabled", "true");
      const list = await apiGet<PersonaSummary[]>(`/api/personas?${params.toString()}`);
      setRows(Array.isArray(list) ? list : []);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setListLoading(false);
    }
  }, [canEdit, includeDisabled, query]);

  const loadPersona = useCallback(async (id: string) => {
    setError(null);
    try {
      const doc = await apiGet<PersonaDoc>(`/api/personas/${encodeURIComponent(id)}`);
      setSelectedId(id);
      setDraft(doc);
      setTraitsText(JSON.stringify(doc?.traits || {}, null, 2));
      setBaseline(buildBaseline(doc, JSON.stringify(doc?.traits || {}, null, 2)));
      setTab("basics");
      setTestOutput("—");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  function createBlankDraft(): PersonaDoc {
    return {
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
    };
  }

  function applyNewPersona() {
    const doc = createBlankDraft();
    setSelectedId(null);
    setDraft(doc);
    setTraitsText("{}");
    setBaseline(buildBaseline(doc, "{}"));
    setTab("basics");
    setTestOutput("—");
  }

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

  const isDirty = useMemo(() => {
    if (!draft) return false;
    const next = buildBaseline(draft, traitsText);
    return baseline !== "" && next !== baseline;
  }, [baseline, draft, traitsText]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
      if (!draft) return;
      e.preventDefault();
      setConfirmSaveOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canEdit, draft]);

  useEffect(() => {
    if (!selectedId) return;
    const stillExists = rows.some((r) => r.id === selectedId);
    if (!stillExists) {
      setSelectedId(null);
      setDraft(null);
      setBaseline("");
    }
  }, [rows, selectedId]);

  function requestSelect(id: string) {
    if (isDirty) {
      setPendingSelectId(id);
      setPendingNew(false);
      setUnsavedOpen(true);
      return;
    }
    void loadPersona(id);
  }

  function requestNew() {
    if (isDirty) {
      setPendingSelectId(null);
      setPendingNew(true);
      setUnsavedOpen(true);
      return;
    }
    applyNewPersona();
  }

  async function onSave(): Promise<boolean> {
    if (!draft) return false;
    if (!canEdit) return false;

    const name = draft.name.trim();
    if (!name) {
      setError("name is required");
      toast.error("name is required");
      return false;
    }

    if (!traitsStatus.ok) {
      setError(`traits: ${traitsStatus.error}`);
      toast.error(`traits: ${traitsStatus.error}`);
      return false;
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
        const nextTraits = JSON.stringify(updated?.traits || {}, null, 2);
        setTraitsText(nextTraits);
        setBaseline(buildBaseline(updated, nextTraits));
        toast.push({
          message: "Persona saved.",
          tone: "success",
          actionLabel: "View audit",
          onAction: () => {
            setAuditPrefill({ action: "personas.update" });
            props.navigate("/audit");
          },
        });
        await refresh();
        return true;
      }

      const created = await apiPost<{ id: string }>(`/api/personas`, payload);
      toast.push({
        message: "Persona created.",
        tone: "success",
        actionLabel: "View audit",
        onAction: () => {
          setAuditPrefill({ action: "personas.create" });
          props.navigate("/audit");
        },
      });
      await refresh();
      if (created?.id) {
        await loadPersona(created.id);
      }
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

  async function runTest() {
    if (!draft) return;
    if (!draft.name.trim()) {
      setError("Select a persona first");
      toast.error("Select a persona first");
      return;
    }
    setError(null);
    setTestBusy(true);
    setTestOutput("—");
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
      toast.success("Test completed.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTestOutput(msg);
      toast.error(msg);
    } finally {
      setTestBusy(false);
    }
  }

  const listColumns = useMemo(() => {
    return [
      {
        field: "name",
        headerName: "Name",
        flex: 1,
        minWidth: 140,
        renderCell: (p: any) => (
          <Stack spacing={0.25} sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 900 }} noWrap>
              {String(p.row.name)}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {p.row.description || "—"}
            </Typography>
          </Stack>
        ),
      },
      {
        field: "enabled",
        headerName: "Status",
        width: 110,
        renderCell: (p: any) => (p.value ? <Chip color="success" label="enabled" variant="outlined" /> : <Chip color="warning" label="disabled" variant="outlined" />),
      },
      {
        field: "updatedAt",
        headerName: "Updated",
        width: 170,
        valueGetter: (p: any) => p.row.updatedAt,
        renderCell: (p: any) => (
          <Typography variant="body2" color="text.secondary" sx={{ fontFamily: "monospace" }}>
            {p.value ? new Date(String(p.value)).toLocaleString() : "—"}
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
          const row = p.row as PersonaSummary;
          return (
            <RowActionsMenu
              actions={[
                {
                  label: "Open",
                  onClick: () => (row.id ? requestSelect(row.id) : undefined),
                  disabled: !row.id,
                },
              ]}
            />
          );
        },
      },
    ];
  }, [requestSelect]);

  const editorAnchors = useMemo(() => {
    return [
      { id: "persona-editor", label: "Editor" },
      { id: "persona-testbench", label: "Testbench" },
    ];
  }, []);

  if (!props.selectedGuildId) {
    return (
      <Stack spacing={2.5}>
        <PageHeader title="Personas" scope="global" subtitle="Persona catalog + quick LLM reply testbench" />
        <EmptyState title="Select a guild first" detail="Personas are global, but the testbench uses the selected guild context." />
      </Stack>
    );
  }

  return (
    <Stack spacing={2.5}>
      <PageHeader
        title="Personas"
        scope="global"
        subtitle="Persona catalog (Mongo: personas) + quick llama.cpp reply testbench"
        actions={
          <>
            <Button variant="outlined" startIcon={<RefreshRoundedIcon />} onClick={refresh} disabled={listLoading}>
              {listLoading ? "Refreshing…" : "Refresh"}
            </Button>
            {canEdit ? (
              <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={requestNew}>
                New persona
              </Button>
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
                  Catalog
                </Typography>
                <TextField value={query} onChange={(e) => setQuery(e.target.value)} label="Search (server-side)" placeholder="name or description" />
                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 1 }}>
                  <Chip label={`${rows.length} loaded`} variant="outlined" />
                  {canEdit ? (
                    <FormControlLabel
                      control={<Switch checked={includeDisabled} onChange={(e) => setIncludeDisabled(e.target.checked)} />}
                      label="Include disabled"
                    />
                  ) : null}
                </Stack>
                <DataTable
                  rows={rows}
                  columns={listColumns as any}
                  loading={listLoading}
                  getRowId={(row) => row.id || row.name}
                  onRowClick={(p) => {
                    const id = String((p.row as any)?.id || "");
                    if (id) requestSelect(id);
                  }}
                  height={620}
                />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card id="persona-editor">
            <CardContent>
              {!draft ? (
                <EmptyState title="Select a persona" detail="Pick one from the catalog, or create a new persona." />
              ) : (
                <Stack spacing={1.5}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 1 }}>
                    {isDirty ? <Chip color="warning" label="Unsaved changes" variant="outlined" /> : <Chip color="success" label="Saved" variant="outlined" />}
                    <Chip label={draft.id ? `id: ${draft.id}` : "new"} variant="outlined" sx={{ fontFamily: "monospace" }} />
                    {!canEdit ? <Chip label="read-only" variant="outlined" /> : null}
                    <Box sx={{ flex: 1 }} />
                    {canEdit ? (
                      <Button
                        variant="contained"
                        startIcon={<SaveRoundedIcon />}
                        onClick={() => setConfirmSaveOpen(true)}
                        disabled={saving}
                      >
                        {saving ? "Saving…" : "Save"}
                      </Button>
                    ) : null}
                  </Stack>

                  <Tabs
                    value={tab}
                    onChange={(_, v) => setTab(v as TabKey)}
                    variant="scrollable"
                    allowScrollButtonsMobile
                  >
                    <Tab value="basics" label="Basics" />
                    <Tab value="prompt" label="Prompt" />
                    <Tab value="traits" label="Traits" />
                    <Tab value="lists" label="Lists" />
                    <Tab value="test" label="Testbench" />
                  </Tabs>

                  <Divider />

                  {tab === "basics" ? (
                    <Stack spacing={1.5}>
                      <TextField
                        label="Name"
                        value={draft.name}
                        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                        disabled={!canEdit}
                        error={!draft.name.trim()}
                        helperText={!draft.name.trim() ? "Required" : " "}
                      />

                      <FormControlLabel
                        control={<Switch checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />}
                        label="Enabled"
                        disabled={!canEdit}
                      />

                      <TextField
                        label="Avatar URL"
                        value={draft.avatarUrl || draft.avatar || ""}
                        onChange={(e) => setDraft({ ...draft, avatarUrl: e.target.value, avatar: null })}
                        disabled={!canEdit}
                        placeholder="https://…"
                      />

                      <TextField
                        label="Color (decimal)"
                        value={draft.color ?? ""}
                        onChange={(e) => setDraft({ ...draft, color: e.target.value ? Number.parseInt(e.target.value, 10) : null })}
                        disabled={!canEdit}
                        placeholder="3066993"
                      />

                      <TextField
                        label="Description"
                        value={draft.description || ""}
                        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                        disabled={!canEdit}
                        multiline
                        minRows={3}
                      />
                    </Stack>
                  ) : null}

                  {tab === "prompt" ? (
                    <Stack spacing={1}>
                      <Typography variant="caption" color="text.secondary">
                        System prompt (supports multi-line). Use Ctrl/Cmd+S to save.
                      </Typography>
                      <CodeMirror
                        value={draft.system_prompt || ""}
                        height="320px"
                        theme={mode === "dark" ? oneDark : undefined}
                        extensions={[markdown()]}
                        onChange={(value) => setDraft({ ...draft, system_prompt: value })}
                        editable={canEdit}
                      />
                    </Stack>
                  ) : null}

                  {tab === "traits" ? (
                    <Stack spacing={1}>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 1 }}>
                        {traitsStatus.ok ? <Chip color="success" label="valid JSON" variant="outlined" /> : <Chip color="error" label={traitsStatus.error} variant="outlined" />}
                        <Typography variant="caption" color="text.secondary">
                          Applied on save.
                        </Typography>
                      </Stack>
                      <CodeMirror
                        value={traitsText}
                        height="320px"
                        theme={mode === "dark" ? oneDark : undefined}
                        extensions={[json()]}
                        onChange={(value) => setTraitsText(value)}
                        editable={canEdit}
                      />
                    </Stack>
                  ) : null}

                  {tab === "lists" ? (
                    <Stack spacing={1.5}>
                      <TextField
                        label="Openers (one per line)"
                        value={(draft.openers || []).join("\n")}
                        onChange={(e) => setDraft({ ...draft, openers: splitLines(e.target.value) })}
                        disabled={!canEdit}
                        multiline
                        minRows={5}
                      />
                      <TextField
                        label="Likes (one per line)"
                        value={(draft.likes || []).join("\n")}
                        onChange={(e) => setDraft({ ...draft, likes: splitLines(e.target.value) })}
                        disabled={!canEdit}
                        multiline
                        minRows={4}
                      />
                      <TextField
                        label="Dislikes (one per line)"
                        value={(draft.dislikes || []).join("\n")}
                        onChange={(e) => setDraft({ ...draft, dislikes: splitLines(e.target.value) })}
                        disabled={!canEdit}
                        multiline
                        minRows={4}
                      />
                    </Stack>
                  ) : null}

                  {tab === "test" ? (
                    <Stack spacing={1.5} id="persona-testbench">
                      <Typography variant="body2" color="text.secondary">
                        Uses bot runtime bridge. Requires <code>BOT_ADMIN_ENABLED=true</code> (bot) and <code>BOT_ADMIN_URL</code> (admin-web).
                      </Typography>

                      <TextField
                        label="Message"
                        value={testMessage}
                        onChange={(e) => setTestMessage(e.target.value)}
                        multiline
                        minRows={3}
                      />

                      <Grid container spacing={1.5}>
                        <Grid item xs={12} md={4}>
                          <FormControlLabel
                            control={<Switch checked={testUseRag} onChange={(e) => setTestUseRag(e.target.checked)} />}
                            label="Use RAG"
                          />
                        </Grid>
                        <Grid item xs={12} md={4}>
                          <TextField
                            type="number"
                            label="Max tokens"
                            inputProps={{ min: 1, max: 256 }}
                            value={testMaxTokens}
                            onChange={(e) => setTestMaxTokens(clampInt(e.target.value, 1, 256, 80))}
                          />
                        </Grid>
                        <Grid item xs={12} md={4}>
                          <TextField
                            type="number"
                            label="Temperature"
                            inputProps={{ min: 0, max: 2, step: 0.05 }}
                            value={testTemperature}
                            onChange={(e) => setTestTemperature(clampFloat(e.target.value, 0, 2, 0.9))}
                          />
                        </Grid>
                      </Grid>

                      <Button
                        variant="contained"
                        startIcon={<PlayArrowRoundedIcon />}
                        onClick={() => void runTest()}
                        disabled={testBusy}
                      >
                        {testBusy ? "Running…" : `Run as ${draft.name || "persona"}`}
                      </Button>

                      <CodeMirror
                        value={testOutput || "—"}
                        height="240px"
                        theme={mode === "dark" ? oneDark : undefined}
                        extensions={[markdown()]}
                        editable={false}
                      />
                    </Stack>
                  ) : null}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={2} sx={{ display: { xs: "none", md: "block" } }}>
          <SectionAnchors anchors={editorAnchors} />
        </Grid>
      </Grid>

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
              if (pendingSelectId) void loadPersona(pendingSelectId);
              else if (pendingNew) applyNewPersona();
              setPendingSelectId(null);
              setPendingNew(false);
            }}
          >
            Discard
          </Button>
          {canEdit ? (
            <Button
              variant="contained"
              onClick={async () => {
                const ok = await onSave();
                if (!ok) return;
                setUnsavedOpen(false);
                if (pendingSelectId) void loadPersona(pendingSelectId);
                else if (pendingNew) applyNewPersona();
                setPendingSelectId(null);
                setPendingNew(false);
              }}
            >
              Save
            </Button>
          ) : null}
        </DialogActions>
      </Dialog>

      <Dialog open={confirmSaveOpen} onClose={() => setConfirmSaveOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 950 }}>Save persona?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This updates global persona behavior used by the bot. Review changes before saving.
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
              const ok = await onSave();
              if (ok) setConfirmSaveOpen(false);
            }}
            disabled={saving || !draft}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
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

function buildBaseline(draft: PersonaDoc, traitsText: string): string {
  const payload = {
    name: draft.name || "",
    enabled: Boolean(draft.enabled),
    avatar: draft.avatar || null,
    avatarUrl: draft.avatarUrl || null,
    color: typeof draft.color === "number" ? draft.color : null,
    description: draft.description || null,
    system_prompt: draft.system_prompt || null,
    openers: Array.isArray(draft.openers) ? draft.openers : [],
    likes: Array.isArray(draft.likes) ? draft.likes : [],
    dislikes: Array.isArray(draft.dislikes) ? draft.dislikes : [],
    traitsText: traitsText || "",
    personality: draft.personality || null,
    speaking_style: draft.speaking_style || null,
  };
  return JSON.stringify(payload);
}
