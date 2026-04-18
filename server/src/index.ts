import express from "express"
import cors from "cors"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { config } from "./config.js"
import { errorHandler } from "./middleware/error-handler.js"
import fsRouter from "./routes/fs.js"
import projectRouter from "./routes/project.js"
import stateRouter from "./routes/state.js"
import mediaRouter from "./routes/media.js"
import llmRouter from "./routes/llm.js"
import vectorRouter from "./routes/vector.js"
import preprocessRouter from "./routes/preprocess.js"
import clipRouter from "./routes/clip.js"
import ingestRouter from "./routes/ingest.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()

app.use(cors({ origin: config.corsOrigin }))
app.use(express.json({ limit: "50mb" }))

app.use("/api/fs", fsRouter)
app.use("/api/project", projectRouter)
app.use("/api/state", stateRouter)
app.use("/api/media", mediaRouter)

app.use("/api/llm", llmRouter)
app.use("/api/vector", vectorRouter)
app.use("/api/preprocess", preprocessRouter)
app.use("/api/clip", clipRouter)
app.use("/api/ingest", ingestRouter)

const distDir = path.resolve(__dirname, "../../dist")
app.use(express.static(distDir))
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"))
})

app.use(errorHandler)

app.listen(config.port, () => {
  console.log(`[llm-wiki-server] running on http://localhost:${config.port}`)
  console.log(`[llm-wiki-server] PROJECTS_ROOT = ${config.projectsRoot}`)
})

export { app }
