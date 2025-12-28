import React, { useEffect, useMemo, useState } from "react";
import Plot from "react-plotly.js";
import { apiDelete, apiGet, apiPost } from "./api";

type DiscordUser = {
  id: string;
  username: string;
  discriminator: string;
  global_name?: string | null;
  avatar?: string | null;
};

type DiscordGuild = {
  id: string;
  name: string;
  owner?: boolean;
  permissions?: string;
};

type MeResponse = {
  user: DiscordUser;
  guilds: DiscordGuild[];
};

type ScheduleRow = {
  id: string | null;
  guildId: string;
  channelId: string;
  kind: string;
  hhmm: string;
  enabled: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

type BotMetrics = {
  counters?: Record<string, number>;
};

type BotChannel = { id: string; name: string; type: number };
type BotGuild = { id: string; name: string };

export default function App() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedGuildId, setSelectedGuildId] = useState<string>("");
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [channels, setChannels] = useState<BotChannel[]>([]);
  const [botGuilds, setBotGuilds] = useState<BotGuild[] | null>(null);

  const [newKind, setNewKind] = useState("drop");
  const [newHhmm, setNewHhmm] = useState("09:00");
  const [newChannelId, setNewChannelId] = useState("");

  const [botMetrics, setBotMetrics] = useState<BotMetrics | null>(null);

  const loginUrl = useMemo(() => {
    const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
    return `/auth/discord?returnTo=${returnTo}`;
  }, []);

  const installUrl = useMemo(() => {
    if (!selectedGuildId) return "";
    const returnTo = encodeURIComponent(`/?guildId=${selectedGuildId}`);
    return `/auth/discord/install?guildId=${encodeURIComponent(selectedGuildId)}&returnTo=${returnTo}`;
  }, [selectedGuildId]);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiGet<MeResponse>("/api/me");
        setMe(data);
        const requestedGuildId = new URLSearchParams(window.location.search).get("guildId");
        const canUseRequested =
          requestedGuildId && data.guilds.some((g) => g.id === requestedGuildId);
        setSelectedGuildId(canUseRequested ? requestedGuildId : data.guilds?.[0]?.id || "");
      } catch (e) {
        setMe(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!me) return;
    if (!selectedGuildId) return;

    (async () => {
      setError(null);
      try {
        const rows = await apiGet<ScheduleRow[]>(`/api/guilds/${selectedGuildId}/schedules`);
        setSchedules(rows);
      } catch (e) {
        setSchedules([]);
      }

      try {
        const out = await apiGet<any>(`/api/bot/discord/channels?guildId=${selectedGuildId}`);
        const list = Array.isArray(out?.data) ? out.data : out;
        setChannels(Array.isArray(list) ? list : []);
      } catch {
        setChannels([]);
      }
    })();
  }, [me, selectedGuildId]);

  useEffect(() => {
    if (!me) return;
    (async () => {
      try {
        const out = await apiGet<any>("/api/bot/metrics");
        const data = out?.data ? out.data : out;
        setBotMetrics(data);
      } catch {
        setBotMetrics(null);
      }
    })();
  }, [me]);

  useEffect(() => {
    if (!me) return;
    (async () => {
      try {
        const out = await apiGet<any>("/api/bot/discord/guilds");
        const data = out?.data ? out.data : out;
        const list = Array.isArray(data?.data) ? data.data : data;
        setBotGuilds(Array.isArray(list) ? list : []);
      } catch {
        setBotGuilds(null);
      }
    })();
  }, [me]);

  const isBotInstalled = useMemo(() => {
    if (!selectedGuildId) return false;
    if (!botGuilds) return false;
    return botGuilds.some((g) => g.id === selectedGuildId);
  }, [botGuilds, selectedGuildId]);

  const counterPlot = useMemo(() => {
    const counters = botMetrics?.counters || {};
    const entries = Object.entries(counters).sort((a, b) => b[1] - a[1]).slice(0, 15);
    return {
      x: entries.map(([k]) => k),
      y: entries.map(([, v]) => v),
    };
  }, [botMetrics]);

  async function onCreateSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedGuildId) return;
    setError(null);
    try {
      await apiPost(`/api/guilds/${selectedGuildId}/schedules`, {
        kind: newKind,
        hhmm: newHhmm,
        channelId: newChannelId,
        enabled: true,
      });
      const rows = await apiGet<ScheduleRow[]>(`/api/guilds/${selectedGuildId}/schedules`);
      setSchedules(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onDeleteSchedule(kind: string) {
    if (!selectedGuildId) return;
    setError(null);
    try {
      await apiDelete(`/api/guilds/${selectedGuildId}/schedules/${encodeURIComponent(kind)}`);
      const rows = await apiGet<ScheduleRow[]>(`/api/guilds/${selectedGuildId}/schedules`);
      setSchedules(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onLogout() {
    setError(null);
    try {
      await apiPost("/api/logout", {});
      window.location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (loading) {
    return <div className="container">Loading…</div>;
  }

  if (!me) {
    return (
      <div className="container">
        <h1>Communiverse Bot Admin</h1>
        <p className="muted">Login with Discord to manage your guild bot settings.</p>
        <a className="button" href={loginUrl}>
          Login with Discord
        </a>
      </div>
    );
  }

  return (
    <div className="container">
      <header className="header">
        <div>
          <h1>Communiverse Bot Admin</h1>
          <div className="muted">
            {me.user.global_name || me.user.username}#{me.user.discriminator}
          </div>
        </div>
        <button className="button" onClick={onLogout}>
          Logout
        </button>
      </header>

      {error ? <div className="error">{error}</div> : null}

      <section className="card">
        <h2>Guild</h2>
        <select
          value={selectedGuildId}
          onChange={(e) => setSelectedGuildId(e.target.value)}
        >
          {me.guilds.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} ({g.id})
            </option>
          ))}
        </select>
        {botGuilds ? (
          isBotInstalled ? (
            <div className="muted" style={{ marginTop: 8 }}>
              Bot installed in this guild.
            </div>
          ) : (
            <div className="muted" style={{ marginTop: 8 }}>
              Bot not installed in this guild.{" "}
              <a className="button" href={installUrl} style={{ marginLeft: 8 }}>
                Install bot
              </a>
            </div>
          )
        ) : (
          <div className="muted" style={{ marginTop: 8 }}>
            Bot runtime bridge unavailable (check `BOT_ADMIN_ENABLED` / `BOT_ADMIN_URL`).
          </div>
        )}
      </section>

      <section className="grid">
        <div className="card">
          <h2>Schedules</h2>
          <form className="form" onSubmit={onCreateSchedule}>
            <label>
              Kind
              <select value={newKind} onChange={(e) => setNewKind(e.target.value)}>
                <option value="drop">drop</option>
                <option value="greet">greet</option>
              </select>
            </label>
            <label>
              HH:MM (UTC)
              <input value={newHhmm} onChange={(e) => setNewHhmm(e.target.value)} />
            </label>
            <label>
              Channel
              {channels.length ? (
                <select value={newChannelId} onChange={(e) => setNewChannelId(e.target.value)}>
                  <option value="">Select…</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      #{c.name} ({c.id})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  placeholder="channelId (e.g. 123...)"
                  value={newChannelId}
                  onChange={(e) => setNewChannelId(e.target.value)}
                />
              )}
            </label>
            <button className="button" type="submit">
              Save
            </button>
          </form>

          <div className="list">
            {schedules.length ? (
              schedules.map((s) => (
                <div key={s.kind} className="row">
                  <div className="rowMain">
                    <div className="rowTitle">
                      <code>{s.kind}</code> → <code>{s.hhmm} UTC</code>
                    </div>
                    <div className="muted">
                      channelId: <code>{s.channelId}</code> · {s.enabled ? "enabled" : "disabled"}
                    </div>
                  </div>
                  <button className="button danger" onClick={() => onDeleteSchedule(s.kind)}>
                    Delete
                  </button>
                </div>
              ))
            ) : (
              <div className="muted">No schedules</div>
            )}
          </div>
        </div>

        <div className="card">
          <h2>Bot Metrics (Top counters)</h2>
          <div className="muted">
            Requires bot runtime bridge (`BOT_ADMIN_URL` + bot `BOT_ADMIN_ENABLED=true`).
          </div>
          <div style={{ height: 360 }}>
            <Plot
              data={[
                {
                  type: "bar",
                  x: counterPlot.x,
                  y: counterPlot.y,
                } as any,
              ]}
              layout={{
                margin: { l: 40, r: 10, t: 30, b: 120 },
                xaxis: { tickangle: -35 },
                yaxis: { title: "count" },
              }}
              style={{ width: "100%", height: "100%" }}
              config={{ displayModeBar: false }}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
