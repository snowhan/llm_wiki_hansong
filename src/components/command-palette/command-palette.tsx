import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import Box from "@mui/material/Box"
import Dialog from "@mui/material/Dialog"
import InputBase from "@mui/material/InputBase"
import List from "@mui/material/List"
import ListItemButton from "@mui/material/ListItemButton"
import ListItemText from "@mui/material/ListItemText"
import Typography from "@mui/material/Typography"
import Divider from "@mui/material/Divider"
import SearchIcon from "@mui/icons-material/Search"
import { useWikiStore } from "@/stores/wiki-store"
import { buildCommands, filterCommands } from "./commands"
import type { Command } from "./commands"

const GROUP_LABELS: Record<Command["group"], string> = {
  navigate: "导航",
  theme:    "主题",
  action:   "操作",
  file:     "文件",
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const setActiveView = useWikiStore((s) => s.setActiveView)
  const setColorScheme = useWikiStore((s) => s.setColorScheme)
  const openTabs = useWikiStore((s) => s.openTabs)
  const navigateInCurrentTab = useWikiStore((s) => s.navigateInCurrentTab)

  const allCommands = useMemo(
    () => buildCommands({ setActiveView, setColorScheme, openTabs, navigateInCurrentTab }),
    [setActiveView, setColorScheme, openTabs, navigateInCurrentTab]
  )

  const filtered = useMemo(() => filterCommands(allCommands, query), [allCommands, query])

  // Reset state on open
  useEffect(() => {
    if (open) {
      setQuery("")
      setActiveIndex(0)
      // Defer focus so dialog animation doesn't interfere
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Reset active index when query changes
  useEffect(() => {
    setActiveIndex(-1)
  }, [query])

  const executeCommand = useCallback(
    (cmd: Command) => {
      cmd.action()
      onClose()
    },
    [onClose]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setActiveIndex((i) => (i < filtered.length - 1 ? i + 1 : 0))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setActiveIndex((i) => (i > 0 ? i - 1 : filtered.length - 1))
      } else if (e.key === "Enter") {
        e.preventDefault()
        if (activeIndex >= 0 && filtered[activeIndex]) executeCommand(filtered[activeIndex])
      } else if (e.key === "Escape") {
        onClose()
      }
    },
    [activeIndex, executeCommand, filtered, onClose]
  )

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return
    const item = listRef.current.querySelector(`[data-index="${activeIndex}"]`)
    item?.scrollIntoView({ block: "nearest" })
  }, [activeIndex])

  // Group filtered commands
  const grouped = useMemo(() => {
    const groups: Partial<Record<Command["group"], Command[]>> = {}
    for (const cmd of filtered) {
      groups[cmd.group] = groups[cmd.group] ?? []
      groups[cmd.group]!.push(cmd)
    }
    return groups
  }, [filtered])

  // Build flat list for keyboard navigation (maintains order)
  const flatFiltered = filtered

  return (
    <Dialog
      open={open}
      onClose={onClose}
      TransitionProps={{ unmountOnExit: true }}
      PaperProps={{
        role: "dialog",
        sx: {
          width: "100%",
          maxWidth: 560,
          maxHeight: "70vh",
          m: 2,
          borderRadius: "12px",
          overflow: "hidden",
          boxShadow: 4,
          border: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
        },
      }}
      BackdropProps={{
        sx: { bgcolor: "rgba(0,0,0,0.35)", backdropFilter: "blur(2px)" },
      }}
    >
      {/* Search input */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          px: 2,
          py: 1.5,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <SearchIcon sx={{ color: "text.secondary", fontSize: 18, flexShrink: 0 }} />
        <InputBase
          inputRef={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActiveIndex(0) }}
          onKeyDown={handleKeyDown}
          placeholder="搜索命令..."
          fullWidth
          inputProps={{
            role: "textbox",
            "aria-label": "搜索命令",
            style: { padding: 0, fontSize: 15, fontWeight: 400 },
          }}
          sx={{ flex: 1, fontSize: 15 }}
        />
        <Box
          component="kbd"
          sx={{
            flexShrink: 0,
            px: 0.75,
            py: 0.25,
            border: "1px solid",
            borderColor: "divider",
            borderRadius: "4px",
            fontSize: 11,
            color: "text.secondary",
            fontFamily: "inherit",
            lineHeight: 1.5,
            cursor: "default",
          }}
        >
          Esc
        </Box>
      </Box>

      {/* Results */}
      <Box sx={{ overflow: "auto", maxHeight: "calc(70vh - 60px)" }}>
        {flatFiltered.length === 0 ? (
          <Box sx={{ py: 8, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              无匹配结果
            </Typography>
          </Box>
        ) : (
          <List
            ref={listRef}
            dense
            disablePadding
            role="listbox"
            sx={{ py: 1 }}
          >
            {(Object.entries(grouped) as [Command["group"], Command[]][]).map(
              ([group, cmds], gIdx) => (
                <Box key={group}>
                  {gIdx > 0 && <Divider sx={{ mx: 2, my: 0.5 }} />}
                  <Typography
                    variant="caption"
                    sx={{
                      display: "block",
                      px: 2,
                      py: 0.5,
                      fontWeight: 600,
                      color: "text.secondary",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      fontSize: "0.6875rem",
                    }}
                  >
                    {GROUP_LABELS[group]}
                  </Typography>
                  {cmds.map((cmd) => {
                    const flatIdx = flatFiltered.indexOf(cmd)
                    const isActive = flatIdx === activeIndex
                    return (
                      <ListItemButton
                        key={cmd.id}
                        role="option"
                        aria-selected={isActive}
                        data-index={flatIdx}
                        selected={isActive}
                        onClick={() => executeCommand(cmd)}
                        sx={{
                          mx: 1,
                          borderRadius: "6px",
                          py: 0.75,
                          px: 1.5,
                          minHeight: 40,
                          "&.Mui-selected": {
                            bgcolor: "rgba(35,131,226,0.10)",
                            "&:hover": { bgcolor: "rgba(35,131,226,0.14)" },
                          },
                          "&:hover": { bgcolor: "background.sidebarHover" },
                        }}
                      >
                        <ListItemText
                          primary={cmd.label}
                          secondary={cmd.description}
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
        )}
      </Box>
    </Dialog>
  )
}
