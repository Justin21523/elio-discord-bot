import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  LinearProgress,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import BarChartRoundedIcon from "@mui/icons-material/BarChartRounded";
import FaceRoundedIcon from "@mui/icons-material/FaceRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import PsychologyRoundedIcon from "@mui/icons-material/PsychologyRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import SettingsSuggestRoundedIcon from "@mui/icons-material/SettingsSuggestRounded";
import TextSnippetRoundedIcon from "@mui/icons-material/TextSnippetRounded";

import { apiGet } from "../api";
import { PageHeader } from "../components/PageHeader";
import type { BotHealth, BotMetrics, LlamaHealth, MeResponse } from "../types";

export function DashboardPage(props: { me: MeResponse; selectedGuildId: string; navigate: (to: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [botHealth, setBotHealth] = useState<BotHealth | null>(null);
  const [botMetrics, setBotMetrics] = useState<BotMetrics | null>(null);
  const [llamaHealth, setLlamaHealth] = useState<LlamaHealth | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [health, metrics, llama] = await Promise.all([
        apiGet<BotHealth>("/api/bot/health"),
        apiGet<BotMetrics>("/api/bot/metrics"),
        apiGet<LlamaHealth>("/api/bot/ai/llama/health"),
      ]);
      setBotHealth(health);
      setBotMetrics(metrics);
      setLlamaHealth(llama);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const topCounters = useMemo(() => {
    const counters = botMetrics?.counters || {};
    return Object.entries(counters)
      .sort((a, b) => (b[1] || 0) - (a[1] || 0))
      .slice(0, 10);
  }, [botMetrics]);

  const maxCounter = useMemo(() => {
    return topCounters.reduce((max, [, v]) => Math.max(max, v || 0), 0);
  }, [topCounters]);

  const botReady = botHealth?.bot?.ready;
  const llamaOk = llamaHealth?.health?.ok;

  return (
    <Stack spacing={2.5}>
      <PageHeader
        title="Dashboard"
        subtitle="System overview and quick actions"
        actions={
          <>
            {props.me.superAdmin ? (
              <Button
                variant="contained"
                startIcon={<SettingsSuggestRoundedIcon />}
                onClick={() => props.navigate("/runtime")}
              >
                Runtime
              </Button>
            ) : null}
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

      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Stack spacing={1.25}>
                <Typography variant="subtitle1" sx={{ fontWeight: 950 }}>
                  Bot
                </Typography>
                {loading ? <Skeleton variant="rounded" height={90} /> : null}
                {!loading ? (
                  <>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 1 }}>
                      {typeof botReady === "boolean" ? (
                        botReady ? (
                          <Chip color="success" label="Ready" variant="outlined" />
                        ) : (
                          <Chip color="error" label="Not ready" variant="outlined" />
                        )
                      ) : (
                        <Chip label="Unknown" variant="outlined" />
                      )}
                      <Chip label={`Guilds: ${botHealth?.bot?.guildCount ?? "—"}`} variant="outlined" />
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      User: <span style={{ fontFamily: "monospace" }}>{botHealth?.bot?.userTag || "—"}</span>
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Node: <span style={{ fontFamily: "monospace" }}>{botHealth?.node?.version || "—"}</span>
                    </Typography>
                  </>
                ) : null}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Stack spacing={1.25}>
                <Typography variant="subtitle1" sx={{ fontWeight: 950 }}>
                  LLM (llama.cpp)
                </Typography>
                {loading ? <Skeleton variant="rounded" height={90} /> : null}
                {!loading ? (
                  <>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 1 }}>
                      {llamaHealth ? (
                        llamaHealth.enabled ? (
                          <Chip color="success" label="Enabled" variant="outlined" />
                        ) : (
                          <Chip color="warning" label="Disabled" variant="outlined" />
                        )
                      ) : (
                        <Chip label="Unknown" variant="outlined" />
                      )}
                      {typeof llamaOk === "boolean" ? (
                        llamaOk ? (
                          <Chip color="success" label="OK" variant="outlined" />
                        ) : (
                          <Chip color="error" label={llamaHealth?.health?.status || "Unhealthy"} variant="outlined" />
                        )
                      ) : (
                        <Chip label="Unknown" variant="outlined" />
                      )}
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      Model: <span style={{ fontFamily: "monospace" }}>{llamaHealth?.health?.model || "—"}</span>
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Server: <span style={{ fontFamily: "monospace" }}>{llamaHealth?.serverUrl || "—"}</span>
                    </Typography>
                    <Button
                      variant="outlined"
                      startIcon={<PsychologyRoundedIcon />}
                      onClick={() => props.navigate("/llm")}
                      sx={{ alignSelf: "flex-start" }}
                    >
                      Open LLM page
                    </Button>
                  </>
                ) : null}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Stack spacing={1.25}>
                <Typography variant="subtitle1" sx={{ fontWeight: 950 }}>
                  Quick Actions
                </Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
                  <Button variant="outlined" startIcon={<GroupsRoundedIcon />} onClick={() => props.navigate("/guilds")}>
                    Guilds
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<ScheduleRoundedIcon />}
                    onClick={() => props.navigate("/schedules")}
                    disabled={!props.selectedGuildId}
                  >
                    Schedules
                  </Button>
                  <Button variant="outlined" startIcon={<FaceRoundedIcon />} onClick={() => props.navigate("/personas")} disabled={!props.selectedGuildId}>
                    Personas
                  </Button>
                  <Button variant="outlined" startIcon={<TextSnippetRoundedIcon />} onClick={() => props.navigate("/rag")} disabled={!props.selectedGuildId}>
                    RAG
                  </Button>
                  <Button variant="outlined" startIcon={<BarChartRoundedIcon />} onClick={() => props.navigate("/metrics")}>
                    Metrics
                  </Button>
                </Stack>

                <Typography variant="caption" color="text.secondary">
                  Selected guild: <span style={{ fontFamily: "monospace" }}>{props.selectedGuildId || "—"}</span>
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Stack spacing={1.25}>
                <Typography variant="subtitle1" sx={{ fontWeight: 950 }}>
                  Top Counters
                </Typography>
                {loading ? <Skeleton variant="rounded" height={220} /> : null}
                {!loading && topCounters.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No counters available yet.
                  </Typography>
                ) : null}
                {!loading ? (
                  <Stack spacing={1}>
                    {topCounters.map(([key, value]) => (
                      <Stack key={key} spacing={0.5}>
                        <Stack direction="row" spacing={1} alignItems="baseline">
                          <Typography variant="body2" sx={{ fontFamily: "monospace", flex: 1 }} noWrap>
                            {key}
                          </Typography>
                          <Typography variant="body2" sx={{ fontFamily: "monospace", fontWeight: 800 }}>
                            {value}
                          </Typography>
                        </Stack>
                        <LinearProgress
                          variant="determinate"
                          value={maxCounter ? Math.round((value / maxCounter) * 100) : 0}
                          sx={{ height: 8, borderRadius: 999 }}
                        />
                      </Stack>
                    ))}
                  </Stack>
                ) : null}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Stack spacing={1.25}>
                <Typography variant="subtitle1" sx={{ fontWeight: 950 }}>
                  Notes
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  For detailed charts, use the Metrics page (Plotly is lazy-loaded there for performance).
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}

