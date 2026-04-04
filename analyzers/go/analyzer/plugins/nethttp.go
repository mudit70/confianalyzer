package plugins

import (
	"go/ast"

	"github.com/confianalyzer/analyzer-go/irtypes"
)

// NetHTTPPlugin detects net/http route registrations.
// Patterns: http.HandleFunc("/path", handler), mux.HandleFunc("/path", handler), http.Handle("/path", handler)
type NetHTTPPlugin struct{}

func (p *NetHTTPPlugin) Name() string { return "net/http" }

// nethttpMethods contains the net/http functions that register routes.
var nethttpMethods = map[string]bool{
	"HandleFunc": true,
	"Handle":     true,
}

func (p *NetHTTPPlugin) AnalyzeCall(call *ast.CallExpr, callee, receiver, method string, stringArgs []string) *PluginResult {
	if !nethttpMethods[method] {
		return nil
	}

	// Must be called on "http" or a mux variable, or as http.HandleFunc
	if receiver != "http" && receiver != "mux" && receiver != "" {
		// Accept any receiver for HandleFunc/Handle (could be a custom mux variable name)
		// but require at least one string arg (the path)
	}

	if len(stringArgs) == 0 {
		return nil
	}

	path := stringArgs[0]
	httpMethod := "ALL"
	cat := "API_ENDPOINT"

	return &PluginResult{
		EndpointInfo: &irtypes.EndpointInfo{
			Method: httpMethod,
			Path:   path,
		},
		Enrichment: &irtypes.Enrichment{
			PluginName: "net/http",
			Route: &irtypes.RouteInfo{
				Method: httpMethod,
				Path:   path,
			},
			SuggestedCategory: &cat,
		},
	}
}
