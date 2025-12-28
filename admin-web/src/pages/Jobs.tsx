import React, { useCallback, useEffect, useMemo, useState } from "react";

import { Alert, Button, Stack, Typography } from "@mui/material";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";

import { apiGet } from "../api";
import { DataTable } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";

type JobRow = {
  guildId: string;
  channelId: string;
  kind: string;
  hhmm: string;
};

export function JobsPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<JobRow[]>([]);

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const rows = await apiGet<JobRow[]>("/api/bot/scheduler/jobs");
      setJobs(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setJobs([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const columns = useMemo(() => {
    const mono = { fontFamily: "monospace" } as const;
    return [
      { field: "kind", headerName: "Kind", flex: 1, minWidth: 180, renderCell: (p: any) => <span style={mono}>{p.value}</span> },
      { field: "hhmm", headerName: "Time", width: 120, renderCell: (p: any) => <span style={mono}>{p.value}</span> },
      { field: "guildId", headerName: "Guild", width: 190, renderCell: (p: any) => <span style={mono}>{p.value}</span> },
      { field: "channelId", headerName: "Channel", width: 190, renderCell: (p: any) => <span style={mono}>{p.value}</span> },
    ];
  }, []);

  return (
    <Stack spacing={2.5}>
      <PageHeader
        title="Jobs"
        subtitle="Active cron jobs currently armed in the bot process"
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

      <Typography variant="body2" color="text.secondary">
        Jobs are derived from Mongo schedules (and maintenance jobs). Use the Schedules page to manage per-guild schedules.
      </Typography>

      {jobs.length === 0 && !loading ? (
        <EmptyState title="No jobs armed" detail="If you expect jobs, check bot logs and schedules." />
      ) : (
        <DataTable
          rows={jobs}
          columns={columns as any}
          loading={loading}
          getRowId={(row) => `${row.guildId}_${row.kind}_${row.hhmm}_${row.channelId}`}
          height={620}
        />
      )}
    </Stack>
  );
}

