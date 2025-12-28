import React from "react";

export function PageHeader(props: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="pageHeader">
      <div>
        <h1 className="pageTitle">{props.title}</h1>
        {props.subtitle ? <div className="pageSubtitle">{props.subtitle}</div> : null}
      </div>
      {props.actions ? <div className="pageActions">{props.actions}</div> : null}
    </div>
  );
}

export function Card(props: { title?: string; children: React.ReactNode }) {
  return (
    <section className="card">
      {props.title ? <div className="cardTitle">{props.title}</div> : null}
      <div className="cardBody">{props.children}</div>
    </section>
  );
}

export function ErrorBanner(props: { message: string }) {
  return (
    <div className="errorBanner" role="alert">
      {props.message}
    </div>
  );
}

export function EmptyState(props: { title: string; detail?: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="emptyTitle">{props.title}</div>
      {props.detail ? <div className="emptyDetail">{props.detail}</div> : null}
      {props.action ? <div className="emptyAction">{props.action}</div> : null}
    </div>
  );
}

export function Tag(props: { tone?: "neutral" | "good" | "warn" | "bad"; children: React.ReactNode }) {
  const className = ["tag", props.tone ? `tag-${props.tone}` : "tag-neutral"].join(" ");
  return <span className={className}>{props.children}</span>;
}

