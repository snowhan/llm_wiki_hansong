import { useState, useRef, useCallback } from "react"
import Box from "@mui/material/Box"
import InputBase from "@mui/material/InputBase"
import IconButton from "@mui/material/IconButton"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"
import AddPhotoAlternate from "@mui/icons-material/AddPhotoAlternate"
import EmojiEmotions from "@mui/icons-material/EmojiEmotions"
import Close from "@mui/icons-material/Close"

// Common emoji suggestions for the picker (minimal — no external dependency)
const EMOJI_SUGGESTIONS = ["📝", "📖", "💡", "🔍", "🗂️", "⚡", "🎯", "🔑", "🌐", "📊", "🧩", "💎", "🚀", "🎨", "🛠️"]

interface PageHeaderProps {
  title: string
  emoji?: string
  coverUrl?: string
  onTitleChange: (title: string) => void
  onEmojiChange: (emoji: string | undefined) => void
  onCoverChange?: (url: string | undefined) => void
}

export function PageHeader({
  title,
  emoji,
  coverUrl,
  onTitleChange,
  onEmojiChange,
  onCoverChange,
}: PageHeaderProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [isHoveringCover, setIsHoveringCover] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  const handleEmojiSelect = useCallback(
    (e: string) => {
      onEmojiChange(e)
      setShowEmojiPicker(false)
    },
    [onEmojiChange]
  )

  return (
    <Box
      component="header"
      sx={{ position: "relative", mb: 0 }}
    >
      {/* Cover image */}
      <Box
        onMouseEnter={() => setIsHoveringCover(true)}
        onMouseLeave={() => setIsHoveringCover(false)}
        sx={{
          position: "relative",
          width: "100%",
          height: coverUrl ? 180 : 0,
          overflow: "hidden",
          bgcolor: coverUrl ? "transparent" : "transparent",
          transition: "height 200ms ease",
        }}
      >
        {coverUrl && (
          <Box
            component="img"
            src={coverUrl}
            alt="封面"
            sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        )}
        {coverUrl && isHoveringCover && (
          <Box
            sx={{
              position: "absolute",
              bottom: 8,
              right: 12,
              display: "flex",
              gap: 0.5,
            }}
          >
            <Tooltip title="移除封面">
              <IconButton
                size="small"
                aria-label="移除封面"
                onClick={() => onCoverChange?.(undefined)}
                sx={{
                  bgcolor: "background.paper",
                  color: "text.secondary",
                  fontSize: 12,
                  px: 1,
                  py: 0.5,
                  borderRadius: "6px",
                  border: "1px solid",
                  borderColor: "divider",
                  "&:hover": { bgcolor: "background.sidebarHover" },
                  gap: 0.5,
                }}
              >
                <Close sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          </Box>
        )}
      </Box>

      {/* Page icon + add cover row */}
      <Box
        sx={{
          px: { xs: 3, md: 6 },
          pt: coverUrl ? 2 : 3,
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}
      >
        {/* Actions row — only visible on hover */}
        <Box
          className="page-header-actions"
          sx={{
            display: "flex",
            gap: 0.5,
            mb: 0.5,
            opacity: 0,
            transition: "opacity var(--duration-fast) ease",
            ".page-header:hover &": { opacity: 1 },
          }}
        >
          {!coverUrl && (
            <Tooltip title="添加封面">
              <IconButton
                size="small"
                aria-label="添加封面"
                onClick={() => onCoverChange?.("")}
                sx={{
                  fontSize: "0.75rem",
                  px: 1,
                  py: 0.25,
                  color: "text.secondary",
                  borderRadius: "6px",
                  gap: 0.5,
                  "&:hover": { bgcolor: "background.sidebarHover", color: "text.primary" },
                }}
              >
                <AddPhotoAlternate sx={{ fontSize: 14 }} />
                <Typography variant="caption" sx={{ fontSize: "0.75rem", lineHeight: 1 }}>
                  添加封面
                </Typography>
              </IconButton>
            </Tooltip>
          )}
          {!emoji && (
            <Tooltip title="添加图标">
              <IconButton
                size="small"
                aria-label="添加图标"
                onClick={() => { onEmojiChange("📝"); setShowEmojiPicker(false) }}
                sx={{
                  fontSize: "0.75rem",
                  px: 1,
                  py: 0.25,
                  color: "text.secondary",
                  borderRadius: "6px",
                  gap: 0.5,
                  "&:hover": { bgcolor: "background.sidebarHover", color: "text.primary" },
                }}
              >
                <EmojiEmotions sx={{ fontSize: 14 }} />
                <Typography variant="caption" sx={{ fontSize: "0.75rem", lineHeight: 1 }}>
                  添加图标
                </Typography>
              </IconButton>
            </Tooltip>
          )}
        </Box>

        {/* Emoji icon */}
        {emoji && (
          <Box sx={{ position: "relative", display: "inline-block", mb: 0.5 }}>
            <Tooltip title="更换图标">
              <IconButton
                aria-label={emoji}
                onClick={() => setShowEmojiPicker((v) => !v)}
                sx={{
                  fontSize: "2.5rem",
                  width: 56,
                  height: 56,
                  borderRadius: "8px",
                  p: 0,
                  lineHeight: 1,
                  "&:hover": { bgcolor: "background.sidebarHover" },
                }}
              >
                {emoji}
              </IconButton>
            </Tooltip>

            {/* Inline emoji picker */}
            {showEmojiPicker && (
              <Box
                sx={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  zIndex: 1000,
                  bgcolor: "background.paper",
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: "10px",
                  boxShadow: 4,
                  p: 1.5,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 0.5,
                  width: 220,
                  animation: "notion-scale-in 150ms var(--ease-spring) both",
                }}
              >
                {EMOJI_SUGGESTIONS.map((e) => (
                  <IconButton
                    key={e}
                    size="small"
                    onClick={() => handleEmojiSelect(e)}
                    sx={{
                      fontSize: "1.25rem",
                      width: 32,
                      height: 32,
                      borderRadius: "6px",
                      "&:hover": { bgcolor: "background.sidebarHover" },
                    }}
                  >
                    {e}
                  </IconButton>
                ))}
                <Tooltip title="移除图标">
                  <IconButton
                    size="small"
                    onClick={() => { onEmojiChange(undefined); setShowEmojiPicker(false) }}
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: "6px",
                      "&:hover": { bgcolor: "background.sidebarHover" },
                    }}
                  >
                    <Close sx={{ fontSize: 14 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            )}
          </Box>
        )}

        {/* Page title input */}
        <InputBase
          inputRef={titleRef}
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="无标题"
          fullWidth
          multiline
          inputProps={{
            "aria-label": "页面标题",
            style: {
              fontSize: "2.5rem",
              fontWeight: 700,
              lineHeight: 1.2,
              letterSpacing: "-0.02em",
              padding: 0,
              resize: "none",
              overflow: "hidden",
            },
          }}
          sx={{
            "& .MuiInputBase-input": {
              color: "text.primary",
              caretColor: "primary.main",
              "&::placeholder": {
                color: "text.tertiary",
                opacity: 1,
              },
            },
          }}
        />
      </Box>
    </Box>
  )
}
