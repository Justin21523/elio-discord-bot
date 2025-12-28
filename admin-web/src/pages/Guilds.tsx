import React, { useCallback, useEffect, useMemo, useState } from "react";

import { Alert, Button, Chip, Stack, Typography } from "@mui/material";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";

import { apiGet } from "../api";
import { DataTable } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { RowActionsMenu } from "../components/RowActionsMenu";
import type { BotGuild, DiscordGuild, MeResponse } from "../types";

type Row = DiscordGuild & {
  botInstalled: boolean;
  selected: boolean;
};

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

  const rows = useMemo<Row[]>(() => {
    return props.me.guilds.map((g) => ({
      ...g,
      botInstalled: botGuildIdSet.has(g.id),
      selected: props.selectedGuildId === g.id,
    }));
  }, [botGuildIdSet, props.me.guilds, props.selectedGuildId]);

  const columns = useMemo(() => {
    return [
      {
        field: "name",
        headerName: "Guild",
        flex: 1,
        minWidth: 240,
        sortable: true,
        renderCell: (params: any) => {
          const row = params.row as Row;
          return (
            <Stack spacing={0.25} sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" sx={{ fontWeight: 900 }} noWrap>
                  {row.name}
                </Typography>
                {row.selected ? <Chip size="small" label="Selected" variant="outlined" /> : null}
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }} noWrap>
                {row.id}
              </Typography>
            </Stack>
          );
        },
      },
      {
        field: "role",
        headerName: "Role",
        width: 140,
        sortable: true,
        renderCell: (params: any) => {
          const role = String(params.row.role || "read_only");
          if (role === "guild_admin") return <Chip color="success" label="admin" variant="outlined" />;
          if (role === "guild_manager") return <Chip color="info" label="manager" variant="outlined" />;
          return <Chip label="member" variant="outlined" />;
        },
      },
      {
        field: "botInstalled",
        headerName: "Bot",
        width: 160,
        sortable: true,
        renderCell: (params: any) => {
          const installed = Boolean(params.row.botInstalled);
          return installed ? (
            <Chip color="success" label="Installed" variant="outlined" />
          ) : (
            <Chip color="warning" label="Not installed" variant="outlined" />
          );
        },
      },
      {
        field: "__actions",
        headerName: "",
        width: 80,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        renderCell: (params: any) => {
          const row = params.row as Row;
          const returnTo = encodeURIComponent("/guilds");
          const installUrl = `/auth/discord/install?guildId=${encodeURIComponent(row.id)}&returnTo=${returnTo}`;
          return (
            <RowActionsMenu
              actions={[
                {
                  label: "Select",
                  icon: <SettingsRoundedIcon fontSize="small" />,
                  onClick: () => props.setSelectedGuildId(row.id),
                },
                {
                  label: "Open Schedules",
                  icon: <OpenInNewRoundedIcon fontSize="small" />,
                  onClick: () => {
                    props.setSelectedGuildId(row.id);
                    props.navigate("/schedules");
                  },
                },
                ...(!row.botInstalled
                  ? [
                      {
                        label: "Install bot",
                        icon: <OpenInNewRoundedIcon fontSize="small" />,
                        href: installUrl,
                      },
                    ]
                  : []),
              ]}
            />
          );
        },
      },
    ];
  }, [props]);

  return (
    <Stack spacing={2.5}>
      <PageHeader
        title="Guilds"
        subtitle="Select a guild, verify bot install, and jump to management pages"
        actions={
          <>
            <Button
              variant="outlined"
              startIcon={<RefreshRoundedIcon />}
              onClick={refresh}
              disabled={loading}
            >
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
          </>
        }
      />

      {error ? <Alert severity="error">{error}</Alert> : null}

      {props.me.guilds.length === 0 ? (
        <EmptyState
          title="No manageable guilds"
          detail="Your Discord account needs Owner / Administrator / Manage Server permissions in a guild to manage it here."
        />
      ) : (
        <DataTable
          rows={rows}
          columns={columns as any}
          loading={loading}
          getRowId={(row) => row.id}
          onRowClick={(params) => props.setSelectedGuildId(String((params.row as any)?.id || ""))}
          height={640}
        />
      )}
    </Stack>
  );
}

