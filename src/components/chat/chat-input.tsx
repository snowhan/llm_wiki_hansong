import { useRef, useState, useCallback } from "react"
import { useTranslation } from "react-i18next"
import Box from "@mui/material/Box"
import IconButton from "@mui/material/IconButton"
import TextField from "@mui/material/TextField"
import SendIcon from "@mui/icons-material/Send"
import StopIcon from "@mui/icons-material/Stop"

interface ChatInputProps {
  onSend: (text: string) => void
  onStop: () => void
  isStreaming: boolean
  placeholder?: string
}

export function ChatInput({ onSend, onStop, isStreaming, placeholder }: ChatInputProps) {
  const { t } = useTranslation()
  const [value, setValue] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    const ta = e.target
    ta.style.height = "auto"
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`
  }, [])

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || isStreaming) return
    onSend(trimmed)
    setValue("")
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }, [value, isStreaming, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "flex-end",
        gap: 1,
        borderTop: 1,
        borderColor: "divider",
        p: 1.5,
      }}
    >
      <TextField
        multiline
        minRows={1}
        inputRef={textareaRef}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? t("chat.defaultPlaceholder")}
        disabled={isStreaming}
        fullWidth
        variant="outlined"
        size="small"
        sx={{
          flex: 1,
          "& .MuiInputBase-root": {
            bgcolor: "background.paper",
          },
          "& textarea": {
            maxHeight: 120,
            overflowY: "auto",
            resize: "none",
            fontSize: "0.875rem",
          },
        }}
      />
      {isStreaming ? (
        <IconButton
          color="error"
          onClick={onStop}
          title={t("chat.stopGeneration")}
          sx={{ flexShrink: 0 }}
          size="small"
        >
          <StopIcon sx={{ fontSize: 18 }} />
        </IconButton>
      ) : (
        <IconButton
          color="primary"
          onClick={handleSend}
          disabled={!value.trim()}
          title={t("chat.sendMessage")}
          sx={{ flexShrink: 0 }}
          size="small"
        >
          <SendIcon sx={{ fontSize: 18 }} />
        </IconButton>
      )}
    </Box>
  )
}
