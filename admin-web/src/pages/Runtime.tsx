import React, { useMemo, useState } from "react";

import { apiPost } from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Card, EmptyState, ErrorBanner, PageHeader } from "../components/ui";
import type { MeResponse } from "../types";

export function RuntimePage(props: { me: MeResponse; selectedGuildId: string }) {
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
      setOutput("Restart triggered. The bot may disconnect briefly while the container restarts.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
      const body =
        scope === "guild"
          ? { scope, guildId: props.selectedGuildId }
          : { scope };
      const result = await apiPost<any>("/api/bot/discord/deploy-commands", body);
      setOutput(JSON.stringify(result, null, 2));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Runtime"
        subtitle="Critical operations: restart bot, deploy slash commands"
      />

      {error ? <ErrorBanner message={error} /> : null}

      {!canUse ? (
        <Card>
          <EmptyState
            title="Forbidden"
            detail="This page requires super_admin access (ADMIN_WEB_SUPER_ADMIN_USER_IDS)."
          />
        </Card>
      ) : (
        <>
          <div className="grid2">
            <Card title="Restart">
              <div className="muted">
                This sends a SIGTERM to the bot process. Docker should restart the container.
              </div>
              <div style={{ marginTop: 10 }}>
                <button
                  className="button danger"
                  type="button"
                  onClick={() => setConfirm({ kind: "restart" })}
                  disabled={busy}
                >
                  Restart bot
                </button>
              </div>
            </Card>

            <Card title="Deploy Slash Commands">
              <div className="muted">
                Selected guild: <span className="monospace">{selectedHint}</span>
              </div>
              <div style={{ marginTop: 10 }} className="rowGap">
                <button
                  className="button primary"
                  type="button"
                  onClick={() => setConfirm({ kind: "deploy", scope: "guild" })}
                  disabled={busy || !props.selectedGuildId}
                  title={!props.selectedGuildId ? "Select a guild first" : undefined}
                >
                  Deploy to selected guild
                </button>
                <button
                  className="button danger"
                  type="button"
                  onClick={() => setConfirm({ kind: "deploy", scope: "global" })}
                  disabled={busy}
                >
                  Deploy globally
                </button>
              </div>
              <div className="muted" style={{ marginTop: 10 }}>
                Global commands can take ~1 hour to propagate.
              </div>
            </Card>
          </div>

          <div style={{ marginTop: 12 }}>
            <Card title="Output">
              <pre className="pre">{output || "—"}</pre>
            </Card>
          </div>
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
    </div>
  );
}

