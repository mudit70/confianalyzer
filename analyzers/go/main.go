package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"

	"github.com/confianalyzer/analyzer-go/analyzer"
)

const (
	exitSuccess   = 0
	exitPartial   = 1
	exitFailure   = 2
	exitConfigErr = 3
)

// Ensure exitPartial is used (avoid unused const error)
var _ = exitPartial

func main() {
	repoPath := flag.String("repo", "", "Path to the repository to analyze")
	repoName := flag.String("repo-name", "", "Name of the repository")
	outputPath := flag.String("output", "", "Path to write the output IR JSON file")
	verbose := flag.Bool("verbose", false, "Enable verbose logging")

	flag.Parse()

	if *repoPath == "" || *repoName == "" || *outputPath == "" {
		fmt.Fprintln(os.Stderr, "Usage: confianalyzer-analyze-go --repo <path> --repo-name <name> --output <path> [--verbose]")
		os.Exit(exitConfigErr)
	}

	emitProgress("start", fmt.Sprintf("Analyzing repository: %s", *repoName))

	doc, err := analyzer.AnalyzeRepository(*repoPath, *repoName, *verbose)
	if err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
		emitProgress("error", err.Error())
		os.Exit(exitFailure)
	}

	emitProgress("progress", fmt.Sprintf("Analyzed %d files", len(doc.Files)))

	data, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: marshaling JSON: %v\n", err)
		os.Exit(exitFailure)
	}

	if err := os.WriteFile(*outputPath, data, 0644); err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: writing output: %v\n", err)
		os.Exit(exitFailure)
	}

	emitProgress("complete", fmt.Sprintf("Output written to %s", *outputPath))

	if *verbose {
		fmt.Fprintf(os.Stderr, "Analysis complete: %d files analyzed\n", len(doc.Files))
	}

	os.Exit(exitSuccess)
}

type progressEvent struct {
	Event   string `json:"event"`
	Message string `json:"message"`
}

func emitProgress(event, message string) {
	data, _ := json.Marshal(progressEvent{Event: event, Message: message})
	fmt.Println(string(data))
}
