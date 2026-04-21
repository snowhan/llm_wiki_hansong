import { useWikiStore } from "@/stores/wiki-store"
import { SettingsView } from "@/components/settings/settings-view"
import { SourcesView } from "@/components/sources/sources-view"
import { LintView } from "@/components/lint/lint-view"
import { SearchView } from "@/components/search/search-view"
import { GraphView } from "@/components/graph/graph-view"
import { LlmDebugView } from "@/components/debug/llm-debug-view"
import Box from "@mui/material/Box"

/** Non-wiki views rendered in the main content column. */
export function ContentArea() {
  const activeView = useWikiStore((s) => s.activeView)

  // Wiki view is handled by EditorArea — ContentArea is not responsible for it
  if (activeView === "wiki") return null

  return (
    <Box
      sx={{
        height: "100%",
        overflow: "hidden",
        viewTransitionName: "main-content",
      }}
    >
      {activeView === "settings"   && <SettingsView />}
      {activeView === "sources"    && <SourcesView />}
      {activeView === "llm-debug"  && <LlmDebugView />}
      {activeView === "lint"       && <LintView />}
      {activeView === "search"     && <SearchView />}
      {activeView === "graph"      && <GraphView />}
    </Box>
  )
}
