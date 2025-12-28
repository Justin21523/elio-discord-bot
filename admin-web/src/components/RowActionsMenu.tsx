import React, { useMemo, useState } from "react";

import {
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
} from "@mui/material";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";

export type RowAction = {
  label: string;
  onClick?: () => void;
  href?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  tone?: "default" | "danger";
};

export function RowActionsMenu(props: { actions: RowAction[]; label?: string }) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const enabledActions = useMemo(() => props.actions.filter((a) => a.label.trim()), [props.actions]);

  return (
    <>
      <Tooltip title={props.label || "Row actions"}>
        <IconButton
          size="small"
          onClick={(e) => setAnchorEl(e.currentTarget)}
          aria-label={props.label || "Row actions"}
        >
          <MoreVertRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        {enabledActions.length === 0 ? (
          <MenuItem disabled>(No actions)</MenuItem>
        ) : (
          enabledActions.map((action) => {
            const item = (
              <MenuItem
                key={action.label}
                disabled={action.disabled}
                onClick={() => {
                  setAnchorEl(null);
                  action.onClick?.();
                }}
                sx={action.tone === "danger" ? { color: "error.main" } : undefined}
                component={action.href ? "a" : "li"}
                href={action.href}
              >
                {action.icon ? <ListItemIcon sx={action.tone === "danger" ? { color: "error.main" } : undefined}>{action.icon}</ListItemIcon> : null}
                <ListItemText>{action.label}</ListItemText>
              </MenuItem>
            );
            return item;
          })
        )}
      </Menu>
    </>
  );
}

