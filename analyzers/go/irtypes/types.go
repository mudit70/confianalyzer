package irtypes

// IR JSON types matching confianalyzer-ir-v1

type IrDocument struct {
	Schema     string         `json:"$schema"`
	Version    string         `json:"version"`
	GeneratedAt string        `json:"generatedAt"`
	Analyzer   AnalyzerMeta   `json:"analyzer"`
	Repository RepositoryMeta `json:"repository"`
	Files      []FileIR       `json:"files"`
}

type AnalyzerMeta struct {
	Name     string `json:"name"`
	Version  string `json:"version"`
	Language string `json:"language"`
}

type RepositoryMeta struct {
	Name     string `json:"name"`
	RootPath string `json:"rootPath"`
}

type SourceLocation struct {
	StartLine   int `json:"startLine"`
	EndLine     int `json:"endLine"`
	StartColumn int `json:"startColumn"`
	EndColumn   int `json:"endColumn"`
}

type FileIR struct {
	Path         string           `json:"path"`
	RelativePath string           `json:"relativePath"`
	Language     string           `json:"language"`
	Size         int64            `json:"size"`
	Hash         string           `json:"hash"`
	Functions    []FunctionIR     `json:"functions"`
	Calls        []CallIR         `json:"calls"`
	Imports      []ImportIR       `json:"imports"`
	Exports      []ExportIR       `json:"exports"`
	Classes      []ClassIR        `json:"classes"`
	Enrichments  []FileEnrichment `json:"enrichments,omitempty"`
}

type FunctionIR struct {
	Kind          string        `json:"kind"`
	Name          string        `json:"name"`
	QualifiedName *string       `json:"qualifiedName"`
	Signature     string        `json:"signature"`
	Parameters    []ParameterIR `json:"parameters"`
	ReturnType    *string       `json:"returnType"`
	IsExported    bool          `json:"isExported"`
	IsAsync       bool          `json:"isAsync"`
	IsStatic      *bool         `json:"isStatic,omitempty"`
	Accessibility *string       `json:"accessibility,omitempty"`
	Location      SourceLocation `json:"location"`
	EndpointInfo  *EndpointInfo  `json:"endpointInfo,omitempty"`
	Enrichments   []Enrichment   `json:"enrichments,omitempty"`
}

type ParameterIR struct {
	Name           string  `json:"name"`
	TypeAnnotation *string `json:"typeAnnotation"`
	HasDefault     bool    `json:"hasDefault"`
	IsRest         bool    `json:"isRest"`
}

type CallIR struct {
	Kind              string        `json:"kind"`
	Callee            string        `json:"callee"`
	Receiver          *string       `json:"receiver"`
	Method            *string       `json:"method"`
	ArgumentCount     int           `json:"argumentCount"`
	ArgumentRefs      []string      `json:"argumentRefs,omitempty"`
	StringArgs        []string      `json:"stringArgs,omitempty"`
	EnclosingFunction *string       `json:"enclosingFunction"`
	Location          SourceLocation `json:"location"`
	Enrichments       []Enrichment   `json:"enrichments,omitempty"`
}

type ImportIR struct {
	Kind            string             `json:"kind"`
	ModulePath      string             `json:"modulePath"`
	ResolvedPath    *string            `json:"resolvedPath"`
	IsExternal      bool               `json:"isExternal"`
	Symbols         []ImportedSymbolIR `json:"symbols"`
	DefaultImport   *string            `json:"defaultImport"`
	NamespaceImport *string            `json:"namespaceImport"`
	Location        SourceLocation     `json:"location"`
}

type ImportedSymbolIR struct {
	Name  string  `json:"name"`
	Alias *string `json:"alias"`
}

type ExportIR struct {
	Kind       string         `json:"kind"`
	Name       string         `json:"name"`
	LocalName  *string        `json:"localName"`
	IsDefault  bool           `json:"isDefault"`
	FromModule *string        `json:"fromModule"`
	Location   SourceLocation `json:"location"`
}

type ClassIR struct {
	Kind       string         `json:"kind"`
	Name       string         `json:"name"`
	SuperClass *string        `json:"superClass"`
	Implements []string       `json:"implements"`
	IsExported bool           `json:"isExported"`
	IsAbstract bool           `json:"isAbstract"`
	Methods    []string       `json:"methods"`
	Location   SourceLocation `json:"location"`
}

type EndpointInfo struct {
	Method string `json:"method"`
	Path   string `json:"path"`
}

type Enrichment struct {
	PluginName      string           `json:"pluginName"`
	Route           *RouteInfo       `json:"route"`
	DbOperation     *DbOperationInfo `json:"dbOperation"`
	HttpCall        *HttpCallInfo    `json:"httpCall"`
	Renders         []string         `json:"renders"`
	MiddlewareOrder *int             `json:"middlewareOrder"`
	SuggestedCategory *string        `json:"suggestedCategory"`
}

type RouteInfo struct {
	Method string `json:"method"`
	Path   string `json:"path"`
}

type DbOperationInfo struct {
	Table     string `json:"table"`
	Operation string `json:"operation"`
}

type HttpCallInfo struct {
	Method     string `json:"method"`
	URLPattern string `json:"urlPattern"`
}

type FileEnrichment struct {
	PluginName    string  `json:"pluginName"`
	IsPage        *bool   `json:"isPage,omitempty"`
	PageRoute     *string `json:"pageRoute,omitempty"`
	IsLayout      *bool   `json:"isLayout,omitempty"`
	ComponentName *string `json:"componentName,omitempty"`
}

// Helper to create a string pointer
func strPtr(s string) *string {
	return &s
}
