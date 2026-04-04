package plugins

import (
	"go/ast"

	"github.com/confianalyzer/analyzer-go/irtypes"
)

// GinPlugin detects Gin framework route registrations.
// Patterns: r.GET("/path", handler), router.POST("/path", handler), group.GET("/path", handler)
type GinPlugin struct{}

func (p *GinPlugin) Name() string { return "gin" }

// ginMethods maps Gin method names to HTTP methods.
var ginMethods = map[string]string{
	"GET":     "GET",
	"POST":    "POST",
	"PUT":     "PUT",
	"DELETE":  "DELETE",
	"PATCH":   "PATCH",
	"HEAD":    "HEAD",
	"OPTIONS": "OPTIONS",
	"Any":     "ALL",
}

func (p *GinPlugin) AnalyzeCall(call *ast.CallExpr, callee, receiver, method string, stringArgs []string) *PluginResult {
	httpMethod, ok := ginMethods[method]
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
			PluginName: "gin",
			Route: &irtypes.RouteInfo{
				Method: httpMethod,
				Path:   path,
			},
			SuggestedCategory: &cat,
		},
	}
}
