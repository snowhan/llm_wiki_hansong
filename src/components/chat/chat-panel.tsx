import { useRef, useEffect, useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import Box from "@mui/material/Box"
import Stack from "@mui/material/Stack"
import Typography from "@mui/material/Typography"
import Button from "@mui/material/Button"
import IconButton from "@mui/material/IconButton"
import Popover from "@mui/material/Popover"
import Tooltip from "@mui/material/Tooltip"
import AddIcon from "@mui/icons-material/Add"
import HistoryOutlined from "@mui/icons-material/HistoryOutlined"
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined"
import ChatBubbleOutlineOutlinedIcon from "@mui/icons-material/ChatBubbleOutlineOutlined"
import MenuBookIcon from "@mui/icons-material/MenuBook"
import { ChatMessage, StreamingMessage, useSourceFiles } from "./chat-message"
import { ChatInput } from "./chat-input"
import { useChatStore, chatMessagesToLLM } from "@/stores/chat-store"
import { useWikiStore } from "@/stores/wiki-store"
import { streamChat, type ChatMessage as LLMMessage } from "@/lib/llm-client"
import { executeIngestWrites } from "@/lib/ingest"
import { listDirectory, readFile, deleteFile } from "@/commands/fs"
import { searchWiki } from "@/lib/search"
import { buildRetrievalGraph, getRelatedNodes } from "@/lib/graph-relevance"
import { getFileName } from "@/lib/path-utils"
import { detectLanguage } from "@/lib/detect-language"

// Store the page mapping from the last query so SourceFilesBar can show which pages were cited
export let lastQueryPages: { title: string; relativePath: string }[] = []

function formatDate(timestamp: number): string {
  const d = new Date(timestamp)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" })
}

/** Header bar: title + new chat button + history popover button */
function ChatHeader() {
  const { t } = useTranslation()
  const conversations = useChatStore((s) => s.conversations)
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const messages = useChatStore((s) => s.messages)
  const createConversation = useChatStore((s) => s.createConversation)
  const deleteConversation = useChatStore((s) => s.deleteConversation)
  const setActiveConversation = useChatStore((s) => s.setActiveConversation)

  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const historyOpen = Boolean(anchorEl)

  const activeConv = conversations.find((c) => c.id === activeConversationId)
  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)

  function getMessageCount(convId: string): number {
    return messages.filter((m) => m.conversationId === convId).length
  }

  return (
    <>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          height: 38,
          px: 1.5,
          gap: 0.5,
          flexShrink: 0,
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        {/* Title */}
        <Typography
          variant="caption"
          noWrap
          sx={{
            flex: 1,
            minWidth: 0,
            fontWeight: 600,
            fontSize: "0.8rem",
            color: "text.primary",
            letterSpacing: "0.01em",
          }}
        >
          {activeConv?.title ?? t("chat.aiChat")}
        </Typography>

        {/* New conversation */}
        <Tooltip title={t("chat.newChat")} placement="bottom" enterDelay={400}>
          <IconButton
            size="small"
            onClick={() => createConversation()}
            sx={{
              flexShrink: 0,
              width: 26,
              height: 26,
              borderRadius: "8px",
              color: "text.secondary",
              "&:hover": { color: "primary.main", bgcolor: "rgba(194,65,12,0.08)" },
            }}
          >
            <AddIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>

        {/* History popover */}
        <Tooltip title={t("chat.history")} placement="bottom" enterDelay={400}>
          <IconButton
            size="small"
            onClick={(e) => setAnchorEl(e.currentTarget)}
            sx={{
              flexShrink: 0,
              width: 26,
              height: 26,
              borderRadius: "8px",
              color: historyOpen ? "primary.main" : "text.secondary",
              bgcolor: historyOpen ? "rgba(194,65,12,0.08)" : "transparent",
              "&:hover": { color: "primary.main", bgcolor: "rgba(194,65,12,0.08)" },
            }}
          >
            <HistoryOutlined sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* History Popover */}
      <Popover
        open={historyOpen}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            sx: {
              width: 260,
              maxHeight: 400,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              borderRadius: "10px",
              border: "1px solid",
              borderColor: "divider",
              boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
              bgcolor: "background.paper",
              mt: 0.5,
            },
          },
        }}
      >
        <Box sx={{ borderBottom: "1px solid", borderColor: "divider", px: 1.5, py: 1 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.06em", fontSize: "0.7rem" }}>
            {t("chat.historyTitle")}
          </Typography>
        </Box>

        <Box sx={{ flex: 1, overflowY: "auto", py: 0.5 }}>
          {sorted.length === 0 ? (
            <Typography variant="caption" sx={{ display: "block", px: 1.5, py: 2, textAlign: "center", color: "text.secondary" }}>
              {t("chat.noConversations")}
            </Typography>
          ) : (
            sorted.map((conv) => {
              const isActive = conv.id === activeConversationId
              const msgCount = getMessageCount(conv.id)
              return (
                <Box
                  key={conv.id}
                  onClick={() => { setActiveConversation(conv.id); setAnchorEl(null) }}
                  onMouseEnter={() => setHoveredId(conv.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  sx={{
                    position: "relative",
                    mx: 0.5,
                    my: 0.25,
                    display: "flex",
                    cursor: "pointer",
                    flexDirection: "column",
                    borderRadius: 1,
                    px: 1,
                    py: 0.75,
                    transition: "background-color 0.12s ease",
                    ...(isActive
                      ? { bgcolor: "rgba(194,65,12,0.06)", color: "primary.main", borderLeft: "2px solid", borderColor: "primary.main" }
                      : { color: "text.primary", borderLeft: "2px solid transparent", "&:hover": { bgcolor: "action.hover" } }),
                  }}
                >
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: "flex-start", justifyContent: "space-between" }}>
                    <Typography
                      variant="caption"
                      sx={{ flex: 1, fontWeight: 600, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                    >
                      {conv.title}
                    </Typography>
                    {hoveredId === conv.id && (
                      <IconButton
                        size="small"
                        sx={{ flexShrink: 0, p: 0.25, color: "text.secondary", "&:hover": { color: "error.main" } }}
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteConversation(conv.id)
                          const proj = useWikiStore.getState().project
                          if (proj) {
                          deleteFile(proj.id, `.llm-wiki/chats/${conv.id}.json`).catch(() => {})
                          }
                        }}
                      >
                        <DeleteOutlineOutlinedIcon sx={{ fontSize: 12 }} />
                      </IconButton>
                    )}
                  </Stack>
                  <Stack direction="row" spacing={0.75} sx={{ mt: 0.25, alignItems: "center" }}>
                    <Typography variant="caption" sx={{ fontSize: "0.625rem", color: "text.secondary" }}>
                      {formatDate(conv.updatedAt)}
                    </Typography>
                    {msgCount > 0 && (
                      <>
                        <Typography variant="caption" sx={{ fontSize: "0.625rem", color: "text.secondary" }}>·</Typography>
                        <Typography variant="caption" sx={{ fontSize: "0.625rem", color: "text.secondary" }}>
                          {t("chat.msgs", { count: msgCount })}
                        </Typography>
                      </>
                    )}
                  </Stack>
                </Box>
              )
            })
          )}
        </Box>
      </Popover>
    </>
  )
}

export function ChatPanel() {
  const { t } = useTranslation()
  useSourceFiles() // Keep source file cache warm
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const streamingContent = useChatStore((s) => s.streamingContent)
  const mode = useChatStore((s) => s.mode)
  const addMessage = useChatStore((s) => s.addMessage)
  const setStreaming = useChatStore((s) => s.setStreaming)
  const appendStreamToken = useChatStore((s) => s.appendStreamToken)
  const finalizeStream = useChatStore((s) => s.finalizeStream)

  // RAF-based token queue: React 18 batches sync state updates inside the same
  // event loop tick, so rapid `appendStreamToken` calls from a single SSE chunk
  // collapse into one render (content appears "all at once").
  // Queuing tokens and flushing at most once per animation frame (≈16ms / 60fps)
  // ensures smooth, progressive character-by-character reveal.
  const tokenQueueRef = useRef("")
  const rafIdRef     = useRef<number | null>(null)

  const flushTokens = useCallback(() => {
    rafIdRef.current = null
    if (tokenQueueRef.current) {
      appendStreamToken(tokenQueueRef.current)
      tokenQueueRef.current = ""
    }
  }, [appendStreamToken])

  const enqueueToken = useCallback((token: string) => {
    tokenQueueRef.current += token
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(flushTokens)
    }
  }, [flushTokens])
  const createConversation = useChatStore((s) => s.createConversation)
  const removeLastAssistantMessage = useChatStore((s) => s.removeLastAssistantMessage)
  const maxHistoryMessages = useChatStore((s) => s.maxHistoryMessages)

  const allMessages = useChatStore((s) => s.messages)
  const activeMessages = activeConversationId
    ? allMessages.filter((m) => m.conversationId === activeConversationId)
    : []

  const project = useWikiStore((s) => s.project)
  const llmConfig = useWikiStore((s) => s.llmConfig)
  const setFileTree = useWikiStore((s) => s.setFileTree)

  const abortRef = useRef<AbortController | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = scrollContainerRef.current
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  }, [activeMessages, streamingContent])

  const handleSend = useCallback(
    async (text: string) => {
      let convId = useChatStore.getState().activeConversationId
      if (!convId) {
        convId = createConversation()
      }

      addMessage("user", text)
      setStreaming(true)

      const systemMessages: LLMMessage[] = []
      let queryRefs: { title: string; relativePath: string }[] = []
      if (project) {
        const dataVersion = useWikiStore.getState().dataVersion
        const maxCtx = llmConfig.maxContextSize || 204800

        const INDEX_BUDGET = Math.floor(maxCtx * 0.05)
        const PAGE_BUDGET = Math.floor(maxCtx * 0.6)
        const MAX_PAGE_SIZE = Math.min(Math.floor(PAGE_BUDGET * 0.3), 30_000)

        const [rawIndex, purpose] = await Promise.all([
          readFile(project.id, "wiki/index.md").catch(() => ""),
          readFile(project.id, "purpose.md").catch(() => ""),
        ])

        const searchResults = await searchWiki(project.id, text)
        const topSearchResults = searchResults.slice(0, 10)

        let index = rawIndex
        if (rawIndex.length > INDEX_BUDGET) {
          const { tokenizeQuery } = await import("@/lib/search")
          const tokens = tokenizeQuery(text)
          const lines = rawIndex.split("\n")
          const keptLines: string[] = []
          let keptSize = 0

          for (const line of lines) {
            const isHeader = line.startsWith("##")
            const lower = line.toLowerCase()
            const isRelevant = tokens.some((tok) => lower.includes(tok))

            if (isHeader || isRelevant) {
              if (keptSize + line.length + 1 <= INDEX_BUDGET) {
                keptLines.push(line)
                keptSize += line.length + 1
              }
            }
          }
          index = keptLines.join("\n")
          if (index.length < rawIndex.length) {
            index += "\n\n[...index trimmed to relevant entries...]"
          }
        }

        const graph = await buildRetrievalGraph(project.id, dataVersion)
        const expandedIds = new Set<string>()
        const searchHitPaths = new Set(topSearchResults.map((r) => r.relativePath))
        const graphExpansions: { title: string; relativePath: string; relevance: number }[] = []

        for (const result of topSearchResults) {
          const fileName = getFileName(result.relativePath)
          const nodeId = fileName.replace(/\.md$/, "")
          const related = getRelatedNodes(nodeId, graph, 3)
          for (const { node, relevance } of related) {
            if (relevance < 2.0) continue
            if (searchHitPaths.has(node.relativePath)) continue
            if (expandedIds.has(node.id)) continue
            expandedIds.add(node.id)
            graphExpansions.push({ title: node.title, relativePath: node.relativePath, relevance })
          }
        }
        graphExpansions.sort((a, b) => b.relevance - a.relevance)

        let usedChars = 0
        type PageEntry = { title: string; relativePath: string; content: string; priority: number }
        const relevantPages: PageEntry[] = []

        const tryAddPage = async (title: string, relPath: string, priority: number): Promise<boolean> => {
          if (usedChars >= PAGE_BUDGET) return false
          try {
            const raw = await readFile(project.id, relPath)
            const truncated = raw.length > MAX_PAGE_SIZE
              ? raw.slice(0, MAX_PAGE_SIZE) + "\n\n[...truncated...]"
              : raw
            if (usedChars + truncated.length > PAGE_BUDGET) return false
            usedChars += truncated.length
            relevantPages.push({ title, relativePath: relPath, content: truncated, priority })
            return true
          } catch { return false }
        }

        for (const r of topSearchResults.filter((r) => r.titleMatch)) {
          await tryAddPage(r.title, r.relativePath, 0)
        }
        for (const r of topSearchResults.filter((r) => !r.titleMatch)) {
          await tryAddPage(r.title, r.relativePath, 1)
        }
        for (const exp of graphExpansions) {
          await tryAddPage(exp.title, exp.relativePath, 2)
        }
        if (relevantPages.length === 0) {
          await tryAddPage("Overview", "wiki/overview.md", 3)
        }

        const pagesContext = relevantPages.length > 0
          ? relevantPages.map((p, i) =>
              `### [${i + 1}] ${p.title}\nPath: ${p.relativePath}\n\n${p.content}`
            ).join("\n\n---\n\n")
          : "(No wiki pages found)"

        const pageList = relevantPages.map((p, i) =>
          `[${i + 1}] ${p.title} (${p.relativePath})`
        ).join("\n")

        systemMessages.push({
          role: "system",
          content: [
            "You are a knowledgeable wiki assistant. Answer questions based on the wiki content provided below.",
            "",
            `## CRITICAL: Response Language`,
            `The user is writing in **${detectLanguage(text)}**. You MUST respond in **${detectLanguage(text)}** regardless of what language the wiki content is written in. This is a mandatory requirement.`,
            "",
            "## Rules",
            "- Answer based ONLY on the numbered wiki pages provided below.",
            "- If the provided pages don't contain enough information, say so honestly.",
            "- Use [[wikilink]] syntax to reference wiki pages.",
            "- When citing information, use the page number in brackets, e.g. [1], [2].",
            "- At the VERY END of your response, add a hidden comment listing which page numbers you used:",
            "  <!-- cited: 1, 3, 5 -->",
            "",
            "Use markdown formatting for clarity.",
            "",
            purpose ? `## Wiki Purpose\n${purpose}` : "",
            index ? `## Wiki Index\n${index}` : "",
            relevantPages.length > 0 ? `## Page List\n${pageList}` : "",
            `## Wiki Pages\n\n${pagesContext}`,
          ].filter(Boolean).join("\n"),
        })

        lastQueryPages = relevantPages.map((p) => ({ title: p.title, relativePath: p.relativePath }))
        queryRefs = [...lastQueryPages]
      }

      const activeConvMessages = useChatStore.getState().getActiveMessages()
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-maxHistoryMessages)

      const llmMessages = [...systemMessages, ...chatMessagesToLLM(activeConvMessages)]

      const controller = new AbortController()
      abortRef.current = controller

      let accumulated = ""

      await streamChat(
        llmMessages,
        {
          onToken: (token: string) => {
            accumulated += token
            enqueueToken(token)
          },
          onDone: () => {
            finalizeStream(accumulated, queryRefs)
            abortRef.current = null
          },
          onError: (err: Error) => {
            finalizeStream(`${t("chat.error")}${err.message}`, undefined)
            abortRef.current = null
          },
        },
        controller.signal,
      )
    },
    [addMessage, setStreaming, enqueueToken, finalizeStream, createConversation, maxHistoryMessages, t, project],
  )

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const handleRegenerate = useCallback(async () => {
    if (isStreaming) return
    const active = useChatStore.getState().getActiveMessages()
    const lastUserMsg = [...active].reverse().find((m) => m.role === "user")
    if (!lastUserMsg) return
    removeLastAssistantMessage()
    await new Promise((r) => setTimeout(r, 50))
    const store = useChatStore.getState()
    const updatedActive = store.getActiveMessages()
    const lastUser = [...updatedActive].reverse().find((m) => m.role === "user")
    if (lastUser) {
      useChatStore.setState((s) => ({
        messages: s.messages.filter((m) => m.id !== lastUser.id),
      }))
    }
    handleSend(lastUserMsg.content)
  }, [isStreaming, removeLastAssistantMessage, handleSend])

  const handleWriteToWiki = useCallback(async () => {
    if (!project) return
    try {
      await executeIngestWrites(project.id, llmConfig, undefined, undefined)
      try {
        const tree = await listDirectory(project.id)
        setFileTree(tree)
      } catch {
        // ignore
      }
    } catch (err) {
      console.error("Failed to write to wiki:", err)
    }
  }, [project, llmConfig, setFileTree])

  const hasAssistantMessages = activeMessages.some((m) => m.role === "assistant")
  const showWriteButton = mode === "ingest" && !isStreaming && hasAssistantMessages

  return (
    <Stack sx={{ height: 1, overflow: "hidden" }}>
      <ChatHeader />

      {!activeConversationId ? (
        <Stack
          sx={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            color: "text.secondary",
          }}
        >
          <ChatBubbleOutlineOutlinedIcon sx={{ fontSize: 32, mb: 1.5, opacity: 0.2, color: "primary.main" }} />
          <Typography variant="body2">{t("chat.startConversation")}</Typography>
          <Typography variant="caption" sx={{ mt: 0.5, opacity: 0.6 }}>
            {t("chat.clickNewChat")}
          </Typography>
        </Stack>
      ) : (
        <>
          <Box ref={scrollContainerRef} sx={{ flex: 1, overflowY: "auto", px: 1.5, py: 1 }}>
            <Stack spacing={2.5}>
              {activeMessages.map((msg, idx) => {
                const isLastAssistant = msg.role === "assistant" &&
                  !activeMessages.slice(idx + 1).some((m) => m.role === "assistant")
                return (
                  <ChatMessage
                    key={msg.id}
                    message={msg}
                    isLastAssistant={isLastAssistant && !isStreaming}
                    onRegenerate={isLastAssistant ? handleRegenerate : undefined}
                  />
                )
              })}
              {isStreaming && <StreamingMessage content={streamingContent} />}
              <div ref={bottomRef} />
            </Stack>
          </Box>

          {showWriteButton && (
            <Box sx={{ borderTop: 1, borderColor: "divider", px: 1.5, py: 1 }}>
              <Button
                variant="outlined"
                size="small"
                fullWidth
                startIcon={<MenuBookIcon sx={{ fontSize: 18 }} />}
                onClick={handleWriteToWiki}
              >
                {t("chat.writeToWiki")}
              </Button>
            </Box>
          )}
        </>
      )}

      <ChatInput
        onSend={handleSend}
        onStop={handleStop}
        isStreaming={isStreaming}
        placeholder={
          mode === "ingest"
            ? t("chat.ingestPlaceholder")
            : t("chat.placeholder")
        }
      />
    </Stack>
  )
}
