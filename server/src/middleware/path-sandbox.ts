import path from "node:path"
import { getProjectRoot } from "../services/project-service.js"

/**
 * Resolve a relative path against a project root directory,
 * verifying the result stays inside the project root (sandboxing).
 *
 * Throws an error if the resolved path escapes the project root
 * (path traversal attack prevention).
 */
export function resolveSandboxed(projectRoot: string, relativePath: string): string {
  // Normalize to forward slashes, strip leading slash
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "")

  if (!normalized) return projectRoot

  const resolved = path.resolve(projectRoot, normalized)
  const rootNormalized = path.normalize(projectRoot)

  // The resolved path must be at or inside the project root
  if (
    resolved !== rootNormalized &&
    !resolved.startsWith(rootNormalized + path.sep)
  ) {
    throw new Error(`Path traversal detected: "${relativePath}"`)
  }

  return resolved
}

/**
 * Resolve a projectId + relativePath to an absolute filesystem path.
 * Validates the path stays within the project root.
 */
export async function resolveProjectPath(
  projectId: string,
  relativePath: string,
): Promise<string> {
  const root = await getProjectRoot(projectId)
  return resolveSandboxed(root, relativePath)
}
