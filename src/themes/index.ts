import { createTheme } from "@mui/material/styles"
import type { Shadows } from "@mui/material/styles"

declare module "@mui/material/styles" {
  interface TypeBackground {
    paper2?: string
    paper3?: string
    footer?: string
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

const theme = createTheme({
  cssVariables: true,
  palette: {
    primary: { main: "#3248F2", contrastText: "#fff" },
    error: { main: "#F64E54" },
    success: { main: "#82DDAF", light: "#AAF27F", dark: "#229A16", contrastText: "rgba(0,0,0,0.7)" },
    warning: { main: "#FEA145", light: "#FFE16A", dark: "#B78103", contrastText: "rgba(0,0,0,0.7)" },
    info: { main: "#0063FF", light: "#74CAFF", dark: "#0C53B7", contrastText: "#fff" },
    divider: "#ECEEF1",
    dark: { main: "#14141B", light: "#20232A", dark: "#000", contrastText: "#fff" },
    light: { main: "#fff", contrastText: "#000", dark: "#f5f5f5", light: "#fff" },
    background: {
      default: "#FFFFFF",
      paper: "#FFFFFF",
      paper2: "#F1F2F8",
      paper3: "#F8F9FA",
      footer: "#14141B",
    },
    text: {
      primary: "#171c19",
      secondary: "#3f4441",
      tertiary: "#717572",
      disabled: "#6e7781",
    },
  },
  typography: {
    fontFamily: "'PingFang SC', 'Helvetica Neue', Arial, sans-serif",
  },
  shadows: [
    ...defaultTheme.shadows.slice(0, 8),
    "0px 10px 20px 0px rgba(54,59,76,0.2)",
    ...defaultTheme.shadows.slice(9),
  ] as Shadows,
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          fontFamily: "'PingFang SC', 'Helvetica Neue', Arial, sans-serif",
        },
        "*::-webkit-scrollbar": {
          width: 4,
          height: 0,
          borderRadius: 10,
        },
        "*::-webkit-scrollbar-track": {
          backgroundColor: "#fff",
          borderRadius: 10,
        },
        "*::-webkit-scrollbar-thumb": {
          backgroundColor: "#ccc",
          borderRadius: 10,
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { fontWeight: 400, borderRadius: 10, textTransform: "none" as const },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: {
          fontSize: 14,
          borderRadius: "10px !important",
          backgroundColor: "#F8F9FA",
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "#F8F9FA !important",
            borderWidth: "1px !important",
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: "#171c19 !important",
            borderWidth: "1px !important",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "#171c19 !important",
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
        paper: { borderRadius: 10 },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: { fontSize: 14 },
      },
    },
    MuiAutocomplete: {
      styleOverrides: {
        paper: { borderRadius: 10 },
        option: { fontSize: 14 },
      },
    },
    MuiTooltip: {
      defaultProps: { arrow: true },
    },
    MuiLink: {
      styleOverrides: {
        root: { textDecoration: "none" },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          backgroundColor: "#f8f9fa",
          borderBottom: "none",
          fontSize: 12,
          height: 50,
        },
        body: {
          borderBottom: "1px dashed #ECEEF1",
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: { height: 36, borderRadius: "10px !important", backgroundColor: "#F8F9FA" },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 10 },
      },
    },
  },
})

export { theme }
