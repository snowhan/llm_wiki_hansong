import { useState, useCallback } from "react"
import SearchIcon from "@mui/icons-material/Search"
import DescriptionIcon from "@mui/icons-material/Description"
import Box from "@mui/material/Box"
import InputAdornment from "@mui/material/InputAdornment"
import List from "@mui/material/List"
import ListItem from "@mui/material/ListItem"
import ListItemButton from "@mui/material/ListItemButton"
import TextField from "@mui/material/TextField"
import Typography from "@mui/material/Typography"
import { useWikiStore } from "@/stores/wiki-store"
import { readFile } from "@/commands/fs"
import { searchWiki, type SearchResult } from "@/lib/search"
import { useTranslation } from "react-i18next"
import { useTheme } from "@mui/material/styles"

export function SearchView() {
  const { t } = useTranslation()
  const project = useWikiStore((s) => s.project)
  const setSelectedFile = useWikiStore((s) => s.setSelectedFile)
  const setFileContent = useWikiStore((s) => s.setFileContent)
  const setActiveView = useWikiStore((s) => s.setActiveView)

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const doSearch = useCallback(
    async (q: string) => {
      if (!project || !q.trim()) {
        setResults([])
        return
      }
      setSearching(true)
      setHasSearched(true)
      try {
        const found = await searchWiki(project.id, q)
        setResults(found)
      } catch (err) {
        console.error("Search failed:", err)
        setResults([])
      } finally {
        setSearching(false)
      }
    },
    [project],
  )

  async function handleOpen(result: SearchResult) {
    if (!project) return
    try {
      const content = await readFile(project.id, result.relativePath)
      setSelectedFile(result.relativePath)
      setFileContent(content)
      setActiveView("wiki")
    } catch (err) {
      console.error("Failed to open search result:", err)
    }
  }

  return (
    <Box sx={{ display: "flex", height: "100%", flexDirection: "column", overflow: "hidden" }}>
      <Box sx={{ flexShrink: 0, borderBottom: 1, borderColor: "divider", px: 2, py: 1.5 }}>
        <TextField
          fullWidth
          size="small"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") doSearch(query)
          }}
          placeholder={t("search.placeholder") + " (Enter to search)"}
          autoFocus
          variant="outlined"
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 18, color: "text.secondary" }} />
                </InputAdornment>
              ),
            },
          }}
          sx={{
            "& .MuiOutlinedInput-root": {
              bgcolor: "background.paper",
              fontSize: "0.875rem",
            },
          }}
        />
      </Box>

      <Box sx={{ flex: 1, overflowY: "auto" }}>
        {searching ? (
          <Box sx={{ p: 2, textAlign: "center", fontSize: "0.875rem", color: "text.secondary" }}>
            Searching...
          </Box>
        ) : !hasSearched ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
              p: 4,
              textAlign: "center",
              fontSize: "0.875rem",
              color: "text.secondary",
            }}
          >
            <SearchIcon sx={{ fontSize: 32, color: "action.disabledBackground" }} />
            <Typography component="p">Press Enter to search</Typography>
          </Box>
        ) : results.length === 0 ? (
          <Box sx={{ p: 2, textAlign: "center", fontSize: "0.875rem", color: "text.secondary" }}>
            {t("search.noResults")}{" "}
            <Typography component="span" sx={{ fontWeight: 500 }}>
              &quot;{query}&quot;
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, p: 1 }}>
            <Typography variant="caption" sx={{ px: 1, py: 0.5, color: "text.secondary" }}>
              {results.length} result{results.length !== 1 ? "s" : ""}
            </Typography>
            <List disablePadding dense>
              {results.map((result) => (
                <SearchResultCard
                  key={result.relativePath}
                  result={result}
                  query={query}
                  onClick={() => handleOpen(result)}
                />
              ))}
            </List>
          </Box>
        )}
      </Box>
    </Box>
  )
}

function SearchResultCard({
  result,
  query,
  onClick,
}: {
  result: SearchResult
  query: string
  onClick: () => void
}) {
  const { t } = useTranslation()
  const rawShortPath = result.relativePath.replace(/^wiki\//, "")
  const shortPath = rawShortPath
    .split("/")
    .map((seg) => (seg.endsWith(".md") ? seg : t(`folderNames.${seg}`, { defaultValue: seg })))
    .join("/")

  return (
    <ListItem disablePadding sx={{ display: "block", mb: 0.5 }}>
      <ListItemButton
        onClick={onClick}
        sx={{
          alignItems: "flex-start",
          border: 1,
          borderColor: "divider",
          borderRadius: 2,
          p: 1.5,
          textAlign: "left",
          "&:hover": { bgcolor: "action.hover" },
        }}
      >
        <DescriptionIcon
          sx={{ fontSize: 18, color: "text.secondary", mt: 0.125, mr: 1, flexShrink: 0 }}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ mb: 0.75 }}>
            <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
              <HighlightedText text={result.title} query={query} />
            </Typography>
            <Typography variant="caption" sx={{ fontSize: 11, color: "text.secondary" }} noWrap>
              {shortPath}
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ color: "text.secondary", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            <HighlightedText text={result.snippet} query={query} />
          </Typography>
        </Box>
      </ListItemButton>
    </ListItem>
  )
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const theme = useTheme()
  if (!query.trim()) return <>{text}</>

  const regex = new RegExp(`(${escapeRegex(query)})`, "gi")
  const parts = text.split(regex)

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <Box
            key={i}
            component="mark"
            sx={{
              bgcolor: theme.palette.mode === "dark" ? "warning.dark" : "warning.light",
              color: "text.primary",
              borderRadius: 0.5,
              px: 0.25,
            }}
          >
            {part}
          </Box>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
