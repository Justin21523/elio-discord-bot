import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

import { Alert, Button, CssBaseline, Snackbar } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";

import { appTheme } from "./theme";

type ToastTone = "success" | "info" | "warning" | "error";

type Toast = {
  id: string;
  message: string;
  tone: ToastTone;
  durationMs?: number;
  actionLabel?: string;
  onAction?: () => void;
};

type ToastApi = {
  push: (toast: Omit<Toast, "id">) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
  undoable: (message: string, actionLabel: string, onAction: () => void) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within AppProviders");
  return ctx;
}

export function AppProviders(props: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);

  const push = useCallback((input: Omit<Toast, "id">) => {
    setToast({ id: cryptoId(), durationMs: 4500, ...input });
  }, []);

  const api = useMemo<ToastApi>(() => {
    return {
      push,
      success: (message) => push({ message, tone: "success" }),
      error: (message) => push({ message, tone: "error", durationMs: 8000 }),
      info: (message) => push({ message, tone: "info" }),
      warning: (message) => push({ message, tone: "warning" }),
      undoable: (message, actionLabel, onAction) =>
        push({ message, tone: "info", actionLabel, onAction, durationMs: 8000 }),
    };
  }, [push]);

  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <ToastContext.Provider value={api}>
        {props.children}
        <Snackbar
          key={toast?.id || "toast"}
          open={Boolean(toast)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          autoHideDuration={toast?.durationMs || 4500}
          onClose={() => setToast(null)}
        >
          <Alert
            onClose={() => setToast(null)}
            severity={toast?.tone || "info"}
            action={
              toast?.actionLabel && toast?.onAction ? (
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => {
                    try {
                      toast.onAction?.();
                    } finally {
                      setToast(null);
                    }
                  }}
                >
                  {toast.actionLabel}
                </Button>
              ) : undefined
            }
          >
            {toast?.message || ""}
          </Alert>
        </Snackbar>
      </ToastContext.Provider>
    </ThemeProvider>
  );
}

function cryptoId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `t_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  }
}

