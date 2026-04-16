import * as React from "react"
import TextField from "@mui/material/TextField"
import type { TextFieldProps } from "@mui/material/TextField"
import { sxMerge } from "@/lib/mui-sx"

export type InputProps = Omit<TextFieldProps, "variant" | "label" | "hiddenLabel">

const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type = "text", size = "small", fullWidth = true, sx, slotProps, ...props },
  ref
) {
  return (
    <TextField
      type={type}
      variant="outlined"
      size={size}
      fullWidth={fullWidth}
      hiddenLabel
      inputRef={ref}
      className={className}
      data-slot="input"
      sx={sxMerge(
        {
          "& .MuiInputBase-input": {
            py: 0.5,
            fontSize: { xs: "1rem", md: "0.875rem" },
          },
        },
        sx,
      )}
      slotProps={{
        ...slotProps,
        htmlInput: {
          ...slotProps?.htmlInput,
        },
      }}
      {...props}
    />
  )
})

export { Input }
