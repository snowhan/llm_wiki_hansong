"use client"

import * as React from "react"
import Box from "@mui/material/Box"
import type { SxProps, Theme } from "@mui/material/styles"
import { sxMerge } from "@/lib/mui-sx"

const scrollbarSx: SxProps<Theme> = {
  overflow: "auto",
  scrollbarGutter: "stable",
  WebkitOverflowScrolling: "touch",
  "&::-webkit-scrollbar": {
    width: 6,
    height: 6,
  },
  "&::-webkit-scrollbar-track": {
    backgroundColor: "transparent",
  },
  "&::-webkit-scrollbar-thumb": {
    backgroundColor: "divider",
    borderRadius: 10,
    "&:hover": {
      backgroundColor: "action.disabled",
    },
  },
}

export type ScrollAreaProps = React.ComponentProps<typeof Box>

function ScrollArea({ className, children, sx, ...props }: ScrollAreaProps) {
  return (
    <Box
      data-slot="scroll-area"
      className={className}
      sx={sxMerge({ position: "relative", minHeight: 0, minWidth: 0 }, scrollbarSx, sx)}
      {...props}
    >
      {children}
    </Box>
  )
}

export type ScrollBarProps = React.ComponentProps<typeof Box> & {
  orientation?: "vertical" | "horizontal"
}

/** Kept for API compatibility; native scrollbars are styled on `ScrollArea` instead. */
function ScrollBar({ orientation = "vertical", sx, ...props }: ScrollBarProps) {
  return (
    <Box
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      sx={sxMerge({ display: "none" }, sx)}
      aria-hidden
      {...props}
    />
  )
}

export { ScrollArea, ScrollBar }
