import { createTheme } from "@mui/material/styles";

export const appTheme = createTheme({
  cssVariables: true,
  colorSchemes: {
    light: {
      palette: {
        mode: "light",
        primary: { main: "#2563eb" },
        secondary: { main: "#0ea5e9" },
        error: { main: "#b91c1c" },
        warning: { main: "#b45309" },
        success: { main: "#047857" },
        background: {
          default: "#f8fafc",
          paper: "#ffffff",
        },
      },
    },
    dark: {
      palette: {
        mode: "dark",
        primary: { main: "#60a5fa" },
        secondary: { main: "#38bdf8" },
        error: { main: "#fca5a5" },
        warning: { main: "#fdba74" },
        success: { main: "#6ee7b7" },
        background: {
          default: "#0b1020",
          paper: "#0f172a",
        },
      },
    },
  },
  typography: {
    fontFamily:
      "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    button: { textTransform: "none", fontWeight: 700 },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        "html, body, #root": { height: "100%" },
        body: { margin: 0 },
        code: {
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
        size: "small",
      },
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        size: "small",
      },
    },
    MuiSelect: {
      defaultProps: {
        size: "small",
      },
    },
    MuiChip: {
      defaultProps: {
        size: "small",
      },
    },
    MuiCard: {
      defaultProps: {
        variant: "outlined",
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 14,
        },
      },
    },
    MuiTooltip: {
      defaultProps: {
        arrow: true,
      },
    },
    MuiAlert: {
      defaultProps: {
        variant: "outlined",
      },
    },
  },
});

