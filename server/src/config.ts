import path from "node:path"
import os from "node:os"

export const config = {
  port: parseInt(process.env.PORT ?? "3001", 10),
  projectsRoot: process.env.PROJECTS_ROOT ?? path.join(os.homedir(), "llm-wiki-projects"),
  appStatePath: process.env.APP_STATE_PATH ?? path.join(os.homedir(), ".llm-wiki", "app-state.json"),
  uploadSizeLimit: parseInt(process.env.UPLOAD_SIZE_LIMIT ?? "104857600", 10), // 100MB
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
}
