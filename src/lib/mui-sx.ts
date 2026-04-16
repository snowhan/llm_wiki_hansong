import type { SxProps, Theme } from "@mui/material/styles"

/** Merge sx fragments. MUI v9 + strict TS infer readonly tuples from `[a, ...b]` — this keeps assignment valid. */
export function sxMerge(...parts: Array<SxProps<Theme> | undefined | false>): SxProps<Theme> {
  const filtered = parts.filter(Boolean) as SxProps<Theme>[]
  return filtered as unknown as SxProps<Theme>
}
