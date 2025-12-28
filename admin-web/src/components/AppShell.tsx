import React, { useMemo } from "react";

import { getActiveNavItem, navItems, type NavItem } from "../router";
import type { DiscordGuild, MeResponse } from "../types";

type Props = {
  me: MeResponse;
  guilds: DiscordGuild[];
  selectedGuildId: string;
  setSelectedGuildId: (guildId: string) => void;

  pathname: string;
  navigate: (to: string) => void;

  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;

  onLogout: () => void;

  children: React.ReactNode;
};

export function AppShell(props: Props) {
  const active = useMemo(() => getActiveNavItem(props.pathname), [props.pathname]);

  const sections = useMemo(() => {
    const out = new Map<string, NavItem[]>();
    for (const item of navItems) {
      const list = out.get(item.section) || [];
      list.push(item);
      out.set(item.section, list);
    }
    return [...out.entries()];
  }, []);

  const displayName =
    props.me.user.global_name ||
    `${props.me.user.username}#${props.me.user.discriminator}`;

  return (
    <div className={props.sidebarCollapsed ? "shell collapsed" : "shell"}>
      <header className="topbar">
        <button
          className="iconButton"
          type="button"
          onClick={() => props.setSidebarCollapsed(!props.sidebarCollapsed)}
          title={props.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <NavIcon id="menu" />
        </button>

        <button
          className="brand"
          type="button"
          onClick={() => props.navigate("/dashboard")}
          title="Go to Dashboard"
        >
          Communiverse Admin
        </button>

        <div className="topbarSpacer" />

        <div className="topbarControls">
          <label className="selectLabel">
            <span className="selectLabelText">Guild</span>
            <select
              value={props.selectedGuildId}
              onChange={(e) => props.setSelectedGuildId(e.target.value)}
            >
              <option value="">— Select —</option>
              {props.guilds.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>

          <div className="userPill" title={displayName}>
            <div className="userPillName">{displayName}</div>
            {props.me.superAdmin ? <div className="userPillBadge">super</div> : null}
          </div>

          <button className="button" type="button" onClick={props.onLogout}>
            Logout
          </button>
        </div>
      </header>

      <aside className="sidebar" aria-label="Navigation">
        {sections.map(([section, items]) => (
          <div key={section} className="sidebarSection">
            <div className="sidebarSectionTitle">{section}</div>
            <nav className="sidebarNav">
              {items.map((item) => (
                <SidebarItem
                  key={item.id}
                  item={item}
                  active={active.id === item.id}
                  collapsed={props.sidebarCollapsed}
                  hasGuild={Boolean(props.selectedGuildId)}
                  isSuperAdmin={Boolean(props.me.superAdmin)}
                  onNavigate={props.navigate}
                />
              ))}
            </nav>
          </div>
        ))}
      </aside>

      <main className="content" aria-label="Content">
        {props.children}
      </main>
    </div>
  );
}

function SidebarItem(props: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  hasGuild: boolean;
  isSuperAdmin: boolean;
  onNavigate: (to: string) => void;
}) {
  const disabled =
    (props.item.requiresGuild && !props.hasGuild) ||
    (props.item.superAdminOnly && !props.isSuperAdmin);

  const className = [
    "sidebarItem",
    props.active ? "active" : "",
    disabled ? "disabled" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={className}
      onClick={() => (disabled ? null : props.onNavigate(props.item.path))}
      title={props.collapsed ? props.item.label : undefined}
      aria-current={props.active ? "page" : undefined}
      aria-disabled={disabled ? "true" : "false"}
    >
      <span className="sidebarIcon" aria-hidden="true">
        <NavIcon id={props.item.id} />
      </span>
      <span className="sidebarLabel">{props.item.label}</span>
      {disabled ? <span className="sidebarHint">Select guild</span> : null}
    </button>
  );
}

function NavIcon(props: { id: string }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none" as const };

  switch (props.id) {
    case "menu":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "dashboard":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M4 13h7V4H4v9Zm9 7h7V11h-7v9ZM13 4h7v5h-7V4ZM4 20h7v-5H4v5Z" fill="currentColor" />
        </svg>
      );
    case "guilds":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3ZM8 11c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3Zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13Zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5Z" fill="currentColor" />
        </svg>
      );
    case "schedules":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M12 8v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case "jobs":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M6 6h15M6 12h15M6 18h15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M4 6h.01M4 12h.01M4 18h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    case "llm":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M9 3h6v6H9V3Zm-6 6h6v6H3V9Zm12 0h6v6h-6V9ZM9 15h6v6H9v-6Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      );
    case "audit":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M9 3h6l2 2v16H7V3h2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "metrics":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M4 19V5M4 19h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M7 15l3-3 3 2 4-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "runtime":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
  }
}

