import React from "react";
import { Card, EmptyState, PageHeader } from "../components/ui";

export function PlaceholderPage(props: { title: string; detail?: string }) {
  return (
    <div className="page">
      <PageHeader title={props.title} subtitle="Coming soon" />
      <Card>
        <EmptyState title="Not implemented yet" detail={props.detail} />
      </Card>
    </div>
  );
}

