package plugins

import (
	"go/ast"

	"github.com/confianalyzer/analyzer-go/irtypes"
)

// ChiPlugin detects Chi framework route registrations.
// Patterns: r.Get("/path", handler), r.Post("/path", handler)
type ChiPlugin struct{}

func (p *ChiPlugin) Name() string { return "chi" }

// chiMethods maps Chi method names to HTTP methods.
var chiMethods = map[string]string{
	"Get":     "GET",
	"Post":    "POST",
	"Put":     "PUT",
	"Delete":  "DELETE",
	"Patch":   "PATCH",
	"Head":    "HEAD",
	"Options": "OPTIONS",
}

func (p *ChiPlugin) AnalyzeCall(call *ast.CallExpr, callee, receiver, method string, stringArgs []string) *PluginResult {
	httpMethod, ok := chiMethods[method]
	if !ok || receiver == "" || len(stringArgs) == 0 {
		return nil
	}

	path := stringArgs[0]
	cat := "API_ENDPOINT"

	return &PluginResult{
		EndpointInfo: &irtypes.EndpointInfo{
			Method: httpMethod,
			Path:   path,
		},
		Enrichment: &irtypes.Enrichment{
			PluginName: "chi",
			Route: &irtypes.RouteInfo{
				Method: httpMethod,
				Path:   path,
			},
			SuggestedCategory: &cat,
		},
	}
}
