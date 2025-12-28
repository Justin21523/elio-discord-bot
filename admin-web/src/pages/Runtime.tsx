import React, { useMemo, useState } from "react";

import { Alert, Button, Card, CardContent, Grid, Stack, Typography } from "@mui/material";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";

import { apiPost } from "../api";
import { setAuditPrefill } from "../util/auditPrefill";
import { useToast } from "../AppProviders";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import type { MeResponse } from "../types";

export function RuntimePage(props: { me: MeResponse; selectedGuildId: string; navigate: (to: string) => void }) {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState<string>("");

  const [confirm, setConfirm] = useState<
    | null
    | { kind: "restart" }
    | { kind: "deploy"; scope: "guild" | "global" }
  >(null);

  const canUse = Boolean(props.me.superAdmin);

  const selectedHint = useMemo(() => {
    return props.selectedGuildId ? props.selectedGuildId : "No guild selected";
  }, [props.selectedGuildId]);

  async function doRestart() {
    setError(null);
    setBusy(true);
    setOutput("");
    try {
      await apiPost("/api/bot/runtime/restart", {});
      const msg = "Restart triggered. The bot may disconnect briefly while the container restarts.";
      setOutput(msg);
      toast.undoable(msg, "View audit", () => {
        setAuditPrefill({ action: "runtime.restart" });
        props.navigate("/audit");
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function doDeploy(scope: "guild" | "global") {
    setError(null);
    setBusy(true);
    setOutput("");
    try {
      const body = scope === "guild" ? { scope, guildId: props.selectedGuildId } : { scope };
      const result = await apiPost<any>("/api/bot/discord/deploy-commands", body);
      const text = JSON.stringify(result, null, 2);
      setOutput(text);
      toast.undoable("Slash commands deployed.", "View audit", () => {
        setAuditPrefill({ action: "discord.deployCommands" });
        props.navigate("/audit");
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  return (
    <Stack spacing={2.5}>
      <PageHeader
        title="Runtime"
        scope="global"
        subtitle="Critical operations: restart bot, deploy slash commands"
      />

      {error ? <Alert severity="error">{error}</Alert> : null}

      {!canUse ? (
        <EmptyState title="Forbidden" detail="This page requires super_admin access (ADMIN_WEB_SUPER_ADMIN_USER_IDS)." />
      ) : (
        <>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Stack spacing={1.25}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 950 }}>
                      Restart
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      This sends a SIGTERM to the bot process. Docker should restart the container.
                    </Typography>
                    <Button
                      variant="contained"
                      color="error"
                      startIcon={<RestartAltRoundedIcon />}
                      onClick={() => setConfirm({ kind: "restart" })}
                      disabled={busy}
                      sx={{ alignSelf: "flex-start" }}
                    >
                      Restart bot
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Stack spacing={1.25}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 950 }}>
                      Deploy Slash Commands
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Selected guild: <span style={{ fontFamily: "monospace" }}>{selectedHint}</span>
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
                      <Button
                        variant="contained"
                        startIcon={<PlayArrowRoundedIcon />}
                        onClick={() => setConfirm({ kind: "deploy", scope: "guild" })}
                        disabled={busy || !props.selectedGuildId}
                      >
                        Deploy to selected guild
                      </Button>
                      <Button
                        variant="contained"
                        color="error"
                        startIcon={<PlayArrowRoundedIcon />}
                        onClick={() => setConfirm({ kind: "deploy", scope: "global" })}
                        disabled={busy}
                      >
                        Deploy globally
                      </Button>
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      Global commands can take ~1 hour to propagate across Discord.
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Card>
            <CardContent>
              <Stack spacing={1}>
                <Typography variant="subtitle1" sx={{ fontWeight: 950 }}>
                  Output
                </Typography>
                <pre style={{ margin: 0, padding: 12, borderRadius: 12, overflow: "auto", background: "rgba(2,6,23,0.9)", color: "#e8eefc", fontSize: 12 }}>
                  {output || "—"}
                </pre>
              </Stack>
            </CardContent>
          </Card>
        </>
      )}

      <ConfirmDialog
        open={confirm?.kind === "restart"}
        title="Restart bot?"
        description="This will restart the bot container. Ongoing interactions may be interrupted."
        phrase="RESTART"
        confirmLabel="Restart"
        confirmTone="danger"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={doRestart}
      />

      <ConfirmDialog
        open={confirm?.kind === "deploy" && confirm.scope === "guild"}
        title="Deploy commands to this guild?"
        description="This updates guild-scoped slash commands immediately."
        phrase="DEPLOY"
        confirmLabel="Deploy"
        confirmTone="primary"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => doDeploy("guild")}
      />

      <ConfirmDialog
        open={confirm?.kind === "deploy" && confirm.scope === "global"}
        title="Deploy commands globally?"
        description="Global commands can take up to ~1 hour to propagate across Discord."
        phrase="DEPLOY-GLOBAL"
        confirmLabel="Deploy globally"
        confirmTone="danger"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => doDeploy("global")}
      />
    </Stack>
  );
}

