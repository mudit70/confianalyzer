package analyzer

import (
	"crypto/sha256"
	"fmt"
	"go/parser"
	"go/token"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/confianalyzer/analyzer-go/analyzer/plugins"
	"github.com/confianalyzer/analyzer-go/irtypes"
)

const (
	AnalyzerName    = "confianalyzer-go"
	AnalyzerVersion = "0.1.0"
	IRSchema        = "confianalyzer-ir-v1"
)

// AnalyzeRepository analyzes all Go files in a repository and produces an IrDocument.
func AnalyzeRepository(repoPath, repoName string, verbose bool) (*irtypes.IrDocument, error) {
	absPath, err := filepath.Abs(repoPath)
	if err != nil {
		return nil, fmt.Errorf("resolving repo path: %w", err)
	}

	modulePath := detectModulePath(absPath)
	registry := plugins.NewRegistry()

	var files []irtypes.FileIR
	var walkErrors []string

	err = filepath.Walk(absPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			walkErrors = append(walkErrors, fmt.Sprintf("walk error at %s: %v", path, err))
			return nil
		}

		// Skip directories
		if info.IsDir() {
			base := filepath.Base(path)
			if base == "vendor" || base == "testdata" || base == ".git" || base == "node_modules" {
				return filepath.SkipDir
			}
			return nil
		}

		// Only .go files, skip test files
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}

		if verbose {
			fmt.Fprintf(os.Stderr, "Analyzing: %s\n", path)
		}

		fileIR, err := analyzeFile(path, absPath, modulePath, registry)
		if err != nil {
			walkErrors = append(walkErrors, fmt.Sprintf("parse error at %s: %v", path, err))
			return nil
		}

		files = append(files, *fileIR)
		return nil
	})

	if err != nil {
		return nil, fmt.Errorf("walking repository: %w", err)
	}

	doc := &irtypes.IrDocument{
		Schema:      IRSchema,
		Version:     "1.0.0",
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
		Analyzer: irtypes.AnalyzerMeta{
			Name:     AnalyzerName,
			Version:  AnalyzerVersion,
			Language: "go",
		},
		Repository: irtypes.RepositoryMeta{
			Name:     repoName,
			RootPath: absPath,
		},
		Files: files,
	}

	if len(walkErrors) > 0 && verbose {
		for _, e := range walkErrors {
			fmt.Fprintf(os.Stderr, "WARNING: %s\n", e)
		}
	}

	return doc, nil
}

func analyzeFile(path, repoRoot, modulePath string, registry *plugins.Registry) (*irtypes.FileIR, error) {
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, path, nil, parser.ParseComments)
	if err != nil {
		return nil, err
	}

	hash, err := hashFile(path)
	if err != nil {
		return nil, fmt.Errorf("hashing file: %w", err)
	}

	info, err := os.Stat(path)
	if err != nil {
		return nil, fmt.Errorf("stat file: %w", err)
	}

	relPath, _ := filepath.Rel(repoRoot, path)

	result := WalkFile(fset, file, modulePath, registry)

	functions := result.Functions
	if functions == nil {
		functions = []irtypes.FunctionIR{}
	}
	calls := result.Calls
	if calls == nil {
		calls = []irtypes.CallIR{}
	}
	imports := result.Imports
	if imports == nil {
		imports = []irtypes.ImportIR{}
	}
	exports := result.Exports
	if exports == nil {
		exports = []irtypes.ExportIR{}
	}
	classes := result.Classes
	if classes == nil {
		classes = []irtypes.ClassIR{}
	}

	return &irtypes.FileIR{
		Path:         path,
		RelativePath: relPath,
		Language:     "go",
		Size:         info.Size(),
		Hash:         hash,
		Functions:    functions,
		Calls:        calls,
		Imports:      imports,
		Exports:      exports,
		Classes:      classes,
	}, nil
}

func hashFile(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", h.Sum(nil)), nil
}

func detectModulePath(repoPath string) string {
	goModPath := filepath.Join(repoPath, "go.mod")
	data, err := os.ReadFile(goModPath)
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "module ") {
			return strings.TrimSpace(strings.TrimPrefix(line, "module"))
		}
	}
	return ""
}
