export type RouteId =
  | "dashboard"
  | "guilds"
  | "schedules"
  | "jobs"
  | "llm"
  | "audit"
  | "personas"
  | "rag"
  | "economy"
  | "privacy"
  | "logs"
  | "metrics"
  | "runtime";

export type NavItem = {
  id: RouteId;
  label: string;
  path: string;
  section: string;
  requiresGuild?: boolean;
  superAdminOnly?: boolean;
};

export const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", path: "/dashboard", section: "Overview" },
  { id: "guilds", label: "Guilds", path: "/guilds", section: "Overview" },

  { id: "schedules", label: "Schedules", path: "/schedules", section: "Automation", requiresGuild: true },
  { id: "jobs", label: "Jobs", path: "/jobs", section: "Automation" },

  { id: "llm", label: "LLM (llama.cpp)", path: "/llm", section: "AI" },
  { id: "rag", label: "RAG", path: "/rag", section: "AI", requiresGuild: true },
  { id: "personas", label: "Personas", path: "/personas", section: "AI", requiresGuild: true },

  { id: "economy", label: "Economy / Games", path: "/economy", section: "Economy", requiresGuild: true },
  { id: "privacy", label: "Privacy / Data", path: "/privacy", section: "Privacy", requiresGuild: true },

  { id: "logs", label: "Logs", path: "/logs", section: "Observability", requiresGuild: true },
  { id: "metrics", label: "Metrics", path: "/metrics", section: "Observability" },
  { id: "audit", label: "Audit Log", path: "/audit", section: "Observability" },

  { id: "runtime", label: "Runtime", path: "/runtime", section: "System", superAdminOnly: true },
];

export function normalizePathname(pathname: string): string {
  const raw = (pathname || "/").trim();
  if (!raw.startsWith("/")) return "/";
  if (raw.length > 1 && raw.endsWith("/")) return raw.slice(0, -1);
  return raw;
}

export function getActiveNavItem(pathname: string): NavItem {
  const p = normalizePathname(pathname);
  return navItems.find((it) => it.path === p) || navItems[0]!;
}

