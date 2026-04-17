export interface WikiProject {
  name: string
  path: string
}

export interface FileNode {
  name: string
  path: string
  is_dir: boolean
  children?: FileNode[]
}

export interface BrowseResult {
  dirs: string[]
  files: string[]
}
