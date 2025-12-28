import React, { useMemo } from "react";

import { enableDemoMode } from "../demo";

export function LoginPage() {
  const loginUrl = useMemo(() => {
    const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
    return `/auth/discord?returnTo=${returnTo}`;
  }, []);

  const demoUrl = useMemo(() => "/?demo=1", []);

  return (
    <div className="login">
      <div className="loginCard">
        <div className="loginTitle">Communiverse Bot Admin</div>
        <div className="loginSubtitle">
          Login with Discord to manage your guild bot settings.
        </div>
        <div className="rowGap">
          <a className="button primary" href={loginUrl}>
            Login with Discord
          </a>
          <button
            className="button"
            type="button"
            onClick={() => {
              enableDemoMode();
              window.location.href = demoUrl;
            }}
          >
            Preview demo
          </button>
        </div>
        <div className="loginHint">
          If you don’t see your guild, you likely need <code>Manage Server</code> (or be the owner).
        </div>
        <div className="loginHint">
          Demo mode uses local fake data (no OAuth, no Mongo). Disable with <code>?demo=0</code>.
        </div>
      </div>
    </div>
  );
}
