import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
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

import { apiDelete, apiGet, apiPost } from "../api";
import { useToast } from "../AppProviders";
import { DataTable } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { RowActionsMenu } from "../components/RowActionsMenu";
import type { BotChannel, MeResponse, ScheduleRow } from "../types";

export function SchedulesPage(props: { me: MeResponse; selectedGuildId: string }) {
  const toast = useToast();

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [channels, setChannels] = useState<BotChannel[]>([]);
  const [rows, setRows] = useState<ScheduleRow[]>([]);

  const [kind, setKind] = useState("drop");
  const [hhmm, setHhmm] = useState("09:00");
  const [channelId, setChannelId] = useState("");
  const [enabled, setEnabled] = useState(true);

  const refresh = useCallback(async () => {
    if (!props.selectedGuildId) return;
    setError(null);
    setLoading(true);
    try {
      const [schedules, guildChannels] = await Promise.all([
        apiGet<ScheduleRow[]>(`/api/guilds/${props.selectedGuildId}/schedules`),
        apiGet<BotChannel[]>(`/api/bot/discord/channels?guildId=${encodeURIComponent(props.selectedGuildId)}`),
      ]);
      setRows(schedules);
      setChannels(guildChannels);
      if (!channelId && guildChannels.length > 0) setChannelId(guildChannels[0]!.id);
    } catch (e) {
      setRows([]);
      setChannels([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [channelId, props.selectedGuildId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const channelNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of channels) m.set(c.id, c.name);
    return m;
  }, [channels]);

  async function onSave() {
    if (!props.selectedGuildId) return;
    setError(null);
    try {
      await apiPost(`/api/guilds/${props.selectedGuildId}/schedules`, { kind, hhmm, channelId, enabled });
      toast.success("Schedule saved.");
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error(msg);
    }
  }

  async function onDisable(row: ScheduleRow) {
    if (!props.selectedGuildId) return;
    setError(null);
    try {
      await apiDelete(`/api/guilds/${props.selectedGuildId}/schedules/${encodeURIComponent(row.kind)}`);
      toast.undoable(`Disabled schedule "${row.kind}".`, "Undo", () => void undoDisable(row));
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error(msg);
    }
  }

  async function undoDisable(row: ScheduleRow) {
    if (!props.selectedGuildId) return;
    try {
      await apiPost(`/api/guilds/${props.selectedGuildId}/schedules`, {
        kind: row.kind,
        hhmm: row.hhmm,
        channelId: row.channelId,
        enabled: true,
      });
      toast.success(`Re-enabled "${row.kind}".`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  const columns = useMemo(() => {
    const mono = { fontFamily: "monospace" } as const;
    return [
      { field: "kind", headerName: "Kind", flex: 1, minWidth: 160, renderCell: (p: any) => <span style={mono}>{p.value}</span> },
      { field: "hhmm", headerName: "Time", width: 120, renderCell: (p: any) => <span style={mono}>{p.value}</span> },
      {
        field: "channelId",
        headerName: "Channel",
        flex: 1,
        minWidth: 200,
        renderCell: (p: any) => {
          const id = String(p.value || "");
          const name = channelNameById.get(id);
          return (
            <Stack spacing={0.25} sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontFamily: "monospace" }} noWrap>
                {id}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {name ? `#${name}` : "—"}
              </Typography>
            </Stack>
          );
        },
      },
      {
        field: "enabled",
        headerName: "Status",
        width: 120,
        renderCell: (p: any) => (p.value ? <Chip color="success" label="Enabled" variant="outlined" /> : <Chip color="warning" label="Disabled" variant="outlined" />),
      },
      {
        field: "__actions",
        headerName: "",
        width: 80,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        renderCell: (p: any) => {
          const row = p.row as ScheduleRow;
          return (
            <RowActionsMenu
              actions={[
                {
                  label: "Edit",
                  onClick: () => {
                    setKind(row.kind);
                    setHhmm(row.hhmm);
                    setChannelId(row.channelId);
                    setEnabled(row.enabled);
                    toast.info(`Loaded "${row.kind}" into editor.`);
                  },
                },
                {
                  label: "Disable",
                  tone: "danger",
                  disabled: !row.enabled,
                  onClick: () => void onDisable(row),
                },
              ]}
            />
          );
        },
      },
    ];
  }, [channelNameById, toast]);

  return (
    <Stack spacing={2.5}>
      <PageHeader
        title="Schedules"
        scope="per-guild"
        subtitle="Manage proactive schedules (stored in Mongo, applied to bot scheduler)"
        actions={
          <Button
            variant="outlined"
            startIcon={<RefreshRoundedIcon />}
            onClick={refresh}
            disabled={!props.selectedGuildId || loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      {error ? <Alert severity="error">{error}</Alert> : null}

      {!props.selectedGuildId ? (
        <EmptyState title="Select a guild first" detail="Schedules are per-guild. Use the Guild selector in the top bar." />
      ) : (
        <>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Stack spacing={2}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 950 }}>
                      Create / Update
                    </Typography>
                    <TextField label="Kind" value={kind} onChange={(e) => setKind(e.target.value)} placeholder="drop" />
                    <TextField label="Time (HH:MM)" value={hhmm} onChange={(e) => setHhmm(e.target.value)} placeholder="09:00" />

                    <FormControl size="small">
                      <InputLabel id="schedule-channel-label">Channel</InputLabel>
                      <Select
                        labelId="schedule-channel-label"
                        value={channelId}
                        label="Channel"
                        onChange={(e) => setChannelId(String(e.target.value))}
                      >
                        <MenuItem value="">
                          <em>— Select —</em>
                        </MenuItem>
                        {channels.map((c) => (
                          <MenuItem key={c.id} value={c.id}>
                            #{c.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <FormControl size="small">
                      <InputLabel id="schedule-enabled-label">Enabled</InputLabel>
                      <Select
                        labelId="schedule-enabled-label"
                        value={enabled ? "yes" : "no"}
                        label="Enabled"
                        onChange={(e) => setEnabled(String(e.target.value) === "yes")}
                      >
                        <MenuItem value="yes">Yes</MenuItem>
                        <MenuItem value="no">No</MenuItem>
                      </Select>
                    </FormControl>

                    <Button variant="contained" onClick={() => void onSave()} disabled={!kind.trim() || !hhmm.trim() || !channelId.trim()}>
                      Save
                    </Button>

                    <Typography variant="caption" color="text.secondary">
                      Tip: saving triggers bot scheduler reload for this guild.
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Stack spacing={1}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 950 }}>
                      Active Schedules
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Use the table toolbar to search, sort, and hide columns.
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <DataTable
            rows={rows}
            columns={columns as any}
            loading={loading}
            getRowId={(row) => row.id || `${row.guildId}_${row.kind}`}
            height={640}
          />
        </>
      )}
    </Stack>
  );
}

