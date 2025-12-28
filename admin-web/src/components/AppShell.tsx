import React, { useCallback, useMemo, useState } from "react";

import {
  AppBar,
  Avatar,
  Box,
  Breadcrumbs,
  Chip,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useColorScheme } from "@mui/material/styles";
import BarChartRoundedIcon from "@mui/icons-material/BarChartRounded";
import Brightness4RoundedIcon from "@mui/icons-material/Brightness4Rounded";
import Brightness7RoundedIcon from "@mui/icons-material/Brightness7Rounded";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import FaceRoundedIcon from "@mui/icons-material/FaceRounded";
import FactCheckRoundedIcon from "@mui/icons-material/FactCheckRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import MonetizationOnRoundedIcon from "@mui/icons-material/MonetizationOnRounded";
import PsychologyRoundedIcon from "@mui/icons-material/PsychologyRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import SecurityRoundedIcon from "@mui/icons-material/SecurityRounded";
import SettingsSuggestRoundedIcon from "@mui/icons-material/SettingsSuggestRounded";
import TextSnippetRoundedIcon from "@mui/icons-material/TextSnippetRounded";
import ViewListRoundedIcon from "@mui/icons-material/ViewListRounded";
import CircleRoundedIcon from "@mui/icons-material/CircleRounded";

import { disableDemoMode, isDemoMode } from "../demo";
import { getActiveNavItem, navItems, type NavItem, type RouteId } from "../router";
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

const DRAWER_WIDTH = 280;
const DRAWER_WIDTH_COLLAPSED = 76;

export function AppShell(props: Props) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [mobileOpen, setMobileOpen] = useState(false);

  const active = useMemo(() => getActiveNavItem(props.pathname), [props.pathname]);
  const sections = useMemo(() => groupNavItems(navItems), []);
  const [navQuery, setNavQuery] = useState("");

  const filteredSections = useMemo(() => {
    const q = navQuery.trim().toLowerCase();
    if (!q) return sections;
    return sections
      .map(([section, items]) => [
        section,
        items.filter((it) => it.label.toLowerCase().includes(q) || it.path.includes(q)),
      ] as const)
      .filter(([, items]) => items.length > 0);
  }, [navQuery, sections]);

  const drawerWidth = isMobile
    ? DRAWER_WIDTH
    : props.sidebarCollapsed
      ? DRAWER_WIDTH_COLLAPSED
      : DRAWER_WIDTH;

  const displayName =
    props.me.user.global_name || `${props.me.user.username}#${props.me.user.discriminator}`;

  const onToggleNav = useCallback(() => {
    if (isMobile) {
      setMobileOpen((v) => !v);
      return;
    }
    props.setSidebarCollapsed(!props.sidebarCollapsed);
  }, [isMobile, props]);

  const contentOffsetSx = useMemo(() => {
    const appBarHeight = 64 + 40;
    return { pt: `${appBarHeight}px` };
  }, []);

  const breadcrumbs = useMemo(() => {
    const items: Array<{ label: string; path?: string }> = [];
    items.push({ label: active.section, path: undefined });
    items.push({ label: active.label, path: active.path });
    return items;
  }, [active]);

  return (
    <Box sx={{ height: "100%", display: "flex", bgcolor: "background.default" }}>
      <AppBar
        position="fixed"
        color="inherit"
        elevation={0}
        sx={{ borderBottom: "1px solid", borderColor: "divider" }}
      >
        <Toolbar sx={{ gap: 1 }}>
          <IconButton
            edge="start"
            color="inherit"
            onClick={onToggleNav}
            aria-label={isMobile ? "Open navigation" : props.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <MenuRoundedIcon />
          </IconButton>

          <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>
            Communiverse Admin
          </Typography>

          <Box sx={{ flex: 1 }} />

          <Stack direction="row" spacing={1} alignItems="center">
            {isDemoMode() ? (
              <>
                <Chip color="warning" label="demo" variant="outlined" />
                <Tooltip title="Exit demo mode">
                  <IconButton
                    color="inherit"
                    onClick={() => {
                      disableDemoMode();
                      window.location.href = "/";
                    }}
                  >
                    <TextSnippetRoundedIcon />
                  </IconButton>
                </Tooltip>
              </>
            ) : null}

            <GuildSelect
              guilds={props.guilds}
              selectedGuildId={props.selectedGuildId}
              onChange={(id) => props.setSelectedGuildId(id)}
            />

            <ColorModeToggle />

            <Tooltip title={displayName}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ pl: 1 }}>
                <Avatar
                  sx={{ width: 28, height: 28 }}
                  alt={displayName}
                  src={props.me.user.avatar ? `https://cdn.discordapp.com/avatars/${props.me.user.id}/${props.me.user.avatar}.png` : undefined}
                />
                {!isMobile ? (
                  <Stack spacing={0} sx={{ lineHeight: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 800, maxWidth: 180 }} noWrap>
                      {props.me.user.global_name || props.me.user.username}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {props.me.superAdmin ? "super_admin" : "admin"}
                    </Typography>
                  </Stack>
                ) : null}
              </Stack>
            </Tooltip>

            <Chip
              label="Logout"
              color="default"
              variant="outlined"
              clickable
              onClick={props.onLogout}
              sx={{ fontWeight: 700 }}
            />
          </Stack>
        </Toolbar>

        <Toolbar variant="dense" sx={{ minHeight: 40 }}>
          <Breadcrumbs aria-label="breadcrumb">
            <Typography variant="caption" color="text.secondary">
              {breadcrumbs[0]?.label || "—"}
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 800 }}>
              {breadcrumbs[1]?.label || "—"}
            </Typography>
          </Breadcrumbs>
        </Toolbar>
      </AppBar>

      <Drawer
        variant={isMobile ? "temporary" : "permanent"}
        open={isMobile ? mobileOpen : true}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        PaperProps={{
          sx: {
            width: drawerWidth,
            overflowX: "hidden",
            borderRight: "1px solid",
            borderColor: "divider",
          },
        }}
      >
        <Toolbar sx={{ minHeight: 64 }} />
        <Toolbar variant="dense" sx={{ minHeight: 40 }} />

        <Box sx={{ p: 1.25, pt: 1, display: "grid", gap: 1 }}>
          {!props.sidebarCollapsed || isMobile ? (
            <TextField
              value={navQuery}
              onChange={(e) => setNavQuery(e.target.value)}
              placeholder="Search pages…"
              size="small"
              inputProps={{ "aria-label": "Search navigation" }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRoundedIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
          ) : (
            <Tooltip title="Search pages">
              <IconButton
                color="inherit"
                onClick={() => props.setSidebarCollapsed(false)}
                aria-label="Expand sidebar to search"
              >
                <SearchRoundedIcon />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        <Divider />

        <Box sx={{ flex: 1, overflowY: "auto" }}>
          <NavList
            activeId={active.id}
            sections={filteredSections}
            collapsed={!isMobile && props.sidebarCollapsed}
            hasGuild={Boolean(props.selectedGuildId)}
            isSuperAdmin={Boolean(props.me.superAdmin)}
            onNavigate={(to) => {
              props.navigate(to);
              if (isMobile) setMobileOpen(false);
            }}
          />
        </Box>
      </Drawer>

      <Box
        component="main"
        sx={{
          flex: 1,
          minWidth: 0,
          ...contentOffsetSx,
          pl: isMobile ? 0 : `${drawerWidth}px`,
        }}
      >
        <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: "auto" }}>
          {props.children}
        </Box>
      </Box>
    </Box>
  );
}

function GuildSelect(props: {
  guilds: DiscordGuild[];
  selectedGuildId: string;
  onChange: (guildId: string) => void;
}) {
  return (
    <FormControl size="small" sx={{ minWidth: 220 }}>
      <Select
        value={props.selectedGuildId}
        onChange={(e) => props.onChange(String(e.target.value))}
        displayEmpty
        renderValue={(value) => {
          if (!value) return <span style={{ opacity: 0.7 }}>Select guild…</span>;
          const g = props.guilds.find((x) => x.id === value);
          return g ? g.name : value;
        }}
      >
        <MenuItem value="">
          <em>— Select —</em>
        </MenuItem>
        {props.guilds.map((g) => (
          <MenuItem key={g.id} value={g.id}>
            {g.name}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

function ColorModeToggle() {
  const { mode, setMode } = useColorScheme();
  const isDark = mode === "dark";
  return (
    <Tooltip title={isDark ? "Switch to light mode" : "Switch to dark mode"}>
      <IconButton
        color="inherit"
        onClick={() => setMode(isDark ? "light" : "dark")}
        aria-label="Toggle color scheme"
      >
        {isDark ? <Brightness7RoundedIcon /> : <Brightness4RoundedIcon />}
      </IconButton>
    </Tooltip>
  );
}

function NavList(props: {
  activeId: RouteId;
  sections: Array<readonly [string, NavItem[]]>;
  collapsed: boolean;
  hasGuild: boolean;
  isSuperAdmin: boolean;
  onNavigate: (to: string) => void;
}) {
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem("admin_nav_sections_v1");
      const parsed = raw ? (JSON.parse(raw) as Record<string, boolean>) : null;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  });

  const toggleSection = useCallback((section: string) => {
    setCollapsedSections((prev) => {
      const next = { ...prev, [section]: !prev[section] };
      try {
        localStorage.setItem("admin_nav_sections_v1", JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  return (
    <List dense disablePadding>
      {props.sections.map(([section, items]) => {
        const isSectionCollapsed = Boolean(collapsedSections[section]);
        const showItems = props.collapsed ? true : !isSectionCollapsed;
        return (
          <Box key={section}>
            {!props.collapsed ? (
              <ListItemButton
                onClick={() => toggleSection(section)}
                sx={{ px: 1.25, py: 0.75 }}
                aria-label={`Toggle ${section} section`}
              >
                <ListItemText
                  primary={
                    <Typography variant="overline" sx={{ letterSpacing: 1.2, fontWeight: 900 }}>
                      {section}
                    </Typography>
                  }
                />
                <Typography variant="caption" color="text.secondary">
                  {isSectionCollapsed ? "show" : "hide"}
                </Typography>
              </ListItemButton>
            ) : null}

            {showItems ? (
              <Box sx={{ px: 0.5, pb: 0.75 }}>
                {items.map((item) => (
                  <NavItemButton
                    key={item.id}
                    item={item}
                    active={props.activeId === item.id}
                    collapsed={props.collapsed}
                    hasGuild={props.hasGuild}
                    isSuperAdmin={props.isSuperAdmin}
                    onNavigate={props.onNavigate}
                  />
                ))}
              </Box>
            ) : null}
            <Divider sx={{ my: 0.75 }} />
          </Box>
        );
      })}
    </List>
  );
}

function NavItemButton(props: {
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

  const content = (
    <ListItemButton
      selected={props.active}
      disabled={disabled}
      onClick={() => (disabled ? null : props.onNavigate(props.item.path))}
      sx={{
        borderRadius: 2,
        px: props.collapsed ? 1.25 : 1.5,
        py: 1,
        justifyContent: props.collapsed ? "center" : "flex-start",
      }}
    >
      <ListItemIcon sx={{ minWidth: props.collapsed ? 0 : 38, justifyContent: "center" }}>
        {navIcon(props.item.id)}
      </ListItemIcon>
      {!props.collapsed ? (
        <ListItemText
          primary={
            <Typography variant="body2" sx={{ fontWeight: 800 }}>
              {props.item.label}
            </Typography>
          }
        />
      ) : null}
    </ListItemButton>
  );

  if (!props.collapsed) return content;
  return <Tooltip title={disabled ? `${props.item.label} (select guild)` : props.item.label}>{content}</Tooltip>;
}

function navIcon(id: RouteId) {
  switch (id) {
    case "dashboard":
      return <DashboardRoundedIcon fontSize="small" />;
    case "guilds":
      return <GroupsRoundedIcon fontSize="small" />;
    case "schedules":
      return <ScheduleRoundedIcon fontSize="small" />;
    case "jobs":
      return <ViewListRoundedIcon fontSize="small" />;
    case "llm":
      return <PsychologyRoundedIcon fontSize="small" />;
    case "rag":
      return <TextSnippetRoundedIcon fontSize="small" />;
    case "personas":
      return <FaceRoundedIcon fontSize="small" />;
    case "economy":
      return <MonetizationOnRoundedIcon fontSize="small" />;
    case "privacy":
      return <SecurityRoundedIcon fontSize="small" />;
    case "logs":
      return <ReceiptLongRoundedIcon fontSize="small" />;
    case "metrics":
      return <BarChartRoundedIcon fontSize="small" />;
    case "audit":
      return <FactCheckRoundedIcon fontSize="small" />;
    case "runtime":
      return <SettingsSuggestRoundedIcon fontSize="small" />;
    default:
      return <CircleRoundedIcon fontSize="small" />;
  }
}

function groupNavItems(items: NavItem[]): Array<readonly [string, NavItem[]]> {
  const out = new Map<string, NavItem[]>();
  for (const item of items) {
    const list = out.get(item.section) || [];
    list.push(item);
    out.set(item.section, list);
  }
  return [...out.entries()];
}
