import React, { useCallback, useEffect, useMemo, useState } from "react";

import { apiGet, apiPost, setCsrfToken } from "./api";
import { AppShell } from "./components/AppShell";
import { LoginPage } from "./pages/Login";
import { DashboardPage } from "./pages/Dashboard";
import { GuildsPage } from "./pages/Guilds";
import { SchedulesPage } from "./pages/Schedules";
import { JobsPage } from "./pages/Jobs";
import { LlmPage } from "./pages/Llm";
import { AuditPage } from "./pages/Audit";
import { MetricsPage } from "./pages/Metrics";
import { RuntimePage } from "./pages/Runtime";
import { PersonasPage } from "./pages/Personas";
import { PlaceholderPage } from "./pages/Placeholder";
import { normalizePathname } from "./router";
import type { MeResponse } from "./types";

export default function App() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [pathname, setPathname] = useState(() => normalizePathname(window.location.pathname));
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorageBool("admin_sidebar_collapsed", false);
  const [selectedGuildId, setSelectedGuildId] = useLocalStorageString("admin_selected_guild_id", "");

  useEffect(() => {
    const onPop = () => setPathname(normalizePathname(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback(
    (to: string) => {
      const next = normalizePathname(to);
      if (next === pathname) return;
      window.history.pushState({}, "", next);
      setPathname(next);
    },
    [pathname]
  );

  useEffect(() => {
    if (pathname === "/") navigate("/dashboard");
  }, [navigate, pathname]);

  const refreshMe = useCallback(async () => {
    try {
      const data = await apiGet<MeResponse>("/api/me");
      setMe(data);
      setCsrfToken(data.csrfToken || null);

      const allowed = new Set(data.guilds.map((g) => g.id));
      if (selectedGuildId && allowed.has(selectedGuildId)) return;
      setSelectedGuildId(data.guilds[0]?.id || "");
    } catch {
      setMe(null);
      setCsrfToken(null);
    } finally {
      setLoading(false);
    }
  }, [selectedGuildId, setSelectedGuildId]);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  const onLogout = useCallback(async () => {
    try {
      await apiPost("/api/logout", {});
    } catch {
      // ignore
    } finally {
      setCsrfToken(null);
      setMe(null);
      setLoading(false);
      window.location.href = "/";
    }
  }, []);

  const page = useMemo(() => {
    if (!me) return null;

    switch (pathname) {
      case "/dashboard":
        return <DashboardPage me={me} selectedGuildId={selectedGuildId} navigate={navigate} />;
      case "/guilds":
        return (
          <GuildsPage
            me={me}
            selectedGuildId={selectedGuildId}
            setSelectedGuildId={setSelectedGuildId}
            navigate={navigate}
          />
        );
      case "/schedules":
        return <SchedulesPage me={me} selectedGuildId={selectedGuildId} />;
      case "/jobs":
        return <JobsPage />;
      case "/llm":
        return <LlmPage />;
      case "/metrics":
        return <MetricsPage />;
      case "/audit":
        return <AuditPage me={me} selectedGuildId={selectedGuildId} />;
      case "/runtime":
        return <RuntimePage me={me} selectedGuildId={selectedGuildId} />;
      case "/personas":
        return <PersonasPage me={me} selectedGuildId={selectedGuildId} />;
      case "/rag":
        return <PlaceholderPage title="RAG" detail="Next: upload, ingest, reindex, and query test." />;
      case "/economy":
        return (
          <PlaceholderPage title="Economy / Games" detail="Next: points, leaderboard, achievements, and minigame settings." />
        );
      case "/privacy":
        return <PlaceholderPage title="Privacy / Data" detail="Next: user export/delete, retention rules, and opt-out controls." />;
      case "/logs":
        return <PlaceholderPage title="Logs" detail="Next: safe server-side log query/tail endpoint." />;
      default:
        return <PlaceholderPage title="Not Found" detail={`Unknown route: ${pathname}`} />;
    }
  }, [me, navigate, pathname, selectedGuildId, setSelectedGuildId]);

  if (loading) return <div className="boot">Loading…</div>;
  if (!me) return <LoginPage />;

  return (
    <AppShell
      me={me}
      guilds={me.guilds}
      selectedGuildId={selectedGuildId}
      setSelectedGuildId={setSelectedGuildId}
      pathname={pathname}
      navigate={navigate}
      sidebarCollapsed={sidebarCollapsed}
      setSidebarCollapsed={setSidebarCollapsed}
      onLogout={onLogout}
    >
      {page}
    </AppShell>
  );
}

function useLocalStorageBool(key: string, defaultValue: boolean) {
  const [value, setValue] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === "true") return true;
      if (raw === "false") return false;
    } catch {
      // ignore
    }
    return defaultValue;
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      // ignore
    }
  }, [key, value]);

  return [value, setValue] as const;
}

function useLocalStorageString(key: string, defaultValue: string) {
  const [value, setValue] = useState<string>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (typeof raw === "string") return raw;
    } catch {
      // ignore
    }
    return defaultValue;
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore
    }
  }, [key, value]);

  return [value, setValue] as const;
}
