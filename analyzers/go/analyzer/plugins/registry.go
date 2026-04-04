package plugins

import (
	"go/ast"

	"github.com/confianalyzer/analyzer-go/irtypes"
)

// Plugin interface for framework detection plugins.
// Each plugin inspects a CallExpr and optionally returns enrichment data.
type Plugin interface {
	// Name returns the plugin identifier.
	Name() string

	// AnalyzeCall inspects a call expression and returns enrichment info if it matches
	// a framework pattern. Returns nil if the call is not relevant.
	AnalyzeCall(call *ast.CallExpr, callee, receiver, method string, stringArgs []string) *PluginResult
}

// PluginResult holds the enrichment data produced by a plugin.
type PluginResult struct {
	EndpointInfo *irtypes.EndpointInfo
	Enrichment   *irtypes.Enrichment
}

// Registry holds all registered plugins.
type Registry struct {
	plugins []Plugin
}

// NewRegistry creates a registry with all built-in plugins.
func NewRegistry() *Registry {
	return &Registry{
		plugins: []Plugin{
			&GinPlugin{},
			&ChiPlugin{},
			&NetHTTPPlugin{},
		},
	}
}

// AnalyzeCall runs all plugins against a call expression and returns the first match.
func (r *Registry) AnalyzeCall(call *ast.CallExpr, callee, receiver, method string, stringArgs []string) *PluginResult {
	for _, p := range r.plugins {
		if result := p.AnalyzeCall(call, callee, receiver, method, stringArgs); result != nil {
			return result
		}
	}
	return nil
}
