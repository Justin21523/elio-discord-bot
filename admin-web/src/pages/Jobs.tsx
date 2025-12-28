import React, { useCallback, useEffect, useMemo, useState } from "react";

import { apiGet } from "../api";
import { Card, EmptyState, ErrorBanner, PageHeader } from "../components/ui";

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
  const [filter, setFilter] = useState("");

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

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j) => {
      return (
        j.kind.toLowerCase().includes(q) ||
        j.guildId.includes(q) ||
        j.channelId.includes(q) ||
        j.hhmm.includes(q)
      );
    });
  }, [filter, jobs]);

  return (
    <div className="page">
      <PageHeader
        title="Jobs"
        subtitle="Active cron jobs currently armed in the bot process"
        actions={
          <button className="button" type="button" onClick={refresh} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        }
      />

      {error ? <ErrorBanner message={error} /> : null}

      <div className="grid2">
        <Card title="Filter">
          <label>
            <div className="label">Search</div>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="kind, guildId, channelId…" />
          </label>
          <div className="muted" style={{ marginTop: 10 }}>
            Showing <span className="monospace">{filtered.length}</span> of{" "}
            <span className="monospace">{jobs.length}</span>.
          </div>
        </Card>

        <Card title="Notes">
          <div className="muted">
            Jobs are derived from Mongo schedules (and maintenance jobs). Use the Schedules page to manage per-guild
            schedules.
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 12 }}>
        <Card title="Active Jobs">
          {filtered.length === 0 ? (
            <EmptyState title="No jobs armed" detail="If you expect jobs, check bot logs and schedules." />
          ) : (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Kind</th>
                    <th>Time</th>
                    <th>Guild</th>
                    <th>Channel</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((j, idx) => (
                    <tr key={`${j.guildId}_${j.kind}_${idx}`}>
                      <td className="monospace">{j.kind}</td>
                      <td className="monospace">{j.hhmm}</td>
                      <td className="monospace">{j.guildId}</td>
                      <td className="monospace">{j.channelId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

