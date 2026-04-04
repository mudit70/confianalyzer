package analyzer

import (
	"fmt"
	"go/ast"
	"go/token"
	"strings"
	"unicode"

	"github.com/confianalyzer/analyzer-go/analyzer/plugins"
	"github.com/confianalyzer/analyzer-go/irtypes"
)

// WalkResult holds all IR data extracted from a single Go file.
type WalkResult struct {
	Functions []irtypes.FunctionIR
	Calls     []irtypes.CallIR
	Imports   []irtypes.ImportIR
	Exports   []irtypes.ExportIR
	Classes   []irtypes.ClassIR
}

// WalkFile extracts IR data from a parsed Go AST file.
func WalkFile(fset *token.FileSet, file *ast.File, modulePath string, registry *plugins.Registry) *WalkResult {
	w := &walker{
		fset:       fset,
		file:       file,
		modulePath: modulePath,
		registry:   registry,
	}
	w.walk()
	return &w.result
}

type walker struct {
	fset              *token.FileSet
	file              *ast.File
	modulePath        string
	registry          *plugins.Registry
	result            WalkResult
	enclosingFunction string
	structMethods     map[string][]string
}

func (w *walker) walk() {
	w.structMethods = make(map[string][]string)

	// First pass: collect all methods (FuncDecl with receivers) for struct method lists
	for _, decl := range w.file.Decls {
		if fd, ok := decl.(*ast.FuncDecl); ok && fd.Recv != nil {
			recvType := receiverTypeName(fd.Recv)
			if recvType != "" {
				w.structMethods[recvType] = append(w.structMethods[recvType], fd.Name.Name)
			}
		}
	}

	// Extract imports
	w.extractImports()

	// Walk all declarations
	for _, decl := range w.file.Decls {
		switch d := decl.(type) {
		case *ast.FuncDecl:
			w.extractFunction(d)
		case *ast.GenDecl:
			w.extractGenDecl(d)
		}
	}
}

func (w *walker) extractImports() {
	for _, imp := range w.file.Imports {
		importPath := strings.Trim(imp.Path.Value, `"`)

		var namespaceImport *string

		if imp.Name != nil {
			if imp.Name.Name == "." {
				// Dot import
				namespaceImport = nil
			} else if imp.Name.Name == "_" {
				ns := "_"
				namespaceImport = &ns
			} else {
				namespaceImport = &imp.Name.Name
			}
		} else {
			parts := strings.Split(importPath, "/")
			last := parts[len(parts)-1]
			namespaceImport = &last
		}

		isExternal := true
		if w.modulePath != "" && strings.HasPrefix(importPath, w.modulePath) {
			isExternal = false
		}

		loc := w.sourceLocation(imp.Pos(), imp.End())

		w.result.Imports = append(w.result.Imports, irtypes.ImportIR{
			Kind:            "import",
			ModulePath:      importPath,
			ResolvedPath:    nil,
			IsExternal:      isExternal,
			Symbols:         []irtypes.ImportedSymbolIR{},
			DefaultImport:   nil,
			NamespaceImport: namespaceImport,
			Location:        loc,
		})
	}
}

func (w *walker) extractFunction(fd *ast.FuncDecl) {
	name := fd.Name.Name
	var qualifiedName *string

	if fd.Recv != nil {
		recvType := receiverTypeName(fd.Recv)
		if recvType != "" {
			qn := recvType + "." + name
			qualifiedName = &qn
		}
	}

	params := extractParams(fd.Type.Params)
	retType := extractReturnType(fd.Type.Results)
	sig := buildSignature(name, fd.Type, fd.Recv)
	isExported := isExportedName(name)

	loc := w.sourceLocation(fd.Pos(), fd.End())

	fnIR := irtypes.FunctionIR{
		Kind:          "function",
		Name:          name,
		QualifiedName: qualifiedName,
		Signature:     sig,
		Parameters:    params,
		ReturnType:    retType,
		IsExported:    isExported,
		IsAsync:       false,
		Location:      loc,
	}

	w.result.Functions = append(w.result.Functions, fnIR)

	if isExported {
		w.result.Exports = append(w.result.Exports, irtypes.ExportIR{
			Kind:       "export",
			Name:       name,
			LocalName:  nil,
			IsDefault:  false,
			FromModule: nil,
			Location:   loc,
		})
	}

	// Walk function body for calls
	prevEnclosing := w.enclosingFunction
	if qualifiedName != nil {
		w.enclosingFunction = *qualifiedName
	} else {
		w.enclosingFunction = name
	}
	if fd.Body != nil {
		ast.Inspect(fd.Body, w.visitCallExpr)
	}
	w.enclosingFunction = prevEnclosing
}

func (w *walker) extractGenDecl(gd *ast.GenDecl) {
	for _, spec := range gd.Specs {
		switch s := spec.(type) {
		case *ast.TypeSpec:
			w.extractTypeSpec(s)
		case *ast.ValueSpec:
			w.extractValueSpec(s)
		}
	}
}

func (w *walker) extractTypeSpec(ts *ast.TypeSpec) {
	name := ts.Name.Name
	isExported := isExportedName(name)
	loc := w.sourceLocation(ts.Pos(), ts.End())

	switch st := ts.Type.(type) {
	case *ast.StructType:
		var superClass *string
		if st.Fields != nil {
			for _, field := range st.Fields.List {
				if len(field.Names) == 0 {
					embeddedName := typeExprToString(field.Type)
					superClass = &embeddedName
					break
				}
			}
		}

		methods := w.structMethods[name]
		if methods == nil {
			methods = []string{}
		}

		w.result.Classes = append(w.result.Classes, irtypes.ClassIR{
			Kind:       "class",
			Name:       name,
			SuperClass: superClass,
			Implements: []string{},
			IsExported: isExported,
			IsAbstract: false,
			Methods:    methods,
			Location:   loc,
		})

	case *ast.InterfaceType:
		var methods []string
		if st.Methods != nil {
			for _, m := range st.Methods.List {
				for _, n := range m.Names {
					methods = append(methods, n.Name)
				}
			}
		}
		if methods == nil {
			methods = []string{}
		}

		w.result.Classes = append(w.result.Classes, irtypes.ClassIR{
			Kind:       "class",
			Name:       name,
			SuperClass: nil,
			Implements: []string{},
			IsExported: isExported,
			IsAbstract: true,
			Methods:    methods,
			Location:   loc,
		})
	}

	if isExported {
		w.result.Exports = append(w.result.Exports, irtypes.ExportIR{
			Kind:       "export",
			Name:       name,
			LocalName:  nil,
			IsDefault:  false,
			FromModule: nil,
			Location:   loc,
		})
	}
}

func (w *walker) extractValueSpec(vs *ast.ValueSpec) {
	for _, name := range vs.Names {
		if isExportedName(name.Name) {
			loc := w.sourceLocation(vs.Pos(), vs.End())
			w.result.Exports = append(w.result.Exports, irtypes.ExportIR{
				Kind:       "export",
				Name:       name.Name,
				LocalName:  nil,
				IsDefault:  false,
				FromModule: nil,
				Location:   loc,
			})
		}
	}
}

func (w *walker) visitCallExpr(n ast.Node) bool {
	ce, ok := n.(*ast.CallExpr)
	if !ok {
		return true
	}

	var callee, receiver, method string
	var receiverPtr, methodPtr *string

	switch fn := ce.Fun.(type) {
	case *ast.SelectorExpr:
		method = fn.Sel.Name
		methodPtr = &method
		receiver = exprToString(fn.X)
		receiverPtr = &receiver
		callee = receiver + "." + method
	case *ast.Ident:
		callee = fn.Name
	default:
		callee = exprToString(ce.Fun)
	}

	argCount := len(ce.Args)
	var argRefs []string
	var stringArgs []string

	for _, arg := range ce.Args {
		switch a := arg.(type) {
		case *ast.Ident:
			argRefs = append(argRefs, a.Name)
		case *ast.BasicLit:
			if a.Kind == token.STRING {
				val := strings.Trim(a.Value, `"`)
				val = strings.Trim(val, "`")
				stringArgs = append(stringArgs, val)
			}
		}
	}

	loc := w.sourceLocation(ce.Pos(), ce.End())

	var enclosing *string
	if w.enclosingFunction != "" {
		enc := w.enclosingFunction
		enclosing = &enc
	}

	callIR := irtypes.CallIR{
		Kind:              "call",
		Callee:            callee,
		Receiver:          receiverPtr,
		Method:            methodPtr,
		ArgumentCount:     argCount,
		ArgumentRefs:      argRefs,
		StringArgs:        stringArgs,
		EnclosingFunction: enclosing,
		Location:          loc,
	}

	// Run plugins
	if w.registry != nil {
		if result := w.registry.AnalyzeCall(ce, callee, receiver, method, stringArgs); result != nil {
			if result.Enrichment != nil {
				callIR.Enrichments = append(callIR.Enrichments, *result.Enrichment)
			}
			if result.EndpointInfo != nil {
				w.enrichEnclosingFunction(result.EndpointInfo, result.Enrichment)
			}
		}
	}

	w.result.Calls = append(w.result.Calls, callIR)
	return true
}

func (w *walker) enrichEnclosingFunction(ep *irtypes.EndpointInfo, enrichment *irtypes.Enrichment) {
	if w.enclosingFunction == "" {
		return
	}
	for i := range w.result.Functions {
		fn := &w.result.Functions[i]
		funcName := fn.Name
		if fn.QualifiedName != nil {
			funcName = *fn.QualifiedName
		}
		if funcName == w.enclosingFunction {
			fn.EndpointInfo = ep
			if enrichment != nil {
				fn.Enrichments = append(fn.Enrichments, *enrichment)
			}
			break
		}
	}
}

func (w *walker) sourceLocation(pos, end token.Pos) irtypes.SourceLocation {
	start := w.fset.Position(pos)
	e := w.fset.Position(end)
	return irtypes.SourceLocation{
		StartLine:   start.Line,
		EndLine:     e.Line,
		StartColumn: start.Column,
		EndColumn:   e.Column,
	}
}

// Helper functions

func isExportedName(name string) bool {
	if name == "" {
		return false
	}
	return unicode.IsUpper(rune(name[0]))
}

func receiverTypeName(recv *ast.FieldList) string {
	if recv == nil || len(recv.List) == 0 {
		return ""
	}
	return typeExprToString(recv.List[0].Type)
}

func typeExprToString(expr ast.Expr) string {
	switch t := expr.(type) {
	case *ast.Ident:
		return t.Name
	case *ast.StarExpr:
		return typeExprToString(t.X)
	case *ast.SelectorExpr:
		return exprToString(t.X) + "." + t.Sel.Name
	case *ast.ArrayType:
		return "[]" + typeExprToString(t.Elt)
	case *ast.MapType:
		return "map[" + typeExprToString(t.Key) + "]" + typeExprToString(t.Value)
	case *ast.InterfaceType:
		return "interface{}"
	case *ast.Ellipsis:
		return "..." + typeExprToString(t.Elt)
	default:
		return fmt.Sprintf("%T", expr)
	}
}

func exprToString(expr ast.Expr) string {
	switch e := expr.(type) {
	case *ast.Ident:
		return e.Name
	case *ast.SelectorExpr:
		return exprToString(e.X) + "." + e.Sel.Name
	case *ast.CallExpr:
		return exprToString(e.Fun) + "()"
	case *ast.StarExpr:
		return "*" + exprToString(e.X)
	default:
		return fmt.Sprintf("%T", expr)
	}
}

func extractParams(fields *ast.FieldList) []irtypes.ParameterIR {
	if fields == nil {
		return []irtypes.ParameterIR{}
	}
	var params []irtypes.ParameterIR
	for _, field := range fields.List {
		typeStr := typeExprToString(field.Type)
		isVariadic := false
		if _, ok := field.Type.(*ast.Ellipsis); ok {
			isVariadic = true
		}

		if len(field.Names) == 0 {
			params = append(params, irtypes.ParameterIR{
				Name:           "",
				TypeAnnotation: &typeStr,
				HasDefault:     false,
				IsRest:         isVariadic,
			})
		} else {
			for _, name := range field.Names {
				params = append(params, irtypes.ParameterIR{
					Name:           name.Name,
					TypeAnnotation: &typeStr,
					HasDefault:     false,
					IsRest:         isVariadic,
				})
			}
		}
	}
	return params
}

func extractReturnType(fields *ast.FieldList) *string {
	if fields == nil || len(fields.List) == 0 {
		return nil
	}
	var types []string
	for _, field := range fields.List {
		t := typeExprToString(field.Type)
		if len(field.Names) > 0 {
			for range field.Names {
				types = append(types, t)
			}
		} else {
			types = append(types, t)
		}
	}
	if len(types) == 1 {
		return &types[0]
	}
	result := "(" + strings.Join(types, ", ") + ")"
	return &result
}

func buildSignature(name string, ft *ast.FuncType, recv *ast.FieldList) string {
	var sb strings.Builder
	sb.WriteString("func ")

	if recv != nil && len(recv.List) > 0 {
		sb.WriteString("(")
		r := recv.List[0]
		if len(r.Names) > 0 {
			sb.WriteString(r.Names[0].Name)
			sb.WriteString(" ")
		}
		sb.WriteString(typeExprToString(r.Type))
		sb.WriteString(") ")
	}

	sb.WriteString(name)
	sb.WriteString("(")

	if ft.Params != nil {
		for i, field := range ft.Params.List {
			if i > 0 {
				sb.WriteString(", ")
			}
			typeStr := typeExprToString(field.Type)
			if len(field.Names) > 0 {
				names := make([]string, len(field.Names))
				for j, n := range field.Names {
					names[j] = n.Name
				}
				sb.WriteString(strings.Join(names, ", "))
				sb.WriteString(" ")
			}
			sb.WriteString(typeStr)
		}
	}

	sb.WriteString(")")

	if ft.Results != nil && len(ft.Results.List) > 0 {
		sb.WriteString(" ")
		if len(ft.Results.List) > 1 || len(ft.Results.List[0].Names) > 0 {
			sb.WriteString("(")
		}
		for i, field := range ft.Results.List {
			if i > 0 {
				sb.WriteString(", ")
			}
			if len(field.Names) > 0 {
				names := make([]string, len(field.Names))
				for j, n := range field.Names {
					names[j] = n.Name
				}
				sb.WriteString(strings.Join(names, ", "))
				sb.WriteString(" ")
			}
			sb.WriteString(typeExprToString(field.Type))
		}
		if len(ft.Results.List) > 1 || len(ft.Results.List[0].Names) > 0 {
			sb.WriteString(")")
		}
	}

	return sb.String()
}
