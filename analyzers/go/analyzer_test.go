package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/confianalyzer/analyzer-go/analyzer"
	"github.com/confianalyzer/analyzer-go/irtypes"
)

// helper: create a temp repo with given files and run the analyzer
func analyzeFixture(t *testing.T, files map[string]string) *irtypes.IrDocument {
	t.Helper()
	dir := t.TempDir()

	for name, content := range files {
		path := filepath.Join(dir, name)
		if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
			t.Fatalf("mkdir: %v", err)
		}
		if err := os.WriteFile(path, []byte(content), 0644); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}

	doc, err := analyzer.AnalyzeRepository(dir, "test-repo", false)
	if err != nil {
		t.Fatalf("AnalyzeRepository: %v", err)
	}
	return doc
}

func TestFunctionExtraction(t *testing.T) {
	doc := analyzeFixture(t, map[string]string{
		"go.mod": "module example.com/test\n\ngo 1.21\n",
		"main.go": `package main

import "fmt"

func Hello(name string) string {
	return "Hello, " + name
}

func private() {
	fmt.Println("private")
}

type Server struct{}

func (s *Server) Start(port int) error {
	return nil
}
`,
	})

	if len(doc.Files) != 1 {
		t.Fatalf("expected 1 file, got %d", len(doc.Files))
	}

	file := doc.Files[0]
	if len(file.Functions) != 3 {
		t.Fatalf("expected 3 functions, got %d", len(file.Functions))
	}

	// Check Hello function
	hello := file.Functions[0]
	if hello.Name != "Hello" {
		t.Errorf("expected name Hello, got %s", hello.Name)
	}
	if hello.QualifiedName != nil {
		t.Errorf("expected no qualifiedName for top-level func, got %s", *hello.QualifiedName)
	}
	if !hello.IsExported {
		t.Error("expected Hello to be exported")
	}
	if len(hello.Parameters) != 1 {
		t.Fatalf("expected 1 param, got %d", len(hello.Parameters))
	}
	if hello.Parameters[0].Name != "name" {
		t.Errorf("expected param name 'name', got %s", hello.Parameters[0].Name)
	}
	if hello.ReturnType == nil || *hello.ReturnType != "string" {
		t.Errorf("expected return type 'string', got %v", hello.ReturnType)
	}

	// Check private function
	priv := file.Functions[1]
	if priv.Name != "private" {
		t.Errorf("expected name private, got %s", priv.Name)
	}
	if priv.IsExported {
		t.Error("expected private to not be exported")
	}

	// Check method
	start := file.Functions[2]
	if start.Name != "Start" {
		t.Errorf("expected name Start, got %s", start.Name)
	}
	if start.QualifiedName == nil || *start.QualifiedName != "Server.Start" {
		t.Errorf("expected qualifiedName Server.Start, got %v", start.QualifiedName)
	}
}

func TestStructExtraction(t *testing.T) {
	doc := analyzeFixture(t, map[string]string{
		"go.mod": "module example.com/test\n\ngo 1.21\n",
		"types.go": `package main

type Base struct {
	ID int
}

type User struct {
	Base
	Name  string
	Email string
}

func (u *User) GetName() string {
	return u.Name
}
`,
	})

	file := doc.Files[0]

	var userClass *irtypes.ClassIR
	for i := range file.Classes {
		if file.Classes[i].Name == "User" {
			userClass = &file.Classes[i]
			break
		}
	}

	if userClass == nil {
		t.Fatal("User class not found")
	}

	if userClass.Kind != "class" {
		t.Errorf("expected kind class, got %s", userClass.Kind)
	}
	if !userClass.IsExported {
		t.Error("expected User to be exported")
	}
	if userClass.SuperClass == nil || *userClass.SuperClass != "Base" {
		t.Errorf("expected superClass Base, got %v", userClass.SuperClass)
	}
	if userClass.IsAbstract {
		t.Error("expected User to not be abstract")
	}
	found := false
	for _, m := range userClass.Methods {
		if m == "GetName" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected GetName in methods, got %v", userClass.Methods)
	}
}

func TestInterfaceExtraction(t *testing.T) {
	doc := analyzeFixture(t, map[string]string{
		"go.mod": "module example.com/test\n\ngo 1.21\n",
		"iface.go": `package main

type Reader interface {
	Read(p []byte) (n int, err error)
}

type unexported interface {
	doStuff()
}
`,
	})

	file := doc.Files[0]
	if len(file.Classes) != 2 {
		t.Fatalf("expected 2 classes, got %d", len(file.Classes))
	}

	reader := file.Classes[0]
	if reader.Name != "Reader" {
		t.Errorf("expected name Reader, got %s", reader.Name)
	}
	if !reader.IsAbstract {
		t.Error("expected interface to be abstract")
	}
	if !reader.IsExported {
		t.Error("expected Reader to be exported")
	}
	if len(reader.Methods) != 1 || reader.Methods[0] != "Read" {
		t.Errorf("expected methods [Read], got %v", reader.Methods)
	}

	unexported := file.Classes[1]
	if unexported.IsExported {
		t.Error("expected unexported to not be exported")
	}
}

func TestImportExtraction(t *testing.T) {
	doc := analyzeFixture(t, map[string]string{
		"go.mod": "module example.com/test\n\ngo 1.21\n",
		"main.go": `package main

import (
	"fmt"
	"net/http"
	alias "encoding/json"
)

func main() {
	fmt.Println("hello")
	_ = http.StatusOK
	_ = alias.NewDecoder
}
`,
	})

	file := doc.Files[0]
	if len(file.Imports) != 3 {
		t.Fatalf("expected 3 imports, got %d", len(file.Imports))
	}

	fmtImport := file.Imports[0]
	if fmtImport.ModulePath != "fmt" {
		t.Errorf("expected modulePath fmt, got %s", fmtImport.ModulePath)
	}
	if fmtImport.NamespaceImport == nil || *fmtImport.NamespaceImport != "fmt" {
		t.Errorf("expected namespaceImport fmt, got %v", fmtImport.NamespaceImport)
	}
	if !fmtImport.IsExternal {
		t.Error("expected fmt to be external")
	}

	aliasImport := file.Imports[2]
	if aliasImport.ModulePath != "encoding/json" {
		t.Errorf("expected modulePath encoding/json, got %s", aliasImport.ModulePath)
	}
	if aliasImport.NamespaceImport == nil || *aliasImport.NamespaceImport != "alias" {
		t.Errorf("expected namespaceImport alias, got %v", aliasImport.NamespaceImport)
	}
}

func TestExportDetection(t *testing.T) {
	doc := analyzeFixture(t, map[string]string{
		"go.mod": "module example.com/test\n\ngo 1.21\n",
		"main.go": `package main

var (
	PublicVar  = "public"
	privateVar = "private"
)

const (
	PublicConst  = 42
	privateConst = 0
)

func ExportedFunc() {}
func unexportedFunc() {}
`,
	})

	file := doc.Files[0]
	exportNames := map[string]bool{}
	for _, exp := range file.Exports {
		exportNames[exp.Name] = true
		if exp.IsDefault {
			t.Errorf("Go should never have default exports, got default for %s", exp.Name)
		}
	}

	if !exportNames["PublicVar"] {
		t.Error("expected PublicVar to be exported")
	}
	if !exportNames["PublicConst"] {
		t.Error("expected PublicConst to be exported")
	}
	if !exportNames["ExportedFunc"] {
		t.Error("expected ExportedFunc to be exported")
	}
	if exportNames["privateVar"] {
		t.Error("expected privateVar to not be exported")
	}
	if exportNames["privateConst"] {
		t.Error("expected privateConst to not be exported")
	}
	if exportNames["unexportedFunc"] {
		t.Error("expected unexportedFunc to not be exported")
	}
}

func TestCallExtraction(t *testing.T) {
	doc := analyzeFixture(t, map[string]string{
		"go.mod": "module example.com/test\n\ngo 1.21\n",
		"main.go": `package main

import "fmt"

func doWork() {
	fmt.Println("hello", "world")
	helper(42)
}

func helper(n int) {}
`,
	})

	file := doc.Files[0]
	if len(file.Calls) < 2 {
		t.Fatalf("expected at least 2 calls, got %d", len(file.Calls))
	}

	printlnCall := file.Calls[0]
	if printlnCall.Callee != "fmt.Println" {
		t.Errorf("expected callee fmt.Println, got %s", printlnCall.Callee)
	}
	if printlnCall.Receiver == nil || *printlnCall.Receiver != "fmt" {
		t.Errorf("expected receiver fmt, got %v", printlnCall.Receiver)
	}
	if printlnCall.Method == nil || *printlnCall.Method != "Println" {
		t.Errorf("expected method Println, got %v", printlnCall.Method)
	}
	if len(printlnCall.StringArgs) != 2 || printlnCall.StringArgs[0] != "hello" {
		t.Errorf("expected stringArgs [hello world], got %v", printlnCall.StringArgs)
	}
	if printlnCall.EnclosingFunction == nil || *printlnCall.EnclosingFunction != "doWork" {
		t.Errorf("expected enclosingFunction doWork, got %v", printlnCall.EnclosingFunction)
	}

	helperCall := file.Calls[1]
	if helperCall.Callee != "helper" {
		t.Errorf("expected callee helper, got %s", helperCall.Callee)
	}
	if helperCall.Receiver != nil {
		t.Errorf("expected nil receiver, got %v", helperCall.Receiver)
	}
	if helperCall.ArgumentCount != 1 {
		t.Errorf("expected 1 arg, got %d", helperCall.ArgumentCount)
	}
}

func TestGinRouteDetection(t *testing.T) {
	doc := analyzeFixture(t, map[string]string{
		"go.mod": "module example.com/test\n\ngo 1.21\n",
		"main.go": `package main

func setupRoutes() {
	r.GET("/api/users", listUsers)
	r.POST("/api/users", createUser)
}

func listUsers() {}
func createUser() {}
`,
	})

	file := doc.Files[0]

	var getCall, postCall *irtypes.CallIR
	for i := range file.Calls {
		if file.Calls[i].Callee == "r.GET" {
			getCall = &file.Calls[i]
		}
		if file.Calls[i].Callee == "r.POST" {
			postCall = &file.Calls[i]
		}
	}

	if getCall == nil {
		t.Fatal("GET call not found")
	}
	if len(getCall.Enrichments) == 0 {
		t.Fatal("expected enrichments on GET call")
	}
	if getCall.Enrichments[0].PluginName != "gin" {
		t.Errorf("expected plugin gin, got %s", getCall.Enrichments[0].PluginName)
	}
	if getCall.Enrichments[0].Route == nil || getCall.Enrichments[0].Route.Method != "GET" {
		t.Error("expected route method GET")
	}
	if getCall.Enrichments[0].Route.Path != "/api/users" {
		t.Errorf("expected route path /api/users, got %s", getCall.Enrichments[0].Route.Path)
	}

	if postCall == nil {
		t.Fatal("POST call not found")
	}
	if len(postCall.Enrichments) == 0 || postCall.Enrichments[0].Route.Method != "POST" {
		t.Error("expected POST enrichment")
	}

	var setupFn *irtypes.FunctionIR
	for i := range file.Functions {
		if file.Functions[i].Name == "setupRoutes" {
			setupFn = &file.Functions[i]
			break
		}
	}
	if setupFn == nil {
		t.Fatal("setupRoutes function not found")
	}
	if setupFn.EndpointInfo == nil {
		t.Error("expected endpointInfo on setupRoutes")
	}
}

func TestFullIRDocument(t *testing.T) {
	doc := analyzeFixture(t, map[string]string{
		"go.mod": "module example.com/myapp\n\ngo 1.21\n",
		"main.go": `package main

import "fmt"

func main() {
	fmt.Println("Hello, world!")
}
`,
	})

	if doc.Schema != "confianalyzer-ir-v1" {
		t.Errorf("expected schema confianalyzer-ir-v1, got %s", doc.Schema)
	}
	if doc.Analyzer.Language != "go" {
		t.Errorf("expected language go, got %s", doc.Analyzer.Language)
	}
	if doc.Repository.Name != "test-repo" {
		t.Errorf("expected repo name test-repo, got %s", doc.Repository.Name)
	}
	if len(doc.Files) != 1 {
		t.Fatalf("expected 1 file, got %d", len(doc.Files))
	}

	// Verify JSON serialization round-trip
	data, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var parsed irtypes.IrDocument
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if parsed.Schema != doc.Schema {
		t.Error("schema mismatch after round-trip")
	}

	file := doc.Files[0]
	if file.Language != "go" {
		t.Errorf("expected language go, got %s", file.Language)
	}
	if file.Hash == "" {
		t.Error("expected non-empty hash")
	}
	if len(file.Functions) != 1 {
		t.Errorf("expected 1 function, got %d", len(file.Functions))
	}
	if file.Functions[0].Kind != "function" {
		t.Errorf("expected kind function, got %s", file.Functions[0].Kind)
	}
}
