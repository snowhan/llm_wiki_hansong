import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import i18n from "@/i18n"
import { useWikiStore } from "@/stores/wiki-store"
import { useReviewStore } from "@/stores/review-store"
import { useChatStore } from "@/stores/chat-store"
import { listDirectory, openProject } from "@/commands/fs"
import { getLastProject, saveLastProject, loadLlmConfig, loadLanguage, loadSearchApiConfig, loadEmbeddingConfig } from "@/lib/project-store"
import { loadReviewItems, loadChatHistory } from "@/lib/persist"
import { setupAutoSave } from "@/lib/auto-save"
import { startClipWatcher } from "@/lib/clip-watcher"
import { AppLayout } from "@/components/layout/app-layout"
import { WelcomeScreen } from "@/components/project/welcome-screen"
import { CreateProjectDialog } from "@/components/project/create-project-dialog"
import { ServerDirBrowser } from "@/components/project/server-dir-browser"
import type { WikiProject } from "@/types/wiki"

function App() {
  const { t } = useTranslation()
  const project = useWikiStore((s) => s.project)
  const setProject = useWikiStore((s) => s.setProject)
  const setFileTree = useWikiStore((s) => s.setFileTree)
  const setSelectedFile = useWikiStore((s) => s.setSelectedFile)
  const setActiveView = useWikiStore((s) => s.setActiveView)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showBrowseDialog, setShowBrowseDialog] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setupAutoSave()
    startClipWatcher()
  }, [])

  useEffect(() => {
    async function init() {
      try {
        const savedConfig = await loadLlmConfig()
        if (savedConfig) {
          useWikiStore.getState().setLlmConfig(savedConfig)
        }
        const savedSearchConfig = await loadSearchApiConfig()
        if (savedSearchConfig) {
          useWikiStore.getState().setSearchApiConfig(savedSearchConfig)
        }
        const savedEmbeddingConfig = await loadEmbeddingConfig()
        if (savedEmbeddingConfig) {
          useWikiStore.getState().setEmbeddingConfig(savedEmbeddingConfig)
        }
        const savedLang = await loadLanguage()
        if (savedLang) {
          await i18n.changeLanguage(savedLang)
        }
        const lastProject = await getLastProject()
        if (lastProject) {
          try {
            const proj = await openProject(lastProject.path)
            await handleProjectOpened(proj)
          } catch {
            // Last project no longer valid
          }
        }
      } catch {
        // ignore init errors
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  async function handleProjectOpened(proj: WikiProject) {
    setProject(proj)
    setSelectedFile(null)
    setActiveView("wiki")
    await saveLastProject(proj)

    import("@/lib/ingest-queue").then(({ restoreQueue }) => {
      restoreQueue(proj.path).catch((err) =>
        console.error("Failed to restore ingest queue:", err)
      )
    })
    try {
      const tree = await listDirectory(proj.path)
      setFileTree(tree)
    } catch (err) {
      console.error("Failed to load file tree:", err)
    }
    try {
      const savedReview = await loadReviewItems(proj.path)
      if (savedReview.length > 0) {
        useReviewStore.getState().setItems(savedReview)
      }
    } catch {
      // ignore, start fresh
    }
    try {
      const savedChat = await loadChatHistory(proj.path)
      if (savedChat.conversations.length > 0) {
        useChatStore.getState().setConversations(savedChat.conversations)
        useChatStore.getState().setMessages(savedChat.messages)
        const sorted = [...savedChat.conversations].sort((a, b) => b.updatedAt - a.updatedAt)
        if (sorted[0]) {
          useChatStore.getState().setActiveConversation(sorted[0].id)
        }
      }
    } catch {
      // ignore, start fresh
    }
  }

  async function handleSelectRecent(proj: WikiProject) {
    try {
      const validated = await openProject(proj.path)
      await handleProjectOpened(validated)
    } catch (err) {
      window.alert(t("app.failedToOpen", { err }))
    }
  }

  function handleOpenProject() {
    setShowBrowseDialog(true)
  }

  async function handleBrowseSelect(selectedPath: string) {
    try {
      const proj = await openProject(selectedPath)
      await handleProjectOpened(proj)
    } catch (err) {
      window.alert(t("app.failedToOpen", { err }))
    }
  }

  function handleSwitchProject() {
    setProject(null)
    setFileTree([])
    setSelectedFile(null)
  }

  if (loading) {
    return (
      <Box sx={{
        display: "flex",
        height: "100vh",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "#141218",
        color: "rgba(245,243,239,0.5)",
        flexDirection: "column",
        gap: 2,
      }}>
        <Box sx={{
          width: 48,
          height: 2,
          bgcolor: "#C2410C",
          borderRadius: 1,
          animation: "loadPulse 2s ease-in-out infinite",
          "@keyframes loadPulse": {
            "0%, 100%": { opacity: 0.3, width: 48 },
            "50%": { opacity: 1, width: 72 },
          },
        }} />
        <Typography sx={{ fontSize: "0.8rem", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500 }}>{t("app.loading")}</Typography>
      </Box>
    )
  }

  if (!project) {
    return (
      <>
        <WelcomeScreen
          onCreateProject={() => setShowCreateDialog(true)}
          onOpenProject={handleOpenProject}
          onSelectProject={handleSelectRecent}
        />
        <CreateProjectDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          onCreated={handleProjectOpened}
        />
        <ServerDirBrowser
          open={showBrowseDialog}
          onClose={() => setShowBrowseDialog(false)}
          onSelect={handleBrowseSelect}
          title={t("app.openWikiProject")}
        />
      </>
    )
  }

  return (
    <>
      <AppLayout onSwitchProject={handleSwitchProject} />
      <CreateProjectDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreated={handleProjectOpened}
      />
      <ServerDirBrowser
        open={showBrowseDialog}
        onClose={() => setShowBrowseDialog(false)}
        onSelect={handleBrowseSelect}
        title={t("app.openWikiProject")}
      />
    </>
  )
}

export default App
