import { useWikiStore } from "@/stores/wiki-store"
import { SettingsView } from "@/components/settings/settings-view"
import { SourcesView } from "@/components/sources/sources-view"
import { ReviewView } from "@/components/review/review-view"
import { LintView } from "@/components/lint/lint-view"
import { SearchView } from "@/components/search/search-view"
import { GraphView } from "@/components/graph/graph-view"
import { AdminView } from "@/components/admin/admin-view"
import { MappingReviewView } from "@/components/sources/mapping-review-view"
import { LlmDebugView } from "@/components/debug/llm-debug-view"

export function ContentArea() {
  const activeView = useWikiStore((s) => s.activeView)

  switch (activeView) {
    case "settings":
      return <SettingsView />
    case "sources":
      return <SourcesView />
    case "review":
      return <ReviewView />
    case "mapping-check":
      return <MappingReviewView />
    case "llm-debug":
      return <LlmDebugView />
    case "lint":
      return <LintView />
    case "search":
      return <SearchView />
    case "graph":
      return <GraphView />
    case "admin":
      return <AdminView />
    default:
      return null
  }
}
