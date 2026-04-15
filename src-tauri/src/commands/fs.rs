use std::fs;
use std::path::Path;
use std::process::Command;

use crate::types::wiki::FileNode;

/// Formats handled by MarkItDown (Microsoft/markitdown CLI).
const MARKITDOWN_EXTS: &[&str] = &[
    // Documents
    "pdf", "docx", "doc", "pptx", "ppt", "xlsx", "xls",
    "odt", "ods", "odp", "epub", "pages", "numbers", "key",
    // Web
    "html", "htm",
    // Data
    "csv",
    // Images (EXIF metadata extraction)
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "tiff", "tif", "avif", "heic", "heif", "svg",
    // Audio / Video (metadata extraction)
    "mp4", "webm", "mov", "avi", "mkv", "flv", "wmv", "m4v",
    "mp3", "wav", "ogg", "flac", "aac", "m4a", "wma",
    // Archives
    "zip",
];

/// Build a PATH that includes common Python script locations so that
/// `markitdown` can be found even when launched from a macOS GUI (which
/// inherits a minimal PATH from launchd).
fn extended_path() -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    let extras: Vec<String> = vec![
        format!("{}/Library/Python/3.13/bin", home),
        format!("{}/Library/Python/3.12/bin", home),
        format!("{}/Library/Python/3.11/bin", home),
        format!("{}/Library/Python/3.10/bin", home),
        format!("{}/.local/bin", home),
        "/opt/homebrew/bin".to_string(),
        "/usr/local/bin".to_string(),
    ];
    let current = std::env::var("PATH").unwrap_or_default();
    format!("{}:{}", extras.join(":"), current)
}

/// Call the MarkItDown CLI to convert a file to Markdown.
fn call_markitdown(path: &str) -> Result<String, String> {
    let env_path = extended_path();

    let output = Command::new("markitdown")
        .arg(path)
        .env("PATH", &env_path)
        .output()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                "MarkItDown is not installed. Please run: pip install 'markitdown[all]'".to_string()
            } else {
                format!("Failed to execute markitdown: {}", e)
            }
        })?;

    if output.status.success() {
        let text = String::from_utf8(output.stdout)
            .map_err(|e| format!("Invalid UTF-8 output from markitdown: {}", e))?;
        if text.trim().is_empty() {
            Err(format!("markitdown returned empty output for '{}'", path))
        } else {
            Ok(text)
        }
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("markitdown error for '{}': {}", path, stderr))
    }
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    // Check cache first for markitdown-handled formats
    if MARKITDOWN_EXTS.contains(&ext.as_str()) {
        if let Some(cached) = read_cache(p) {
            return Ok(cached);
        }
        return call_markitdown(&path);
    }

    // Plain text / code files — read directly
    match fs::read_to_string(&path) {
        Ok(content) => Ok(content),
        Err(_) => {
            // Unknown binary — also try markitdown as last resort
            call_markitdown(&path)
        }
    }
}

/// Pre-process a file and cache the extracted text.
#[tauri::command]
pub fn preprocess_file(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    if !MARKITDOWN_EXTS.contains(&ext.as_str()) {
        return Ok("no preprocessing needed".to_string());
    }

    let text = call_markitdown(&path)?;
    write_cache(p, &text)?;
    Ok(text)
}

fn cache_path_for(original: &Path) -> std::path::PathBuf {
    let parent = original.parent().unwrap_or(Path::new("."));
    let cache_dir = parent.join(".cache");
    let file_name = original
        .file_name()
        .unwrap_or_default()
        .to_string_lossy();
    cache_dir.join(format!("{}.txt", file_name))
}

fn read_cache(original: &Path) -> Option<String> {
    let cache_path = cache_path_for(original);
    let original_modified = fs::metadata(original).ok()?.modified().ok()?;
    let cache_modified = fs::metadata(&cache_path).ok()?.modified().ok()?;
    if cache_modified >= original_modified {
        fs::read_to_string(&cache_path).ok()
    } else {
        None
    }
}

fn write_cache(original: &Path, text: &str) -> Result<(), String> {
    let cache_path = cache_path_for(original);
    if let Some(parent) = cache_path.parent() {
        fs::create_dir_all(parent).ok();
    }
    fs::write(&cache_path, text)
        .map_err(|e| format!("Failed to write cache: {}", e))
}

#[tauri::command]
pub fn write_file(path: String, contents: String) -> Result<(), String> {
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent dirs for '{}': {}", path, e))?;
    }
    fs::write(&path, contents).map_err(|e| format!("Failed to write file '{}': {}", path, e))
}

#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<FileNode>, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: '{}'", path));
    }
    if !p.is_dir() {
        return Err(format!("Path is not a directory: '{}'", path));
    }
    let nodes = build_tree(p, 0, 30)?;
    Ok(nodes)
}

fn build_tree(dir: &Path, depth: usize, max_depth: usize) -> Result<Vec<FileNode>, String> {
    if depth >= max_depth {
        return Ok(vec![]);
    }

    let mut entries: Vec<_> = fs::read_dir(dir)
        .map_err(|e| format!("Failed to read directory '{}': {}", dir.display(), e))?
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            // Skip dotfiles
            entry
                .file_name()
                .to_str()
                .map(|n| !n.starts_with('.'))
                .unwrap_or(false)
        })
        .collect();

    // Sort: directories first, then alphabetical within each group
    entries.sort_by(|a, b| {
        let a_is_dir = a.path().is_dir();
        let b_is_dir = b.path().is_dir();
        match (a_is_dir, b_is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.file_name().cmp(&b.file_name()),
        }
    });

    let mut nodes = Vec::new();
    for entry in entries {
        let entry_path = entry.path();
        let name = entry
            .file_name()
            .to_str()
            .unwrap_or("")
            .to_string();
        let path_str = entry_path.to_string_lossy().to_string();
        let is_dir = entry_path.is_dir();

        let children = if is_dir {
            let kids = build_tree(&entry_path, depth + 1, max_depth)?;
            if kids.is_empty() {
                None
            } else {
                Some(kids)
            }
        } else {
            None
        };

        nodes.push(FileNode {
            name,
            path: path_str,
            is_dir,
            children,
        });
    }

    Ok(nodes)
}

#[tauri::command]
pub fn copy_file(source: String, destination: String) -> Result<(), String> {
    let dest = Path::new(&destination);
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent dirs: {}", e))?;
    }
    fs::copy(&source, &destination)
        .map_err(|e| format!("Failed to copy '{}' to '{}': {}", source, destination, e))?;
    Ok(())
}

/// Recursively copy a directory, preserving structure.
/// Returns list of copied file paths (destination paths).
#[tauri::command]
pub fn copy_directory(source: String, destination: String) -> Result<Vec<String>, String> {
    let src = Path::new(&source);
    let dest = Path::new(&destination);

    if !src.is_dir() {
        return Err(format!("'{}' is not a directory", source));
    }

    let mut copied_files = Vec::new();

    fn copy_recursive(
        src: &Path,
        dest: &Path,
        files: &mut Vec<String>,
    ) -> Result<(), String> {
        fs::create_dir_all(dest)
            .map_err(|e| format!("Failed to create dir '{}': {}", dest.display(), e))?;

        let entries = fs::read_dir(src)
            .map_err(|e| format!("Failed to read dir '{}': {}", src.display(), e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("Dir entry error: {}", e))?;
            let path = entry.path();
            let name = entry.file_name();
            let dest_path = dest.join(&name);

            // Skip hidden files/dirs
            if name.to_string_lossy().starts_with('.') {
                continue;
            }

            if path.is_dir() {
                copy_recursive(&path, &dest_path, files)?;
            } else {
                fs::copy(&path, &dest_path).map_err(|e| {
                    format!("Failed to copy '{}': {}", path.display(), e)
                })?;
                files.push(dest_path.to_string_lossy().to_string());
            }
        }
        Ok(())
    }

    copy_recursive(src, dest, &mut copied_files)?;
    Ok(copied_files)
}

#[tauri::command]
pub fn delete_file(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        fs::remove_dir_all(&path)
            .map_err(|e| format!("Failed to delete directory '{}': {}", path, e))
    } else {
        fs::remove_file(&path)
            .map_err(|e| format!("Failed to delete file '{}': {}", path, e))
    }
}

/// Find wiki pages that reference a given source file name.
/// Scans all .md files under wiki/ for the source filename in frontmatter or content.
#[tauri::command]
pub fn find_related_wiki_pages(project_path: String, source_name: String) -> Result<Vec<String>, String> {
    let wiki_dir = Path::new(&project_path).join("wiki");
    if !wiki_dir.is_dir() {
        return Ok(vec![]);
    }

    let mut related = Vec::new();
    collect_related_pages(&wiki_dir, &source_name, &mut related)?;
    Ok(related)
}

fn collect_related_pages(dir: &Path, source_name: &str, results: &mut Vec<String>) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;

    // Get just the filename without path — use Path for cross-platform separator handling
    let source_path = std::path::Path::new(source_name);
    let file_name = source_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(source_name);
    let file_name_lower = file_name.to_lowercase();

    // Derive stem (filename without extension) for source summary matching
    let file_stem = file_name
        .rsplit('.')
        .skip(1)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join(".");
    let file_stem_lower = if file_stem.is_empty() { file_name_lower.clone() } else { file_stem.to_lowercase() };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_related_pages(&path, source_name, results)?;
        } else if path.extension().map(|e| e == "md").unwrap_or(false) {
            let fname = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            // Skip index.md, log.md, overview.md — updated separately
            if fname == "index.md" || fname == "log.md" || fname == "overview.md" {
                continue;
            }

            if let Ok(content) = fs::read_to_string(&path) {
                let content_lower = content.to_lowercase();

                // Match 1: frontmatter sources field contains the exact filename
                // e.g., sources: ["2603.25723v1.pdf"]
                let sources_match = content_lower.contains(&format!("\"{}\"", file_name_lower))
                    || content_lower.contains(&format!("'{}'", file_name_lower));

                // Match 2: source summary page (wiki/sources/{stem}.md)
                // Use Path component iteration to avoid hardcoded separator assumptions
                let is_in_sources_dir = path
                    .components()
                    .any(|c| c.as_os_str() == "sources");
                let is_source_summary = is_in_sources_dir
                    && fname.to_lowercase().starts_with(&file_stem_lower);

                // Match 3: page was generated from this source (check frontmatter sources field)
                let frontmatter_match = if let Some(fm_start) = content.find("---\n") {
                    if let Some(fm_end) = content[fm_start + 4..].find("\n---") {
                        let frontmatter = &content[fm_start..fm_start + 4 + fm_end].to_lowercase();
                        frontmatter.contains("sources:")
                            && frontmatter.contains(&file_name_lower)
                    } else {
                        false
                    }
                } else {
                    false
                };

                if sources_match || is_source_summary || frontmatter_match {
                    results.push(path.to_string_lossy().to_string());
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn create_directory(path: String) -> Result<(), String> {
    fs::create_dir_all(&path)
        .map_err(|e| format!("Failed to create directory '{}': {}", path, e))
}
