import React from "react";

import { List, ListItemButton, ListItemText, Paper, Typography } from "@mui/material";

export type PageAnchor = { id: string; label: string };

export function SectionAnchors(props: { title?: string; anchors: PageAnchor[] }) {
  if (!props.anchors.length) return null;

  return (
    <Paper variant="outlined" sx={{ position: "sticky", top: 120, p: 1 }}>
      <Typography variant="overline" sx={{ px: 1, fontWeight: 900, letterSpacing: 1.2 }}>
        {props.title || "On this page"}
      </Typography>
      <List dense disablePadding>
        {props.anchors.map((a) => (
          <ListItemButton
            key={a.id}
            onClick={() => {
              const el = document.getElementById(a.id);
              if (!el) return;
              el.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            sx={{ borderRadius: 2 }}
          >
            <ListItemText
              primary={<Typography variant="body2">{a.label}</Typography>}
            />
          </ListItemButton>
        ))}
      </List>
    </Paper>
  );
}

