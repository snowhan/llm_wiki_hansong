import Box from "@mui/material/Box"
import Skeleton from "@mui/material/Skeleton"

interface TreeSkeletonProps {
  rows?: number
}

/** Notion-style sidebar skeleton for knowledge tree loading state. */
export function TreeSkeleton({ rows = 8 }: TreeSkeletonProps) {
  const ITEMS = Array.from({ length: rows }, (_, i) => ({
    depth: i < 2 ? 0 : i < 5 ? 1 : i < 7 ? 1 : 0,
    width: [60, 75, 45, 80, 55, 70, 40, 65, 50, 72][i % 10],
  }))

  return (
    <Box sx={{ px: 1.5, py: 1.5, display: "flex", flexDirection: "column", gap: 0.75 }}>
      {/* Project name skeleton */}
      <Skeleton variant="text" width={80} height={12} sx={{ mb: 1, ml: 0.5 }} />

      {ITEMS.map((item, i) => (
        <Box
          key={i}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            pl: item.depth * 2,
            opacity: 1 - i * 0.06,
            animation: `stagger-in 300ms var(--ease-spring) ${i * 40}ms both`,
          }}
        >
          <Skeleton variant="circular" width={12} height={12} sx={{ flexShrink: 0 }} />
          <Skeleton
            variant="text"
            width={`${item.width}%`}
            height={14}
            sx={{ borderRadius: "4px" }}
          />
        </Box>
      ))}
    </Box>
  )
}
