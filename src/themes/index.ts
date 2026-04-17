import { createTheme } from "@mui/material/styles"
import type { Shadows } from "@mui/material/styles"

declare module "@mui/material/styles" {
  interface TypeBackground {
    paper2?: string
    paper3?: string
    footer?: string
    sidebar?: string
    sidebarHover?: string
  }
  interface TypeText {
    tertiary?: string
  }
  interface Palette {
    light: Palette["primary"]
    dark: Palette["primary"]
  }
  interface PaletteOptions {
    light?: PaletteOptions["primary"]
    dark?: PaletteOptions["primary"]
  }
}

declare module "@mui/material/Button" {
  interface ButtonPropsColorOverrides {
    light: true
    dark: true
  }
}

const defaultTheme = createTheme()

const FONT_DISPLAY = "'Playfair Display', 'PingFang SC', Georgia, serif"
const FONT_BODY = "'DM Sans', 'PingFang SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

const theme = createTheme({
  cssVariables: true,
  palette: {
    primary: { main: "#C2410C", contrastText: "#fff" },
    error: { main: "#B91C1C" },
    success: { main: "#15803D", light: "#22C55E", dark: "#166534", contrastText: "#fff" },
    warning: { main: "#D97706", light: "#FBBF24", dark: "#92400E", contrastText: "rgba(0,0,0,0.8)" },
    info: { main: "#0369A1", light: "#38BDF8", dark: "#075985", contrastText: "#fff" },
    divider: "rgba(28, 25, 23, 0.07)",
    dark: { main: "#141218", light: "#1F1D26", dark: "#0A090D", contrastText: "#fff" },
    light: { main: "#fff", contrastText: "#1C1917", dark: "#F5F3EF", light: "#fff" },
    background: {
      default: "#FAF9F7",
      paper: "#FFFFFF",
      paper2: "#F5F3EF",
      paper3: "#FAF9F7",
      footer: "#141218",
      sidebar: "#141218",
      sidebarHover: "#1F1D26",
    },
    text: {
      primary: "#1C1917",
      secondary: "#78716C",
      tertiary: "#A8A29E",
      disabled: "#D6D3D1",
    },
  },
  typography: {
    fontFamily: FONT_BODY,
    h4: { fontFamily: FONT_DISPLAY, fontWeight: 700, letterSpacing: "-0.02em" },
    h5: { fontFamily: FONT_DISPLAY, fontWeight: 600, letterSpacing: "-0.01em" },
    h6: { fontFamily: FONT_DISPLAY, fontWeight: 600, letterSpacing: "-0.01em" },
  },
  shape: {
    borderRadius: 10,
  },
  shadows: [
    "none",
    "0 1px 2px rgba(28,25,23,0.04)",
    "0 1px 3px rgba(28,25,23,0.06), 0 1px 2px rgba(28,25,23,0.04)",
    "0 4px 6px -1px rgba(28,25,23,0.06), 0 2px 4px -1px rgba(28,25,23,0.04)",
    "0 10px 15px -3px rgba(28,25,23,0.06), 0 4px 6px -2px rgba(28,25,23,0.04)",
    "0 20px 25px -5px rgba(28,25,23,0.06), 0 10px 10px -5px rgba(28,25,23,0.03)",
    ...defaultTheme.shadows.slice(6),
  ] as Shadows,
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          fontFamily: FONT_BODY,
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
        },
        "*::-webkit-scrollbar": {
          width: 5,
          height: 5,
        },
        "*::-webkit-scrollbar-track": {
          backgroundColor: "transparent",
        },
        "*::-webkit-scrollbar-thumb": {
          backgroundColor: "rgba(28,25,23,0.1)",
          borderRadius: 10,
          "&:hover": {
            backgroundColor: "rgba(28,25,23,0.18)",
          },
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          fontWeight: 500,
          borderRadius: 10,
          textTransform: "none" as const,
          letterSpacing: "0.01em",
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: {
          fontSize: 14,
          borderRadius: "10px !important",
          backgroundColor: "#F5F3EF",
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "transparent !important",
            borderWidth: "1px !important",
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: "#C2410C !important",
            borderWidth: "1.5px !important",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(28,25,23,0.12) !important",
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none" },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
          border: "1px solid rgba(28,25,23,0.07)",
          boxShadow: "0 4px 24px rgba(28,25,23,0.1), 0 0 0 1px rgba(28,25,23,0.03)",
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: { fontSize: 14, borderRadius: 8, mx: 4, px: 8 },
      },
    },
    MuiAutocomplete: {
      styleOverrides: {
        paper: { borderRadius: 12 },
        option: { fontSize: 14 },
      },
    },
    MuiTooltip: {
      defaultProps: { arrow: true },
      styleOverrides: {
        tooltip: {
          backgroundColor: "#1C1917",
          fontSize: "0.75rem",
          fontFamily: FONT_BODY,
          borderRadius: 8,
          padding: "5px 12px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        },
        arrow: {
          color: "#1C1917",
        },
      },
    },
    MuiLink: {
      styleOverrides: {
        root: { textDecoration: "none" },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          backgroundColor: "#F5F3EF",
          borderBottom: "none",
          fontSize: 12,
          height: 44,
          fontWeight: 600,
          color: "#78716C",
          textTransform: "uppercase" as const,
          letterSpacing: "0.05em",
        },
        body: {
          borderBottom: "1px solid rgba(28,25,23,0.07)",
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: { height: 36, borderRadius: "10px !important", backgroundColor: "#F5F3EF" },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 14,
          boxShadow: "0 24px 48px rgba(28,25,23,0.15), 0 0 0 1px rgba(28,25,23,0.05)",
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 2,
          borderRadius: 1,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: "none" as const,
          fontWeight: 500,
          letterSpacing: "0.01em",
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          borderRadius: "10px !important",
          textTransform: "none" as const,
          fontWeight: 500,
          letterSpacing: "0.01em",
          "&.Mui-selected": {
            backgroundColor: "rgba(194, 65, 12, 0.08)",
            color: "#C2410C",
            borderColor: "rgba(194, 65, 12, 0.3)",
            "&:hover": {
              backgroundColor: "rgba(194, 65, 12, 0.12)",
            },
          },
        },
      },
    },
  },
})

export { theme }
