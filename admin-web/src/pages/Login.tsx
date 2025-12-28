import React, { useMemo } from "react";

export function LoginPage() {
  const loginUrl = useMemo(() => {
    const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
    return `/auth/discord?returnTo=${returnTo}`;
  }, []);

  return (
    <div className="login">
      <div className="loginCard">
        <div className="loginTitle">Communiverse Bot Admin</div>
        <div className="loginSubtitle">
          Login with Discord to manage your guild bot settings.
        </div>
        <a className="button primary" href={loginUrl}>
          Login with Discord
        </a>
        <div className="loginHint">
          If you don’t see your guild, you likely need <code>Manage Server</code> (or be the owner).
        </div>
      </div>
    </div>
  );
}

