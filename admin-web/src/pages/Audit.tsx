import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";

import { apiGet } from "../api";
import { DataTable } from "../components/DataTable";
import { PageHeader } from "../components/PageHeader";
import { consumeAuditPrefill } from "../util/auditPrefill";
import type { AuditLogRow, AuditRisk, MeResponse } from "../types";

export function AuditPage(props: { me: MeResponse; selectedGuildId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AuditLogRow[]>([]);

  const [guildId, setGuildId] = useState<string>("");
  const [risk, setRisk] = useState<"" | AuditRisk>("");
  const [ok, setOk] = useState<"" | "true" | "false">("");
  const [action, setAction] = useState("");
  const [actorUserId, setActorUserId] = useState("");
  const [limit, setLimit] = useState(100);

  const [metaOpen, setMetaOpen] = useState(false);
  const [metaRow, setMetaRow] = useState<AuditLogRow | null>(null);

  useEffect(() => {
    if (props.selectedGuildId) setGuildId(props.selectedGuildId);
    const prefill = consumeAuditPrefill();
    if (prefill) {
      if (typeof prefill.action === "string") setAction(prefill.action);
      if (typeof prefill.guildId === "string") setGuildId(prefill.guildId);
      if (typeof prefill.actorUserId === "string") setActorUserId(prefill.actorUserId);
      if (typeof prefill.risk === "string") setRisk(prefill.risk as any);
      if (typeof prefill.ok === "string") setOk(prefill.ok as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set("limit", String(limit));
    if (guildId) p.set("guildId", guildId);
    if (risk) p.set("risk", risk);
    if (ok) p.set("ok", ok);
    if (action.trim()) p.set("action", action.trim());
    if (actorUserId.trim()) p.set("actorUserId", actorUserId.trim());
    return `/api/audit?${p.toString()}`;
  }, [action, actorUserId, guildId, limit, ok, risk]);

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const list = await apiGet<AuditLogRow[]>(query);
      setRows(Array.isArray(list) ? list : []);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const columns = useMemo(() => {
    const mono = { fontFamily: "monospace" } as const;
    return [
      {
        field: "ts",
        headerName: "Time",
        width: 190,
        valueGetter: (p: any) => p.row.ts,
        renderCell: (p: any) => <span style={mono}>{new Date(String(p.value)).toLocaleString()}</span>,
      },
      {
        field: "action",
        headerName: "Action",
        flex: 1,
        minWidth: 220,
        renderCell: (p: any) => (
          <Stack spacing={0.25} sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontFamily: "monospace", fontWeight: 800 }} noWrap>
              {String(p.row.action)}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }} noWrap>
              {String(p.row.requestId)}
            </Typography>
          </Stack>
        ),
      },
      {
        field: "risk",
        headerName: "Risk",
        width: 120,
        renderCell: (p: any) => {
          const r = String(p.value || "low");
          if (r === "low") return <Chip label="low" variant="outlined" />;
          if (r === "medium") return <Chip color="warning" label="medium" variant="outlined" />;
          return <Chip color="error" label={r} variant="outlined" />;
        },
      },
      {
        field: "ok",
        headerName: "OK",
        width: 90,
        renderCell: (p: any) => (p.value ? <Chip color="success" label="true" variant="outlined" /> : <Chip color="error" label="false" variant="outlined" />),
      },
      {
        field: "guildId",
        headerName: "Guild",
        width: 170,
        renderCell: (p: any) => <span style={mono}>{String(p.value || "—")}</span>,
      },
      {
        field: "actor",
        headerName: "Actor",
        width: 220,
        sortable: false,
        renderCell: (p: any) => (
          <Stack spacing={0.25} sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontFamily: "monospace" }} noWrap>
              {String(p.row.actor?.userId || "—")}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {p.row.actor?.globalName || `${p.row.actor?.username || "?"}#${p.row.actor?.discriminator || "?"}`}
            </Typography>
          </Stack>
        ),
      },
      {
        field: "meta",
        headerName: "Meta",
        width: 110,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        renderCell: (p: any) => (
          <Button
            size="small"
            variant="outlined"
            startIcon={<VisibilityRoundedIcon />}
            disabled={!p.row.meta}
            onClick={() => {
              setMetaRow(p.row as AuditLogRow);
              setMetaOpen(true);
            }}
          >
            View
          </Button>
        ),
      },
    ];
  }, []);

  return (
    <Stack spacing={2.5}>
      <PageHeader
        title="Audit Log"
        subtitle="State-changing operations and security events"
        actions={
          <Button
            variant="outlined"
            startIcon={<RefreshRoundedIcon />}
            onClick={refresh}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      {error ? <Alert severity="error">{error}</Alert> : null}

      <Grid container spacing={2}>
        <Grid item xs={12} md={8}>
          <CardFilters
            me={props.me}
            guildId={guildId}
            setGuildId={setGuildId}
            risk={risk}
            setRisk={setRisk}
            ok={ok}
            setOk={setOk}
            limit={limit}
            setLimit={setLimit}
            action={action}
            setAction={setAction}
            actorUserId={actorUserId}
            setActorUserId={setActorUserId}
            query={query}
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <Typography variant="body2" color="text.secondary">
            Critical actions are restricted to <code>super_admin</code> users and require CSRF protection.
          </Typography>
        </Grid>
      </Grid>

      <DataTable
        rows={rows}
        columns={columns as any}
        loading={loading}
        getRowId={(row) => row.id || row.requestId}
        height={720}
      />

      <Dialog open={metaOpen} onClose={() => setMetaOpen(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ fontWeight: 950 }}>Audit Meta</DialogTitle>
        <DialogContent>
          <pre style={{ margin: 0, padding: 12, borderRadius: 12, overflow: "auto", background: "rgba(2,6,23,0.9)", color: "#e8eefc", fontSize: 12 }}>
            {metaRow?.meta ? JSON.stringify(metaRow.meta, null, 2) : "—"}
          </pre>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}

function CardFilters(props: {
  me: MeResponse;
  guildId: string;
  setGuildId: (v: string) => void;
  risk: "" | AuditRisk;
  setRisk: (v: "" | AuditRisk) => void;
  ok: "" | "true" | "false";
  setOk: (v: "" | "true" | "false") => void;
  limit: number;
  setLimit: (v: number) => void;
  action: string;
  setAction: (v: string) => void;
  actorUserId: string;
  setActorUserId: (v: string) => void;
  query: string;
}) {
  return (
    <Stack spacing={1.25}>
      <Typography variant="subtitle1" sx={{ fontWeight: 950 }}>
        Filters
      </Typography>
      <Grid container spacing={1.5}>
        <Grid item xs={12} md={6}>
          <FormControl fullWidth size="small">
            <InputLabel id="audit-guild-label">Guild</InputLabel>
            <Select
              labelId="audit-guild-label"
              value={props.guildId}
              label="Guild"
              onChange={(e) => props.setGuildId(String(e.target.value))}
            >
              <MenuItem value="">All accessible</MenuItem>
              {props.me.guilds.map((g) => (
                <MenuItem key={g.id} value={g.id}>
                  {g.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        <Grid item xs={12} md={6}>
          <FormControl fullWidth size="small">
            <InputLabel id="audit-risk-label">Risk</InputLabel>
            <Select labelId="audit-risk-label" value={props.risk} label="Risk" onChange={(e) => props.setRisk(e.target.value as any)}>
              <MenuItem value="">Any</MenuItem>
              <MenuItem value="low">low</MenuItem>
              <MenuItem value="medium">medium</MenuItem>
              <MenuItem value="high">high</MenuItem>
              <MenuItem value="critical">critical</MenuItem>
            </Select>
          </FormControl>
        </Grid>

        <Grid item xs={12} md={6}>
          <FormControl fullWidth size="small">
            <InputLabel id="audit-ok-label">OK</InputLabel>
            <Select labelId="audit-ok-label" value={props.ok} label="OK" onChange={(e) => props.setOk(e.target.value as any)}>
              <MenuItem value="">Any</MenuItem>
              <MenuItem value="true">true</MenuItem>
              <MenuItem value="false">false</MenuItem>
            </Select>
          </FormControl>
        </Grid>

        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            type="number"
            label="Limit"
            value={props.limit}
            inputProps={{ min: 1, max: 200 }}
            onChange={(e) => props.setLimit(Math.max(1, Math.min(200, Number.parseInt(e.target.value || "100", 10))))}
          />
        </Grid>

        <Grid item xs={12} md={6}>
          <TextField fullWidth label="Action" value={props.action} onChange={(e) => props.setAction(e.target.value)} placeholder="schedules.upsert" />
        </Grid>

        <Grid item xs={12} md={6}>
          <TextField fullWidth label="Actor userId" value={props.actorUserId} onChange={(e) => props.setActorUserId(e.target.value)} placeholder="123…" />
        </Grid>
      </Grid>

      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
        {props.query}
      </Typography>
    </Stack>
  );
}

