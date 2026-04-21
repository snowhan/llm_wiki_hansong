import { useState, useEffect, useCallback } from "react"
import { useTranslation } from "react-i18next"
import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import i18n from "@/i18n"
import { useWikiStore } from "@/stores/wiki-store"
import { useAuthStore } from "@/stores/auth-store"
import { useChatStore } from "@/stores/chat-store"
import { listDirectory, openProject } from "@/commands/fs"
import {
  getLastProject,
  saveLastProject,
  loadLlmConfig,
  loadLanguage,
  loadSearchApiConfig,
  loadEmbeddingConfig,
} from "@/lib/project-store"
import { loadChatHistory } from "@/lib/persist"
import { setupAutoSave } from "@/lib/auto-save"
import { AppLayout } from "@/components/layout/app-layout"
import { WelcomeScreen } from "@/components/project/welcome-screen"
import { AuthModal } from "@/components/auth/AuthModal"
import { CreateProjectDialog } from "@/components/project/create-project-dialog"
import { ServerDirBrowser } from "@/components/project/server-dir-browser"
import { CommandPalette } from "@/components/command-palette/command-palette"
import { apiGet } from "@/lib/api-client"
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
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [loading, setLoading] = useState(true)
  // Action to execute automatically once the user logs in
  const [pendingPostLogin, setPendingPostLogin] = useState<null | "open" | "create">(null)
  const [projectsRoot, setProjectsRoot] = useState("")

  useEffect(() => {
    apiGet<{ projectsRoot: string }>("/api/project/root")
      .then(({ projectsRoot: root }) => setProjectsRoot(root))
      .catch(() => {})
  }, [])

  // Global ⌘K / Ctrl+K shortcut for Command Palette
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault()
      setShowCommandPalette((prev) => !prev)
    }
  }, [])

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  const initializeAuth = useAuthStore((s) => s.initialize)
  const authUser = useAuthStore((s) => s.user)
  const isAuthInitializing = useAuthStore((s) => s.isInitializing)

  useEffect(() => {
    setupAutoSave()
    initializeAuth()
  }, [initializeAuth])

  // Load app preferences and last project after auth initializes.
  // Use authUser?.id (primitive) to avoid re-running on every token refresh
  // that creates a new user object reference.
  useEffect(() => {
    if (isAuthInitializing) return

    async function init() {
      try {
        const currentUser = useAuthStore.getState().user
        if (currentUser) {
          const savedLang = await loadLanguage()
          if (savedLang) {
            await i18n.changeLanguage(savedLang)
          }
          const lastProject = await getLastProject()
          if (lastProject?.id) {
            try {
              await handleProjectOpened(lastProject)
            } catch {
              // Last project no longer valid
            }
          }
        }
      } catch {
        // ignore init errors
      } finally {
        setLoading(false)
      }
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthInitializing, authUser?.id])

  // Load admin-only configs after auth is confirmed
  useEffect(() => {
    if (isAuthInitializing) return
    if (authUser?.role !== "admin") return
    async function loadAdminConfigs() {
      try {
        const savedConfig = await loadLlmConfig()
        if (savedConfig) useWikiStore.getState().setLlmConfig(savedConfig)
        const savedSearchConfig = await loadSearchApiConfig()
        if (savedSearchConfig) useWikiStore.getState().setSearchApiConfig(savedSearchConfig)
        const savedEmbeddingConfig = await loadEmbeddingConfig()
        if (savedEmbeddingConfig) useWikiStore.getState().setEmbeddingConfig(savedEmbeddingConfig)
      } catch {
        // ignore — user may have lost admin access
      }
    }
    loadAdminConfigs()
  }, [isAuthInitializing, authUser])

  async function handleProjectOpened(proj: WikiProject) {
    setProject(proj)
    setSelectedFile(null)
    setActiveView("wiki")
    await saveLastProject(proj)

    try {
      const tree = await listDirectory(proj.id)
      setFileTree(tree)
    } catch (err) {
      console.error("Failed to load file tree:", err)
    }
    try {
      const savedChat = await loadChatHistory(proj.id)
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
      await handleProjectOpened(proj)
    } catch (err) {
      window.alert(t("app.failedToOpen", { err }))
    }
  }

  // After a successful login, automatically open the dialog the user originally requested
  useEffect(() => {
    if (!authUser || !pendingPostLogin) return
    const action = pendingPostLogin
    setPendingPostLogin(null)
    if (action === "open") setShowBrowseDialog(true)
    else if (action === "create") setShowCreateDialog(true)
  }, [authUser, pendingPostLogin])

  function requireAdminThen(action: "open" | "create") {
    if (!authUser) {
      setPendingPostLogin(action)
      setShowAuthModal(true)
      return false
    }
    return true
  }

  function handleOpenProject() {
    if (requireAdminThen("open")) setShowBrowseDialog(true)
  }

  function handleCreateProject() {
    if (requireAdminThen("create")) setShowCreateDialog(true)
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
        bgcolor: "background.default",
        color: "text.secondary",
        flexDirection: "column",
        gap: 2,
      }}>
        <Box sx={{
          width: 48,
          height: 2,
          bgcolor: "primary.main",
          borderRadius: 1,
          animation: "loadPulse 1.6s ease-in-out infinite",
          "@keyframes loadPulse": {
            "0%, 100%": { opacity: 0.3, width: 48 },
            "50%": { opacity: 1, width: 72 },
          },
        }} />
        <Typography variant="caption" sx={{ letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500 }}>
          {t("app.loading")}
        </Typography>
      </Box>
    )
  }

  if (!project) {
    return (
      <>
        <WelcomeScreen
          onCreateProject={handleCreateProject}
          onOpenProject={handleOpenProject}
          onSelectProject={handleSelectRecent}
          onLogin={() => setShowAuthModal(true)}
        />
        <AuthModal open={showAuthModal} onClose={() => setShowAuthModal(false)} />
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
          initialPath={projectsRoot || undefined}
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
        initialPath={projectsRoot || undefined}
      />
      <CommandPalette open={showCommandPalette} onClose={() => setShowCommandPalette(false)} />
    </>
  )
}

export default App
