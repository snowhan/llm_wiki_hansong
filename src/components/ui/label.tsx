import FormLabel from "@mui/material/FormLabel"
import type { FormLabelProps } from "@mui/material/FormLabel"
import { sxMerge } from "@/lib/mui-sx"

function Label({ className, sx, ...props }: FormLabelProps) {
  return (
    <FormLabel
      data-slot="label"
      className={className}
      sx={sxMerge(
        {
          display: "flex",
          alignItems: "center",
          gap: 1,
          fontSize: "0.875rem",
          lineHeight: 1,
          fontWeight: 500,
          mb: 0,
          color: "text.primary",
          "&.Mui-disabled": { opacity: 0.5 },
        },
        sx,
      )}
      {...props}
    />
  )
}

export { Label }
