package analyzer

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
)

// Config represents the parsed .confianalyzer.yaml configuration.
type Config struct {
	Include []string
	Exclude []string
	Plugins []string
	Options map[string]interface{}
}

// DefaultConfig returns a Config with default exclude patterns.
func DefaultConfig() *Config {
	return &Config{
		Exclude: []string{
			"**/__tests__/**",
			"**/*.test.*",
			"**/*.spec.*",
			"**/node_modules/**",
			"**/.venv/**",
			"**/dist/**",
			"**/build/**",
		},
		Options: make(map[string]interface{}),
	}
}

// LoadConfig loads config from the given path, or from .confianalyzer.yaml in repoRoot.
// Returns default config if no file is found.
func LoadConfig(repoRoot string, configPath string) *Config {
	resolved := configPath
	if resolved == "" {
		resolved = filepath.Join(repoRoot, ".confianalyzer.yaml")
	}

	data, err := os.ReadFile(resolved)
	if err != nil {
		return DefaultConfig()
	}

	return ParseYAML(string(data))
}

// ParseYAML parses the minimal YAML format used by .confianalyzer.yaml.
func ParseYAML(content string) *Config {
	cfg := &Config{
		Options: make(map[string]interface{}),
	}

	scanner := bufio.NewScanner(strings.NewReader(content))
	var currentKey string
	var inOptions bool
	var optionsKey string

	for scanner.Scan() {
		line := scanner.Text()
		trimmed := strings.TrimSpace(line)

		// Skip comments and blank lines
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}

		// Top-level key (no leading whitespace)
		if len(line) > 0 && line[0] != ' ' && line[0] != '\t' && strings.Contains(line, ":") {
			parts := strings.SplitN(line, ":", 2)
			key := strings.TrimSpace(parts[0])

			if key == "options" {
				inOptions = true
				currentKey = ""
				optionsKey = ""
				continue
			}

			inOptions = false
			optionsKey = ""
			currentKey = key
			continue
		}

		// Inside options block
		if inOptions {
			indent := len(line) - len(strings.TrimLeft(line, " \t"))
			if indent >= 2 && !strings.HasPrefix(trimmed, "-") && strings.Contains(trimmed, ":") {
				parts := strings.SplitN(trimmed, ":", 2)
				key := strings.TrimSpace(parts[0])
				val := strings.TrimSpace(parts[1])
				val = strings.Trim(val, "\"'")

				if val != "" && !strings.HasPrefix(val, "#") {
					cfg.Options[key] = val
					optionsKey = ""
				} else {
					optionsKey = key
					cfg.Options[key] = []string{}
				}
				continue
			}

			if strings.HasPrefix(trimmed, "- ") && optionsKey != "" {
				val := strings.TrimSpace(strings.TrimPrefix(trimmed, "- "))
				val = strings.Trim(val, "\"'")
				if existing, ok := cfg.Options[optionsKey].([]string); ok {
					cfg.Options[optionsKey] = append(existing, val)
				}
				continue
			}
			continue
		}

		// List item for top-level key
		if strings.HasPrefix(trimmed, "- ") && currentKey != "" {
			val := strings.TrimSpace(strings.TrimPrefix(trimmed, "- "))
			val = strings.Trim(val, "\"'")

			switch currentKey {
			case "include":
				cfg.Include = append(cfg.Include, val)
			case "exclude":
				cfg.Exclude = append(cfg.Exclude, val)
			case "plugins":
				cfg.Plugins = append(cfg.Plugins, val)
			}
		}
	}

	return cfg
}

// MatchesAnyPattern checks if a relative path matches any glob pattern.
// Supports ** for recursive directory matching and * for single-component matching.
func MatchesAnyPattern(relPath string, patterns []string) bool {
	for _, pattern := range patterns {
		if globMatch(pattern, relPath) {
			return true
		}
	}
	return false
}

// globMatch implements basic glob matching with ** support.
func globMatch(pattern, name string) bool {
	// Handle ** patterns by expanding them
	if strings.Contains(pattern, "**") {
		return globMatchDoublestar(pattern, name)
	}
	matched, _ := filepath.Match(pattern, name)
	return matched
}

// globMatchDoublestar handles patterns with ** (recursive directory matching).
func globMatchDoublestar(pattern, name string) bool {
	// Split pattern on **/ or **
	parts := strings.SplitN(pattern, "**", 2)
	prefix := parts[0]
	suffix := ""
	if len(parts) > 1 {
		suffix = parts[1]
		if strings.HasPrefix(suffix, "/") {
			suffix = suffix[1:]
		}
	}

	// Remove trailing / from prefix
	prefix = strings.TrimSuffix(prefix, "/")

	// If prefix is empty and suffix is empty, match everything
	if prefix == "" && suffix == "" {
		return true
	}

	// If prefix is not empty, the path must start with it
	if prefix != "" {
		if !strings.HasPrefix(name, prefix+"/") && name != prefix {
			return false
		}
		// Strip the prefix for suffix matching
		if name == prefix {
			// Path is exactly the prefix, suffix must be empty
			return suffix == ""
		}
		name = name[len(prefix)+1:]
	}

	// If suffix is empty, match anything remaining
	if suffix == "" {
		return true
	}

	// Try matching suffix against every possible tail of the path
	segments := strings.Split(name, "/")
	for i := range segments {
		tail := strings.Join(segments[i:], "/")
		if matched, _ := filepath.Match(suffix, tail); matched {
			return true
		}
		// Also try matching just the filename part for patterns like *.test.*
		if !strings.Contains(suffix, "/") {
			if matched, _ := filepath.Match(suffix, segments[i]); matched {
				return true
			}
		}
	}

	return false
}
