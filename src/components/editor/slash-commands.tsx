import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from "react"
import type { SuggestionProps } from "@tiptap/suggestion"
import Box from "@mui/material/Box"
import List from "@mui/material/List"
import ListItemButton from "@mui/material/ListItemButton"
import ListItemText from "@mui/material/ListItemText"
import Typography from "@mui/material/Typography"
import Divider from "@mui/material/Divider"
import { filterSlashItems } from "./slash-items"
import type { SlashItem } from "./slash-items"

// ── Group labels ─────────────────────────────────────────────────────────────
const GROUP_LABELS: Record<SlashItem["group"], string> = {
  heading:  "标题",
  list:     "列表",
  block:    "块元素",
  media:    "媒体",
  advanced: "高级",
}

// ── CommandList ref interface (required by TipTap Suggestion) ─────────────────
export interface CommandListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

// ── CommandList component ─────────────────────────────────────────────────────
export const CommandList = forwardRef<CommandListHandle, SuggestionProps<SlashItem>>(
  function CommandList({ query, command }, ref) {
    const items = filterSlashItems(query)
    const [activeIndex, setActiveIndex] = useState(0)

    useEffect(() => { setActiveIndex(0) }, [query])

    const executeItem = useCallback(
      (item: SlashItem) => {
        command({ id: item.id, ...item } as unknown as SlashItem)
      },
      [command]
    )

    useImperativeHandle(ref, () => ({
      onKeyDown({ event }) {
        if (event.key === "ArrowDown") {
          setActiveIndex((i) => (i < items.length - 1 ? i + 1 : 0))
          return true
        }
        if (event.key === "ArrowUp") {
          setActiveIndex((i) => (i > 0 ? i - 1 : items.length - 1))
          return true
        }
        if (event.key === "Enter") {
          if (items[activeIndex]) executeItem(items[activeIndex])
          return true
        }
        return false
      },
    }))

    if (items.length === 0) {
      return (
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="caption" color="text.secondary">无匹配命令</Typography>
        </Box>
      )
    }

    // Group items for display
    const groups: Partial<Record<SlashItem["group"], SlashItem[]>> = {}
    for (const item of items) {
      groups[item.group] = groups[item.group] ?? []
      groups[item.group]!.push(item)
    }

    let globalIndex = 0

    return (
      <Box
        sx={{
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: "10px",
          boxShadow: 4,
          overflow: "hidden",
          minWidth: 240,
          maxWidth: 300,
          animation: "notion-scale-in 140ms var(--ease-spring) both",
        }}
      >
        <List dense disablePadding sx={{ py: 0.75 }}>
          {(Object.entries(groups) as [SlashItem["group"], SlashItem[]][]).map(
            ([group, groupItems], gIdx) => (
              <Box key={group}>
                {gIdx > 0 && <Divider sx={{ mx: 1.5, my: 0.25 }} />}
                <Typography
                  variant="caption"
                  sx={{
                    display: "block",
                    px: 2,
                    py: 0.25,
                    fontWeight: 600,
                    color: "text.secondary",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    fontSize: "0.6rem",
                  }}
                >
                  {GROUP_LABELS[group]}
                </Typography>
                {groupItems.map((item) => {
                  const idx = globalIndex++
                  const isActive = idx === activeIndex
                  return (
                    <ListItemButton
                      key={item.id}
                      selected={isActive}
                      onClick={() => executeItem(item)}
                      sx={{
                        mx: 0.75,
                        borderRadius: "6px",
                        py: 0.5,
                        px: 1,
                        minHeight: 36,
                        "&.Mui-selected": {
                          bgcolor: "rgba(35,131,226,0.10)",
                          "&:hover": { bgcolor: "rgba(35,131,226,0.14)" },
                        },
                        "&:hover": { bgcolor: "background.sidebarHover" },
                      }}
                    >
                      {/* Icon badge */}
                      {item.icon && (
                        <Box
                          sx={{
                            width: 28,
                            height: 28,
                            borderRadius: "6px",
                            bgcolor: "background.sidebarHover",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            fontFamily: "var(--font-mono)",
                            color: "text.secondary",
                            flexShrink: 0,
                            mr: 1.5,
                          }}
                        >
                          {item.icon}
                        </Box>
                      )}
                      <ListItemText
                        primary={item.label}
                        secondary={item.description}
                        primaryTypographyProps={{ variant: "body2", fontWeight: 500, sx: { fontSize: "0.875rem" } }}
                        secondaryTypographyProps={{ variant: "caption", sx: { fontSize: "0.75rem" } }}
                      />
                    </ListItemButton>
                  )
                })}
              </Box>
            )
          )}
        </List>
      </Box>
    )
  }
)
