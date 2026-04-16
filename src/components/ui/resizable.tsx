import Box from "@mui/material/Box"
import type { BoxProps } from "@mui/material/Box"
import { sxMerge } from "@/lib/mui-sx"

export type ResizablePanelGroupProps = BoxProps & {
  direction?: "horizontal" | "vertical"
}

function ResizablePanelGroup({
  direction = "horizontal",
  className,
  sx,
  ...props
}: ResizablePanelGroupProps) {
  return (
    <Box
      data-slot="resizable-panel-group"
      className={className}
      sx={sxMerge(
        {
          display: "flex",
          height: "100%",
          width: "100%",
          minHeight: 0,
          minWidth: 0,
          flexDirection: direction === "vertical" ? "column" : "row",
        },
        sx,
      )}
      {...props}
    />
  )
}

export type ResizablePanelProps = BoxProps

function ResizablePanel({ sx, ...props }: ResizablePanelProps) {
  return (
    <Box
      data-slot="resizable-panel"
      sx={sxMerge({ flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }, sx)}
      {...props}
    />
  )
}

export type ResizableHandleProps = BoxProps & {
  withHandle?: boolean
}

function ResizableHandle({ withHandle, className, sx, ...props }: ResizableHandleProps) {
  return (
    <Box
      data-slot="resizable-handle"
      className={className}
      sx={sxMerge(
        {
          position: "relative",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 6,
          cursor: "col-resize",
          bgcolor: "action.selected",
          opacity: 0.4,
          transition: (t) => t.transitions.create("opacity"),
          "&:hover": { opacity: 0.7 },
        },
        sx,
      )}
      {...props}
    >
      {withHandle ? (
        <Box
          sx={{
            zIndex: 1,
            width: 6,
            height: 32,
            flexShrink: 0,
            borderRadius: 999,
            bgcolor: "divider",
          }}
        />
      ) : null}
    </Box>
  )
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup }
