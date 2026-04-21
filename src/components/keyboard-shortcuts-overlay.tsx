import Dialog from "@mui/material/Dialog"
import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import Divider from "@mui/material/Divider"
import IconButton from "@mui/material/IconButton"
import Close from "@mui/icons-material/Close"

interface ShortcutEntry {
  label: string
  keys: string[]
}

const SHORTCUT_GROUPS: Array<{ group: string; items: ShortcutEntry[] }> = [
  {
    group: "全局",
    items: [
      { label: "命令面板", keys: ["⌘", "K"] },
      { label: "快捷键帮助", keys: ["⌘", "/"] },
    ],
  },
  {
    group: "编辑器",
    items: [
      { label: "加粗", keys: ["⌘", "B"] },
      { label: "斜体", keys: ["⌘", "I"] },
      { label: "下划线", keys: ["⌘", "U"] },
      { label: "行内代码", keys: ["⌘", "E"] },
      { label: "链接", keys: ["⌘", "K"] },
      { label: "Slash 命令", keys: ["/"] },
      { label: "撤销", keys: ["⌘", "Z"] },
      { label: "重做", keys: ["⌘", "⇧", "Z"] },
    ],
  },
  {
    group: "导航",
    items: [
      { label: "Wiki 视图", keys: ["⌘", "1"] },
      { label: "搜索视图", keys: ["⌘", "2"] },
      { label: "图谱视图", keys: ["⌘", "3"] },
    ],
  },
]

interface KeyboardShortcutsOverlayProps {
  open: boolean
  onClose: () => void
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <Box
      component="kbd"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 24,
        height: 22,
        px: 0.75,
        border: "1px solid",
        borderColor: "divider",
        borderBottom: "2px solid",
        borderBottomColor: "divider",
        borderRadius: "5px",
        fontSize: "0.75rem",
        fontFamily: "var(--font-mono, inherit)",
        fontWeight: 500,
        color: "text.secondary",
        bgcolor: "background.sidebarHover",
        lineHeight: 1,
      }}
    >
      {children}
    </Box>
  )
}

export function KeyboardShortcutsOverlay({ open, onClose }: KeyboardShortcutsOverlayProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { maxWidth: 520, borderRadius: "12px" } }}
    >
      <Box sx={{ px: 3, py: 2, display: "flex", alignItems: "center", borderBottom: "1px solid", borderColor: "divider" }}>
        <Typography variant="h6" sx={{ flex: 1, fontWeight: 600, fontSize: "1rem" }}>
          键盘快捷键
        </Typography>
        <IconButton size="small" onClick={onClose} sx={{ borderRadius: "6px" }}>
          <Close sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>

      <Box sx={{ px: 3, py: 2, overflow: "auto", maxHeight: "70vh" }}>
        {SHORTCUT_GROUPS.map((group, gIdx) => (
          <Box key={group.group}>
            {gIdx > 0 && <Divider sx={{ my: 2 }} />}
            <Typography
              variant="caption"
              sx={{
                display: "block",
                mb: 1,
                fontWeight: 600,
                fontSize: "0.6875rem",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "text.secondary",
              }}
            >
              {group.group}
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
              {group.items.map((item) => (
                <Box key={item.label} sx={{ display: "flex", alignItems: "center" }}>
                  <Typography variant="body2" sx={{ flex: 1, fontSize: "0.875rem" }}>
                    {item.label}
                  </Typography>
                  <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
                    {item.keys.map((k, kIdx) => (
                      <Box key={kIdx} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        {kIdx > 0 && (
                          <Typography variant="caption" color="text.tertiary" sx={{ fontSize: "0.7rem" }}>
                            +
                          </Typography>
                        )}
                        <Kbd>{k}</Kbd>
                      </Box>
                    ))}
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        ))}
      </Box>
    </Dialog>
  )
}
