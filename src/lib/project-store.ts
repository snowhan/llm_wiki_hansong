import { apiGet, apiPut } from "@/lib/api-client"
import type { WikiProject } from "@/types/wiki"
import type { LlmConfig, SearchApiConfig, EmbeddingConfig } from "@/stores/wiki-store"

const RECENT_PROJECTS_KEY = "recentProjects"
const LAST_PROJECT_KEY = "lastProject"

export async function getRecentProjects(): Promise<WikiProject[]> {
  const projects = await apiGet<WikiProject[] | null>(`/api/state/${RECENT_PROJECTS_KEY}`)
  return projects ?? []
}

export async function getLastProject(): Promise<WikiProject | null> {
  const project = await apiGet<WikiProject | null>(`/api/state/${LAST_PROJECT_KEY}`)
  return project ?? null
}

export async function saveLastProject(project: WikiProject): Promise<void> {
  await apiPut(`/api/state/${LAST_PROJECT_KEY}`, { value: project })
  await addToRecentProjects(project)
}

export async function addToRecentProjects(
  project: WikiProject
): Promise<void> {
  const existing = await getRecentProjects()
  const filtered = existing.filter((p) => p.path !== project.path)
  const updated = [project, ...filtered].slice(0, 10)
  await apiPut(`/api/state/${RECENT_PROJECTS_KEY}`, { value: updated })
}

const LLM_CONFIG_KEY = "llmConfig"

export async function saveLlmConfig(config: LlmConfig): Promise<void> {
  await apiPut(`/api/state/${LLM_CONFIG_KEY}`, { value: config })
}

export async function loadLlmConfig(): Promise<LlmConfig | null> {
  return apiGet<LlmConfig | null>(`/api/state/${LLM_CONFIG_KEY}`)
}

const SEARCH_API_KEY = "searchApiConfig"

export async function saveSearchApiConfig(config: SearchApiConfig): Promise<void> {
  await apiPut(`/api/state/${SEARCH_API_KEY}`, { value: config })
}

export async function loadSearchApiConfig(): Promise<SearchApiConfig | null> {
  return apiGet<SearchApiConfig | null>(`/api/state/${SEARCH_API_KEY}`)
}

const EMBEDDING_KEY = "embeddingConfig"

export async function saveEmbeddingConfig(config: EmbeddingConfig): Promise<void> {
  await apiPut(`/api/state/${EMBEDDING_KEY}`, { value: config })
}

export async function loadEmbeddingConfig(): Promise<EmbeddingConfig | null> {
  return apiGet<EmbeddingConfig | null>(`/api/state/${EMBEDDING_KEY}`)
}

export async function removeFromRecentProjects(
  path: string
): Promise<void> {
  const existing = await getRecentProjects()
  const updated = existing.filter((p) => p.path !== path)
  await apiPut(`/api/state/${RECENT_PROJECTS_KEY}`, { value: updated })
}

const LANGUAGE_KEY = "language"

export async function saveLanguage(lang: string): Promise<void> {
  await apiPut(`/api/state/${LANGUAGE_KEY}`, { value: lang })
}

export async function loadLanguage(): Promise<string | null> {
  return apiGet<string | null>(`/api/state/${LANGUAGE_KEY}`)
}
