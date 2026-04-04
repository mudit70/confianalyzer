mod analyzer;
mod ast_walker;
mod ir_types;
mod plugins;

#[cfg(test)]
#[path = "tests/analyzer_tests.rs"]
mod analyzer_tests;

use clap::Parser;
use serde_json::json;
use std::process;

const EXIT_SUCCESS: i32 = 0;
const EXIT_PARTIAL: i32 = 1;
const EXIT_FAILURE: i32 = 2;
const EXIT_CONFIG_ERR: i32 = 3;

// Suppress unused warning for EXIT_PARTIAL
const _: i32 = EXIT_PARTIAL;

#[derive(Parser, Debug)]
#[command(name = "confianalyzer-analyze-rust")]
#[command(about = "Rust analyzer for ConfiAnalyzer — outputs confianalyzer-ir-v1 JSON")]
struct Cli {
    /// Path to the repository to analyze
    #[arg(long)]
    repo: String,

    /// Name of the repository
    #[arg(long)]
    repo_name: String,

    /// Path to write the output IR JSON file
    #[arg(long)]
    output: String,

    /// Enable verbose logging to stderr
    #[arg(long, default_value_t = false)]
    verbose: bool,
}

fn emit_progress(event: &str, message: &str) {
    let obj = json!({"event": event, "message": message});
    println!("{}", obj);
}

fn main() {
    let cli = Cli::parse();

    if cli.repo.is_empty() || cli.repo_name.is_empty() || cli.output.is_empty() {
        eprintln!("ERROR: --repo, --repo-name, and --output are all required");
        process::exit(EXIT_CONFIG_ERR);
    }

    emit_progress("start", &format!("Analyzing repository: {}", cli.repo_name));

    match analyzer::analyze_repository(&cli.repo, &cli.repo_name, cli.verbose) {
        Ok(doc) => {
            emit_progress(
                "progress",
                &format!("Analyzed {} files", doc.files.len()),
            );

            let data = match serde_json::to_string_pretty(&doc) {
                Ok(d) => d,
                Err(e) => {
                    eprintln!("ERROR: marshaling JSON: {}", e);
                    process::exit(EXIT_FAILURE);
                }
            };

            if let Err(e) = std::fs::write(&cli.output, &data) {
                eprintln!("ERROR: writing output: {}", e);
                process::exit(EXIT_FAILURE);
            }

            emit_progress("complete", &format!("Output written to {}", cli.output));

            if cli.verbose {
                eprintln!("Analysis complete: {} files analyzed", doc.files.len());
            }

            process::exit(EXIT_SUCCESS);
        }
        Err(e) => {
            eprintln!("ERROR: {}", e);
            emit_progress("error", &e);
            process::exit(EXIT_FAILURE);
        }
    }
}
