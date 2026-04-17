import { useWikiStore } from "@/stores/wiki-store"
import { useChatStore } from "@/stores/chat-store"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import TextField from "@mui/material/TextField"
import Typography from "@mui/material/Typography"
import Stack from "@mui/material/Stack"
import ToggleButton from "@mui/material/ToggleButton"
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup"
import Switch from "@mui/material/Switch"
import Slider from "@mui/material/Slider"
import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import i18n from "@/i18n"
import { saveLanguage } from "@/lib/project-store"

const PROVIDERS = [
  { value: "openai" as const, label: "OpenAI", models: ["gpt-4o", "gpt-4.1", "gpt-4o-mini"] },
  { value: "anthropic" as const, label: "Anthropic", models: ["claude-sonnet-4-5-20250514", "claude-opus-4-5-20250514", "claude-haiku-4-5-20251001"] },
  { value: "google" as const, label: "Google", models: ["gemini-2.5-pro", "gemini-2.5-flash"] },
  { value: "minimax" as const, label: "MiniMax", models: ["MiniMax-M2.7", "MiniMax-M2.7-highspeed"] },
  { value: "wps" as const, label: "WPS AI Gateway", models: ["azure/gpt-5.4"] },
  { value: "ollama" as const, label: "Ollama (Local)", models: [] },
  { value: "custom" as const, label: "Custom", models: [] },
]

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "zh", label: "中文" },
]

const HISTORY_OPTIONS = [2, 4, 6, 8, 10, 20]

export function SettingsView() {
  const { t } = useTranslation()
  const llmConfig = useWikiStore((s) => s.llmConfig)
  const setLlmConfig = useWikiStore((s) => s.setLlmConfig)
  const searchApiConfig = useWikiStore((s) => s.searchApiConfig)
  const setSearchApiConfig = useWikiStore((s) => s.setSearchApiConfig)
  const embeddingConfig = useWikiStore((s) => s.embeddingConfig)
  const setEmbeddingConfig = useWikiStore((s) => s.setEmbeddingConfig)
  const maxHistoryMessages = useChatStore((s) => s.maxHistoryMessages)
  const setMaxHistoryMessages = useChatStore((s) => s.setMaxHistoryMessages)

  const [provider, setProvider] = useState(llmConfig.provider)
  const [apiKey, setApiKey] = useState(llmConfig.apiKey)
  const [model, setModel] = useState(llmConfig.model)
  const [ollamaUrl, setOllamaUrl] = useState(llmConfig.ollamaUrl)
  const [customEndpoint, setCustomEndpoint] = useState(llmConfig.customEndpoint)
  const [maxContextSize, setMaxContextSize] = useState(llmConfig.maxContextSize ?? 204800)
  const [searchProvider, setSearchProvider] = useState(searchApiConfig.provider)
  const [searchApiKey, setSearchApiKey] = useState(searchApiConfig.apiKey)
  const [embeddingEnabled, setEmbeddingEnabled] = useState(embeddingConfig.enabled)
  const [embeddingEndpoint, setEmbeddingEndpoint] = useState(embeddingConfig.endpoint)
  const [embeddingApiKey, setEmbeddingApiKey] = useState(embeddingConfig.apiKey)
  const [embeddingModel, setEmbeddingModel] = useState(embeddingConfig.model)
  const [saved, setSaved] = useState(false)
  const [currentLang, setCurrentLang] = useState(i18n.language)

  function providerLabel(p: (typeof PROVIDERS)[0]) {
    if (p.value === "ollama") return t("settings.ollamaLocal")
    if (p.value === "custom") return t("settings.custom")
    return p.label
  }

  useEffect(() => {
    setProvider(llmConfig.provider)
    setApiKey(llmConfig.apiKey)
    setModel(llmConfig.model)
    setOllamaUrl(llmConfig.ollamaUrl)
    setCustomEndpoint(llmConfig.customEndpoint)
  }, [llmConfig])

  useEffect(() => {
    setSearchProvider(searchApiConfig.provider)
    setSearchApiKey(searchApiConfig.apiKey)
  }, [searchApiConfig])

  const currentProvider = PROVIDERS.find((p) => p.value === provider)

  async function handleSave() {
    const { saveLlmConfig, saveSearchApiConfig, saveEmbeddingConfig } = await import("@/lib/project-store")
    const newConfig = { provider, apiKey, model, ollamaUrl, customEndpoint, maxContextSize }
    const newSearchConfig = { provider: searchProvider, apiKey: searchApiKey }
    const newEmbeddingConfig = { enabled: embeddingEnabled, endpoint: embeddingEndpoint, apiKey: embeddingApiKey, model: embeddingModel }
    setSearchApiConfig(newSearchConfig)
    await saveSearchApiConfig(newSearchConfig)
    setEmbeddingConfig(newEmbeddingConfig)
    await saveEmbeddingConfig(newEmbeddingConfig)
    setLlmConfig(newConfig)
    await saveLlmConfig(newConfig)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleLanguageChange(lang: string) {
    await i18n.changeLanguage(lang)
    setCurrentLang(lang)
    await saveLanguage(lang)
  }

  return (
    <Box sx={{ height: 1, overflow: "auto", p: 4, bgcolor: "background.default" }}>
      <Box sx={{ mx: "auto", maxWidth: 600 }}>
        <Typography variant="h5" sx={{ mb: 0.5, fontWeight: 700, fontFamily: "'Playfair Display', 'PingFang SC', Georgia, serif" }}>
          {t("settings.title")}
        </Typography>
        <Box sx={{ width: 32, height: 2, bgcolor: "primary.main", borderRadius: 1, mb: 3, opacity: 0.5 }} />

        <Stack spacing={3}>
          {/* Language section */}
          <Box sx={{ border: 1, borderColor: "divider", borderRadius: "12px", p: 2.5, bgcolor: "background.paper" }}>
            <Typography sx={{ fontWeight: 600, mb: 2 }}>{t("settings.language")}</Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={currentLang}
              onChange={(_, v) => v && handleLanguageChange(v)}
            >
              {LANGUAGES.map((lang) => (
                <ToggleButton key={lang.value} value={lang.value}>
                  {lang.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
              {t("settings.languageHint")}
            </Typography>
          </Box>

          {/* LLM Provider section */}
          <Box sx={{ border: 1, borderColor: "divider", borderRadius: "12px", p: 2.5, bgcolor: "background.paper" }}>
            <Typography sx={{ fontWeight: 600, mb: 2 }}>{t("settings.llmProvider")}</Typography>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {t("settings.provider")}
            </Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={provider}
              onChange={(_, v) => {
                if (!v) return
                setProvider(v)
                const p = PROVIDERS.find((x) => x.value === v)
                setModel(p?.models[0] ?? "")
              }}
              sx={{ flexWrap: "wrap", gap: 0.5 }}
            >
              {PROVIDERS.map((p) => (
                <ToggleButton key={p.value} value={p.value}>
                  {providerLabel(p)}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            {provider === "custom" && (
              <Stack spacing={1} sx={{ mt: 2 }}>
                <Typography variant="body2" component="label" htmlFor="customEndpoint">
                  {t("settings.customEndpoint")}
                </Typography>
                <TextField
                  id="customEndpoint"
                  size="small"
                  fullWidth
                  value={customEndpoint}
                  onChange={(e) => setCustomEndpoint(e.target.value)}
                  placeholder="https://your-api.example.com/v1"
                />
                <Typography variant="caption" color="text.secondary">
                  {t("settings.customEndpointHint")}
                </Typography>
              </Stack>
            )}

            {provider === "ollama" && (
              <Stack spacing={1} sx={{ mt: 2 }}>
                <Typography variant="body2" component="label" htmlFor="ollamaUrl">
                  {t("settings.ollamaUrl")}
                </Typography>
                <TextField
                  id="ollamaUrl"
                  size="small"
                  fullWidth
                  value={ollamaUrl}
                  onChange={(e) => setOllamaUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                />
              </Stack>
            )}

            {provider !== "ollama" && provider !== "wps" && (
              <Stack spacing={1} sx={{ mt: 2 }}>
                <Typography variant="body2" component="label" htmlFor="apiKey">
                  {t("settings.apiKey")}
                </Typography>
                <TextField
                  id="apiKey"
                  size="small"
                  fullWidth
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    provider === "custom"
                      ? t("settings.customApiKey")
                      : t("settings.apiKeyPlaceholder", {
                          provider: currentProvider ? providerLabel(currentProvider) : "",
                        })
                  }
                />
              </Stack>
            )}

            {provider === "wps" && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
                WPS AI Gateway 认证信息从 .env 文件读取（VITE_WPS_GATEWAY_TOKEN 等）
              </Typography>
            )}

            <Stack spacing={1} sx={{ mt: 2 }}>
              <Typography variant="body2" component="label" htmlFor="model">
                {t("settings.model")}
              </Typography>
              {currentProvider && currentProvider.models.length > 0 ? (
                <Stack spacing={1}>
                  <ToggleButtonGroup
                    exclusive
                    size="small"
                    value={model}
                    onChange={(_, v) => v && setModel(v)}
                    sx={{ flexWrap: "wrap", gap: 0.5 }}
                  >
                    {currentProvider.models.map((m) => (
                      <ToggleButton key={m} value={m}>
                        {m}
                      </ToggleButton>
                    ))}
                  </ToggleButtonGroup>
                  <TextField
                    size="small"
                    fullWidth
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder={t("settings.customModel")}
                  />
                </Stack>
              ) : (
                <TextField
                  id="model"
                  size="small"
                  fullWidth
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={t("settings.modelPlaceholder")}
                />
              )}
            </Stack>
          </Box>

          {/* Context Window Size */}
          <Box sx={{ border: 1, borderColor: "divider", borderRadius: "12px", p: 2.5, bgcolor: "background.paper" }}>
            <Typography sx={{ fontWeight: 600, mb: 1 }}>{t("settings.contextWindow")}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
              {t("settings.contextWindowDesc")}
            </Typography>
            <ContextSizeSelector value={maxContextSize} onChange={setMaxContextSize} />
          </Box>

          {/* Web Search API section */}
          <Box sx={{ border: 1, borderColor: "divider", borderRadius: "12px", p: 2.5, bgcolor: "background.paper" }}>
            <Typography sx={{ fontWeight: 600, mb: 1 }}>{t("settings.webSearch")}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
              {t("settings.webSearchDesc")}
            </Typography>

            <Typography variant="body2" sx={{ mb: 1 }}>
              {t("settings.searchProvider")}
            </Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={searchProvider}
              onChange={(_, v) => v && setSearchProvider(v)}
            >
              <ToggleButton value="none">{t("settings.disabled")}</ToggleButton>
              <ToggleButton value="tavily">Tavily</ToggleButton>
            </ToggleButtonGroup>

            {searchProvider !== "none" && (
              <Stack spacing={1} sx={{ mt: 2 }}>
                <Typography variant="body2" component="label" htmlFor="searchApiKey">
                  {t("settings.searchApiKeyLabel")}
                </Typography>
                <TextField
                  id="searchApiKey"
                  size="small"
                  fullWidth
                  type="password"
                  value={searchApiKey}
                  onChange={(e) => setSearchApiKey(e.target.value)}
                  placeholder={t("settings.searchApiKeyPlaceholder")}
                />
              </Stack>
            )}
          </Box>

          {/* Embedding Search section */}
          <Box sx={{ border: 1, borderColor: "divider", borderRadius: "12px", p: 2.5, bgcolor: "background.paper" }}>
            <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 1 }}>
              <Typography sx={{ fontWeight: 600 }}>{t("settings.vectorSearch")}</Typography>
              <Switch
                checked={embeddingEnabled}
                onChange={(_, checked) => setEmbeddingEnabled(checked)}
              />
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
              {t("settings.vectorSearchDesc")}
            </Typography>
            {embeddingEnabled && (
              <Stack spacing={1.5}>
                <Stack spacing={0.5}>
                  <Typography variant="body2">{t("settings.endpoint")}</Typography>
                  <TextField
                    size="small"
                    fullWidth
                    value={embeddingEndpoint}
                    onChange={(e) => setEmbeddingEndpoint(e.target.value)}
                    placeholder={t("settings.endpointPlaceholder")}
                  />
                </Stack>
                <Stack spacing={0.5}>
                  <Typography variant="body2">{t("settings.apiKeyOptional")}</Typography>
                  <TextField
                    size="small"
                    fullWidth
                    type="password"
                    value={embeddingApiKey}
                    onChange={(e) => setEmbeddingApiKey(e.target.value)}
                    placeholder={t("settings.leaveEmpty")}
                  />
                </Stack>
                <Stack spacing={0.5}>
                  <Typography variant="body2">{t("settings.model")}</Typography>
                  <TextField
                    size="small"
                    fullWidth
                    value={embeddingModel}
                    onChange={(e) => setEmbeddingModel(e.target.value)}
                    placeholder={t("settings.embeddingModelPlaceholder")}
                  />
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {t("settings.embeddingDesc")}
                </Typography>
              </Stack>
            )}
          </Box>

          {/* Chat History section */}
          <Box sx={{ border: 1, borderColor: "divider", borderRadius: "12px", p: 2.5, bgcolor: "background.paper" }}>
            <Typography sx={{ fontWeight: 600, mb: 1 }}>{t("settings.chatHistory")}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
              {t("settings.chatHistoryDesc")}
            </Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {t("settings.maxMessages")}
            </Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={maxHistoryMessages}
              onChange={(_, v) => v != null && setMaxHistoryMessages(v)}
            >
              {HISTORY_OPTIONS.map((n) => (
                <ToggleButton key={n} value={n}>
                  {n}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
              {t("settings.currentlyMessages", {
                count: maxHistoryMessages,
                rounds: maxHistoryMessages / 2,
              })}
            </Typography>
          </Box>

          <Button
            variant="contained"
            fullWidth
            onClick={handleSave}
            sx={{
              borderRadius: "12px",
              py: 1.25,
              fontWeight: 600,
              fontSize: "0.9rem",
              letterSpacing: "0.02em",
              boxShadow: "0 4px 12px rgba(194, 65, 12, 0.2)",
              "&:hover": {
                boxShadow: "0 6px 20px rgba(194, 65, 12, 0.3)",
              },
            }}
          >
            {saved ? t("settings.saved") : t("settings.save")}
          </Button>
        </Stack>
      </Box>
    </Box>
  )
}

// Context size presets matching common model context windows
const CONTEXT_PRESETS = [
  { value: 4096, label: "4K" },
  { value: 8192, label: "8K" },
  { value: 16384, label: "16K" },
  { value: 32768, label: "32K" },
  { value: 65536, label: "64K" },
  { value: 131072, label: "128K" },
  { value: 204800, label: "200K" },
  { value: 262144, label: "256K" },
  { value: 524288, label: "512K" },
  { value: 1000000, label: "1M" },
]

function ContextSizeSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { t } = useTranslation()

  function formatSize(chars: number): string {
    if (chars >= 1000000) return t("settings.mChars", { count: (chars / 1000000).toFixed(1) })
    if (chars >= 1000) return t("settings.kChars", { count: Math.round(chars / 1000) })
    return t("settings.chars", { count: chars })
  }

  // Find closest preset index
  const closestIndex = CONTEXT_PRESETS.reduce((best, preset, i) => {
    return Math.abs(preset.value - value) < Math.abs(CONTEXT_PRESETS[best].value - value) ? i : best
  }, 0)

  const maxIdx = CONTEXT_PRESETS.length - 1

  return (
    <Box>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {formatSize(value)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t("settings.wikiContentChars", { count: Math.floor((value * 0.6) / 1000) })}
        </Typography>
      </Stack>
      <Slider
        size="small"
        value={closestIndex}
        min={0}
        max={maxIdx}
        step={1}
        marks
        onChange={(_, v) => onChange(CONTEXT_PRESETS[typeof v === "number" ? v : 0].value)}
        sx={{
          color: "primary.main",
          "& .MuiSlider-thumb": { width: 14, height: 14 },
        }}
      />
      <Stack direction="row" sx={{ justifyContent: "space-between", mt: 0.5, flexWrap: "wrap", gap: 0.25 }}>
        {CONTEXT_PRESETS.map((preset, i) => (
          <Button
            key={preset.value}
            size="small"
            onClick={() => onChange(preset.value)}
            sx={{
              minWidth: 0,
              px: 0.25,
              py: 0,
              fontSize: "9px",
              textTransform: "none",
              color: i === closestIndex ? "primary.main" : "text.secondary",
              fontWeight: i === closestIndex ? 700 : 400,
              opacity: i === closestIndex ? 1 : 0.5,
            }}
          >
            {preset.label}
          </Button>
        ))}
      </Stack>
    </Box>
  )
}
