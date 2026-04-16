import * as React from "react"
import MuiButton from "@mui/material/Button"
import type { ButtonProps as MuiButtonProps } from "@mui/material/Button"
import { alpha } from "@mui/material/styles"
import type { SxProps, Theme } from "@mui/material/styles"
import { sxMerge } from "@/lib/mui-sx"

export type ButtonVariant =
  | "default"
  | "destructive"
  | "outline"
  | "secondary"
  | "ghost"
  | "link"

export type ButtonSize =
  | "default"
  | "xs"
  | "sm"
  | "lg"
  | "icon"
  | "icon-xs"
  | "icon-sm"
  | "icon-lg"

export type ButtonProps = Omit<MuiButtonProps, "variant" | "size" | "color"> & {
  variant?: ButtonVariant
  size?: ButtonSize
}

type Mapped = Pick<MuiButtonProps, "variant" | "color"> & { sxExtra?: SxProps<Theme> }

function mapVariantToMui(variant: ButtonVariant): Mapped {
  switch (variant) {
    case "default":
      return { variant: "contained", color: "primary" }
    case "destructive":
      return {
        variant: "text",
        color: "error",
        sxExtra: {
          bgcolor: (t: Theme) => alpha(t.palette.error.main, 0.12),
          "&:hover": { bgcolor: (t: Theme) => alpha(t.palette.error.main, 0.2) },
        },
      }
    case "outline":
      return { variant: "outlined", color: "primary" }
    case "secondary":
      return {
        variant: "contained",
        color: "inherit",
        sxExtra: {
          bgcolor: "background.paper2",
          color: "text.primary",
          border: "1px solid",
          borderColor: "divider",
          boxShadow: "none",
          "&:hover": { bgcolor: "action.hover", boxShadow: "none" },
        },
      }
    case "ghost":
      return {
        variant: "text",
        color: "inherit",
        sxExtra: {
          color: "text.primary",
          "&:hover": { bgcolor: "action.hover" },
        },
      }
    case "link":
      return {
        variant: "text",
        color: "primary",
        sxExtra: {
          minWidth: "auto",
          textDecoration: "underline",
          textUnderlineOffset: 4,
          "&:hover": { bgcolor: "transparent", textDecoration: "underline" },
        },
      }
    default:
      return { variant: "contained", color: "primary" }
  }
}

function sizeSx(size: ButtonSize): SxProps<Theme> {
  const iconSvg = {
    "& .MuiSvgIcon-root, & svg": { fontSize: "inherit", width: "1em", height: "1em" },
  }
  switch (size) {
    case "xs":
      return {
        minHeight: 24,
        px: 1,
        py: 0.25,
        fontSize: "0.75rem",
        gap: 0.5,
        borderRadius: "min(10px, 10px)",
        ...iconSvg,
      }
    case "sm":
      return {
        minHeight: 28,
        px: 1.25,
        py: 0.25,
        fontSize: "0.8rem",
        gap: 0.5,
        borderRadius: "min(12px, 12px)",
        ...iconSvg,
      }
    case "lg":
      return { minHeight: 36, px: 1.25, py: 0.5, gap: 0.75, ...iconSvg }
    case "icon":
      return { minWidth: 32, width: 32, height: 32, p: 0, ...iconSvg }
    case "icon-xs":
      return {
        minWidth: 24,
        width: 24,
        height: 24,
        p: 0,
        borderRadius: "min(10px, 10px)",
        ...iconSvg,
      }
    case "icon-sm":
      return {
        minWidth: 28,
        width: 28,
        height: 28,
        p: 0,
        borderRadius: "min(12px, 12px)",
        ...iconSvg,
      }
    case "icon-lg":
      return { minWidth: 36, width: 36, height: 36, p: 0, ...iconSvg }
    case "default":
    default:
      return { minHeight: 32, px: 1.25, py: 0.25, gap: 0.5, ...iconSvg }
  }
}

/** Returns `sx` for the legacy variant/size API (for reuse outside `Button`). */
export function buttonVariants(options: {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
}): { sx: SxProps<Theme> } {
  const variant = options.variant ?? "default"
  const size = options.size ?? "default"
  const mapped = mapVariantToMui(variant)
  const { sxExtra } = mapped
  return {
    sx: sxMerge(sizeSx(size), sxExtra ?? {}),
  }
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "default", size = "default", sx, ...props },
  ref
) {
  const mapped = mapVariantToMui(variant)
  const { sxExtra, variant: muiVariant, color } = mapped

  return (
    <MuiButton
      ref={ref}
      data-slot="button"
      variant={muiVariant}
      color={color === "inherit" ? "inherit" : color}
      sx={sxMerge(sizeSx(size), sxExtra ?? {}, sx)}
      {...props}
    />
  )
})

export { Button }
