import Divider from "@mui/material/Divider"
import type { DividerProps } from "@mui/material/Divider"
import { sxMerge } from "@/lib/mui-sx"

export type SeparatorProps = Omit<DividerProps, "orientation"> & {
  orientation?: "horizontal" | "vertical"
}

function Separator({ className, orientation = "horizontal", flexItem, sx, ...props }: SeparatorProps) {
  return (
    <Divider
      data-slot="separator"
      className={className}
      orientation={orientation}
      flexItem={orientation === "vertical" ? flexItem ?? true : flexItem}
      sx={sxMerge(
        orientation === "vertical"
          ? { alignSelf: "stretch", height: "auto" }
          : { width: "100%" },
        sx,
      )}
      {...props}
    />
  )
}

export { Separator }
