import { createTheme } from "@mui/material/styles"
import type { Shadows } from "@mui/material/styles"

// ── TypeScript augmentation ──────────────────────────────────────────────
declare module "@mui/material/styles" {
  interface TypeBackground {
    sidebar?: string
    sidebarHover?: string
    elevated?: string
  }
  interface TypeText {
    tertiary?: string
    placeholder?: string
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

// ── Notion Design Tokens (精确来源: react-notion-x + 官方 CSS) ───────────
//
//  Light palette:
//    --fg-default:  rgb(55, 53, 47)  ≈ #37352F   主文字 (warm near-black)
//    --fg-60:       rgba(55,53,47, 0.6)           次级文字
//    --fg-40:       rgba(55,53,47, 0.4)           占位符 / disabled
//    --fg-16:       rgba(55,53,47, 0.16)          弱边框
//    --fg-09:       rgba(55,53,47, 0.09)          行分隔 / 极弱底纹
//    --bg-default:  #FFFFFF                       内容区背景
//    --bg-sidebar:  rgb(247,246,243) ≈ #F7F6F3    侧栏 / 表面
//    --bg-hover:    rgba(135,131,120, 0.15)        悬停底色
//    --accent:      #2383E2  rgb(35,131,226)       主交互色 (Notion 蓝)
//    --accent-bg:   rgba(35,131,226, 0.10)         按钮 / 选中底色
//
//  Dark palette:
//    --bg-default:  #2F3437                       内容区背景 (官方 dark)
//    --bg-sidebar:  #373C3F                       侧栏 (略深)
//    --bg-hover:    rgb(71,76,80)                 悬停
//    --bg-elevated: #3F4448                       卡片 / 弹层提升
//    --fg-default:  rgba(255,255,255, 0.9)        主文字
//    --fg-70:       rgba(255,255,255, 0.7)        次级文字
//    --fg-45:       rgba(255,255,255, 0.45)       disabled

const FONT_BODY = "'Plus Jakarta Sans', 'PingFang SC', 'Noto Sans SC', 'Hiragino Sans GB', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
const FONT_MONO = "'Geist Mono', 'JetBrains Mono', 'SF Mono', 'Fira Code', ui-monospace, monospace"

// Minimal Notion-style shadows — border-first, shadow as last resort
const NOTION_SHADOWS: Shadows = [
  "none",
  "0 1px 2px rgba(55,53,47,0.04)",
  "0 1px 3px rgba(55,53,47,0.06), 0 1px 2px rgba(55,53,47,0.04)",
  "0 4px 6px -1px rgba(55,53,47,0.06), 0 2px 4px -1px rgba(55,53,47,0.04)",
  "0 8px 40px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)",   // Command palette / modal
  "0 20px 40px rgba(55,53,47,0.08), 0 0 0 1px rgba(55,53,47,0.04)",
  "none", "none", "none", "none", "none", "none", "none", "none",
  "none", "none", "none", "none", "none", "none", "none", "none",
  "none", "none", "none",
]

export const theme = createTheme({
  cssVariables: true,

  colorSchemes: {
    // ── Light ──────────────────────────────────────────────────────────
    light: {
      palette: {
        primary: { main: "#2383E2", contrastText: "#fff", light: "#4B9FEA", dark: "#1365B8" },
        error:   { main: "#EB5757" },
        success: { main: "#0F7B0F", light: "#22C55E", dark: "#0A5B0A", contrastText: "#fff" },
        warning: { main: "#D97706", light: "#FBBF24", dark: "#92400E", contrastText: "#fff" },
        info:    { main: "#0369A1", light: "#38BDF8", dark: "#075985", contrastText: "#fff" },
        divider: "rgba(55,53,47,0.09)",
        light: { main: "#fff", contrastText: "rgb(55,53,47)", dark: "#F7F6F3", light: "#fff" },
        dark:  { main: "rgb(55,53,47)", light: "#57534E", dark: "#1C1917", contrastText: "#fff" },
        background: {
          default:     "#FFFFFF",
          paper:       "#FFFFFF",
          sidebar:     "rgb(247,246,243)",
          sidebarHover:"rgba(135,131,120,0.15)",
          elevated:    "#FFFFFF",
        },
        text: {
          primary:     "rgb(55,53,47)",
          secondary:   "rgba(55,53,47,0.6)",
          disabled:    "rgba(55,53,47,0.4)",
          tertiary:    "rgba(55,53,47,0.35)",
          placeholder: "rgba(55,53,47,0.3)",
        },
      },
    },

    // ── Dark ───────────────────────────────────────────────────────────
    dark: {
      palette: {
        primary: { main: "#529CCA", contrastText: "#fff", light: "#76B5D8", dark: "#2F7BAA" },
        error:   { main: "#FF6B6B" },
        success: { main: "#22C55E", light: "#4ADE80", dark: "#16A34A", contrastText: "#fff" },
        warning: { main: "#FBBF24", light: "#FCD34D", dark: "#D97706", contrastText: "rgba(0,0,0,0.8)" },
        info:    { main: "#38BDF8", light: "#7DD3FC", dark: "#0284C7", contrastText: "#fff" },
        divider: "rgba(255,255,255,0.09)",
        light: { main: "#FFFFFF", contrastText: "rgba(255,255,255,0.9)", dark: "#3F4448", light: "#fff" },
        dark:  { main: "#2F3437", light: "#373C3F", dark: "#1A1E20", contrastText: "rgba(255,255,255,0.9)" },
        background: {
          default:     "#2F3437",
          paper:       "#2F3437",
          sidebar:     "#373C3F",
          sidebarHover:"rgb(71,76,80)",
          elevated:    "#3F4448",
        },
        text: {
          primary:     "rgba(255,255,255,0.9)",
          secondary:   "rgba(255,255,255,0.7)",
          disabled:    "rgba(255,255,255,0.45)",
          tertiary:    "rgba(255,255,255,0.35)",
          placeholder: "rgba(255,255,255,0.3)",
        },
      },
    },
  },

  // ── Typography ────────────────────────────────────────────────────────
  typography: {
    fontFamily: FONT_BODY,
    fontSize: 14,
    // Notion heading scale
    h1: { fontFamily: FONT_BODY, fontWeight: 600, fontSize: "1.875rem", lineHeight: 1.3, letterSpacing: "-0.02em" },
    h2: { fontFamily: FONT_BODY, fontWeight: 600, fontSize: "1.5rem",   lineHeight: 1.3, letterSpacing: "-0.015em" },
    h3: { fontFamily: FONT_BODY, fontWeight: 600, fontSize: "1.25rem",  lineHeight: 1.4, letterSpacing: "-0.01em" },
    h4: { fontFamily: FONT_BODY, fontWeight: 600, fontSize: "1.1rem",   lineHeight: 1.4 },
    h5: { fontFamily: FONT_BODY, fontWeight: 600, fontSize: "1rem",     lineHeight: 1.5 },
    h6: { fontFamily: FONT_BODY, fontWeight: 600, fontSize: "0.875rem", lineHeight: 1.5 },
    body1: { fontSize: "1rem",   lineHeight: 1.5 },
    body2: { fontSize: "0.875rem", lineHeight: 1.5 },
    caption: { fontSize: "0.75rem", lineHeight: 1.4 },
    button: { fontWeight: 500, letterSpacing: "0.01em", textTransform: "none" as const },
  },

  // ── Shape ─────────────────────────────────────────────────────────────
  shape: { borderRadius: 6 },

  shadows: NOTION_SHADOWS,

  // ── Component Overrides ───────────────────────────────────────────────
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        "*, *::before, *::after": { boxSizing: "border-box" },
        body: {
          fontFamily: FONT_BODY,
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
          "--font-mono": FONT_MONO,
        },
        "*::-webkit-scrollbar": { width: 4, height: 4 },
        "*::-webkit-scrollbar-track": { background: "transparent" },
        "*::-webkit-scrollbar-thumb": {
          background: "rgba(55,53,47,0.12)",
          borderRadius: 4,
          "&:hover": { background: "rgba(55,53,47,0.22)" },
        },
        "a": { textDecoration: "none", color: "inherit" },
      },
    },

    MuiButton: {
      defaultProps: { disableElevation: true, disableRipple: false },
      styleOverrides: {
        root: {
          fontWeight: 500,
          borderRadius: 6,
          textTransform: "none" as const,
          letterSpacing: "0.01em",
          fontSize: "0.875rem",
          transition: "background-color 120ms ease, box-shadow 120ms ease, color 120ms ease",
        },
        sizeSmall: { fontSize: "0.8125rem", padding: "3px 8px" },
      },
    },

    MuiIconButton: {
      styleOverrides: {
        root: { borderRadius: 6 },
      },
    },

    MuiInputBase: {
      styleOverrides: {
        root: {
          fontSize: 14,
          borderRadius: "6px !important",
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(55,53,47,0.16) !important",
            borderWidth: "1px !important",
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: "#2383E2 !important",
            borderWidth: "1.5px !important",
          },
          "&:hover:not(.Mui-focused) .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(55,53,47,0.28) !important",
          },
        },
      },
    },

    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          borderRadius: 8,
        },
      },
    },

    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: 8,
          border: "1px solid rgba(55,53,47,0.09)",
          boxShadow: "0 4px 24px rgba(55,53,47,0.12), 0 0 0 1px rgba(55,53,47,0.04)",
          padding: "4px",
        },
      },
    },

    MuiMenuItem: {
      styleOverrides: {
        root: {
          fontSize: 14,
          borderRadius: 5,
          padding: "5px 10px",
          minHeight: 32,
          "&:hover": { background: "rgba(135,131,120,0.15)" },
          "&.Mui-selected": {
            background: "rgba(35,131,226,0.10)",
            "&:hover": { background: "rgba(35,131,226,0.14)" },
          },
        },
      },
    },

    MuiTooltip: {
      defaultProps: { arrow: true, enterDelay: 400 },
      styleOverrides: {
        tooltip: {
          backgroundColor: "rgb(55,53,47)",
          fontSize: "0.75rem",
          fontFamily: FONT_BODY,
          borderRadius: 6,
          padding: "5px 10px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
        },
        arrow: { color: "rgb(55,53,47)" },
      },
    },

    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
          boxShadow: "0 8px 40px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)",
        },
      },
    },

    MuiDialogTitle: {
      styleOverrides: {
        root: { fontSize: "1rem", fontWeight: 600, padding: "20px 24px 12px" },
      },
    },

    MuiDialogContent: {
      styleOverrides: {
        root: { padding: "0 24px 16px" },
      },
    },

    MuiDialogActions: {
      styleOverrides: {
        root: { padding: "8px 24px 16px", gap: 8 },
      },
    },

    MuiTabs: {
      styleOverrides: {
        indicator: { height: 2, borderRadius: 1 },
      },
    },

    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: "none" as const,
          fontWeight: 500,
          letterSpacing: "0.01em",
          fontSize: "0.875rem",
          minHeight: 40,
        },
      },
    },

    MuiToggleButton: {
      styleOverrides: {
        root: {
          borderRadius: "6px !important",
          textTransform: "none" as const,
          fontWeight: 500,
          fontSize: "0.875rem",
        },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontSize: "0.75rem",
          fontWeight: 500,
        },
      },
    },

    MuiTableCell: {
      styleOverrides: {
        head: {
          fontSize: "0.6875rem",
          fontWeight: 600,
          textTransform: "uppercase" as const,
          letterSpacing: "0.06em",
          height: 40,
          color: "rgba(55,53,47,0.5)",
        },
        body: {
          fontSize: "0.875rem",
        },
      },
    },

    MuiSkeleton: {
      styleOverrides: {
        root: { borderRadius: 4 },
      },
    },
  },
})
