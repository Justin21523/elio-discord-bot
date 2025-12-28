import React, { useCallback, useEffect, useMemo, useState } from "react";

import { apiGet } from "../api";
import { Card, EmptyState, ErrorBanner, PageHeader, Tag } from "../components/ui";
import type { BotGuild, DiscordGuild, MeResponse } from "../types";

export function GuildsPage(props: {
  me: MeResponse;
  selectedGuildId: string;
  setSelectedGuildId: (guildId: string) => void;
  navigate: (to: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [botGuilds, setBotGuilds] = useState<BotGuild[] | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const list = await apiGet<BotGuild[]>("/api/bot/discord/guilds");
      setBotGuilds(list);
    } catch (e) {
      setBotGuilds(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const botGuildIdSet = useMemo(() => new Set((botGuilds || []).map((g) => g.id)), [botGuilds]);

  return (
    <div className="page">
      <PageHeader
        title="Guilds"
        subtitle="Select a guild, verify bot install, and launch management pages"
        actions={
          <button className="button" type="button" onClick={refresh} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        }
      />

      {error ? <ErrorBanner message={error} /> : null}

      <Card>
        {props.me.guilds.length === 0 ? (
          <EmptyState
            title="No manageable guilds"
            detail="Your Discord account needs Owner / Administrator / Manage Server permissions in a guild to manage it here."
          />
        ) : (
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Guild</th>
                  <th>Role</th>
                  <th>Bot</th>
                  <th style={{ width: 240 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {props.me.guilds.map((g) => (
                  <GuildRow
                    key={g.id}
                    guild={g}
                    selected={props.selectedGuildId === g.id}
                    botInstalled={botGuildIdSet.has(g.id)}
                    onSelect={() => props.setSelectedGuildId(g.id)}
                    onOpen={() => {
                      props.setSelectedGuildId(g.id);
                      props.navigate("/schedules");
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function GuildRow(props: {
  guild: DiscordGuild;
  selected: boolean;
  botInstalled: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const installUrl = useMemo(() => {
    const returnTo = encodeURIComponent("/guilds");
    return `/auth/discord/install?guildId=${encodeURIComponent(props.guild.id)}&returnTo=${returnTo}`;
  }, [props.guild.id]);

  const roleTag =
    props.guild.role === "guild_admin" ? (
      <Tag tone="good">admin</Tag>
    ) : props.guild.role === "guild_manager" ? (
      <Tag tone="neutral">manager</Tag>
    ) : (
      <Tag tone="neutral">member</Tag>
    );

  return (
    <tr className={props.selected ? "rowSelected" : undefined}>
      <td>
        <div className="cellTitle">{props.guild.name}</div>
        <div className="cellSub monospace">{props.guild.id}</div>
      </td>
      <td>{roleTag}</td>
      <td>
        {props.botInstalled ? <Tag tone="good">Installed</Tag> : <Tag tone="warn">Not installed</Tag>}
      </td>
      <td>
        <div className="rowGap">
          <button className="button" type="button" onClick={props.onSelect}>
            Select
          </button>
          <button className="button" type="button" onClick={props.onOpen}>
            Open
          </button>
          {!props.botInstalled ? (
            <a className="button primary" href={installUrl}>
              Install bot
            </a>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

