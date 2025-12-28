import React from "react";

import { Stack } from "@mui/material";

import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";

export function PlaceholderPage(props: { title: string; detail?: string }) {
  return (
    <Stack spacing={2.5}>
      <PageHeader title={props.title} subtitle="Coming soon" />
      <EmptyState title="Not implemented yet" detail={props.detail} />
    </Stack>
  );
}
