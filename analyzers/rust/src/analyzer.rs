use std::fs;
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};
use walkdir::WalkDir;

use crate::ast_walker;
use crate::ir_types::*;
use crate::plugins::PluginRegistry;

pub fn analyze_repository(
    repo_path: &str,
    repo_name: &str,
    verbose: bool,
) -> Result<IrDocument, String> {
    let root = Path::new(repo_path)
        .canonicalize()
        .map_err(|e| format!("Invalid repo path '{}': {}", repo_path, e))?;

    let plugins = PluginRegistry::new();
    let rust_files = discover_files(&root);

    if verbose {
        eprintln!("Discovered {} Rust files", rust_files.len());
    }

    let mut files = Vec::new();
    for file_path in &rust_files {
        match analyze_file(file_path, &root, &plugins) {
            Ok(file_ir) => {
                if verbose {
                    eprintln!("  Analyzed: {}", file_ir.relative_path);
                }
                files.push(file_ir);
            }
            Err(e) => {
                eprintln!("  WARN: Failed to parse {}: {}", file_path.display(), e);
            }
        }
    }

    let now = chrono::Utc::now().to_rfc3339();

    Ok(IrDocument {
        schema: "confianalyzer-ir-v1".to_string(),
        version: "1.0.0".to_string(),
        generated_at: now,
        analyzer: AnalyzerMeta {
            name: "confianalyzer-analyze-rust".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            language: "rust".to_string(),
        },
        repository: RepositoryMeta {
            name: repo_name.to_string(),
            root_path: root.to_string_lossy().to_string(),
        },
        files,
    })
}

fn discover_files(root: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    for entry in WalkDir::new(root).into_iter().filter_entry(|e| {
        let name = e.file_name().to_string_lossy();
        // Skip target directory and hidden directories (but not the root itself)
        if e.depth() == 0 {
            return true;
        }
        !(name == "target" || name.starts_with('.'))
    }) {
        if let Ok(entry) = entry {
            let path = entry.path();
            if path.is_file() && path.extension().map_or(false, |ext| ext == "rs") {
                files.push(path.to_path_buf());
            }
        }
    }
    files
}

fn analyze_file(
    file_path: &Path,
    root: &Path,
    plugins: &PluginRegistry,
) -> Result<FileIR, String> {
    let source = fs::read_to_string(file_path)
        .map_err(|e| format!("Could not read {}: {}", file_path.display(), e))?;

    let metadata = fs::metadata(file_path)
        .map_err(|e| format!("Could not stat {}: {}", file_path.display(), e))?;

    let parsed = syn::parse_file(&source)
        .map_err(|e| format!("Parse error in {}: {}", file_path.display(), e))?;

    let walk_result = ast_walker::walk_file(&parsed, plugins);

    let mut hasher = Sha256::new();
    hasher.update(source.as_bytes());
    let hash = format!("{:x}", hasher.finalize());

    let relative_path = file_path
        .strip_prefix(root)
        .unwrap_or(file_path)
        .to_string_lossy()
        .to_string();

    Ok(FileIR {
        path: file_path.to_string_lossy().to_string(),
        relative_path,
        language: "rust".to_string(),
        size: metadata.len(),
        hash,
        functions: walk_result.functions,
        calls: walk_result.calls,
        imports: walk_result.imports,
        exports: walk_result.exports,
        classes: walk_result.classes,
        enrichments: None,
    })
}
