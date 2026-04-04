package com.confianalyzer;

import com.confianalyzer.ir.*;
import com.confianalyzer.plugins.PluginRegistry;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.ImportDeclaration;
import com.github.javaparser.ast.Modifier;
import com.github.javaparser.ast.body.*;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.type.ClassOrInterfaceType;
import com.github.javaparser.ast.visitor.VoidVisitorAdapter;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * AST visitor that extracts functions, calls, imports, exports, and classes
 * from a parsed Java compilation unit.
 */
public class AstWalker extends VoidVisitorAdapter<Void> {

    private final List<FunctionIR> functions = new ArrayList<>();
    private final List<CallIR> calls = new ArrayList<>();
    private final List<ImportIR> imports = new ArrayList<>();
    private final List<ExportIR> exports = new ArrayList<>();
    private final List<ClassIR> classes = new ArrayList<>();

    private String currentClassName = null;
    private String currentEnclosingFunction = null;
    private final PluginRegistry pluginRegistry;

    public AstWalker(PluginRegistry pluginRegistry) {
        this.pluginRegistry = pluginRegistry;
    }

    public List<FunctionIR> getFunctions() { return functions; }
    public List<CallIR> getCalls() { return calls; }
    public List<ImportIR> getImports() { return imports; }
    public List<ExportIR> getExports() { return exports; }
    public List<ClassIR> getClasses() { return classes; }

    /**
     * Walk the entire compilation unit.
     */
    public void walk(CompilationUnit cu) {
        visit(cu, null);
    }

    @Override
    public void visit(ImportDeclaration n, Void arg) {
        ImportIR ir = new ImportIR();
        String fullPath = n.getNameAsString();
        ir.setModulePath(fullPath);
        ir.setResolvedPath(null);

        // Determine if external: java.*, javax.*, and non-project packages
        ir.setExternal(isExternalImport(fullPath));

        List<ImportedSymbolIR> symbols = new ArrayList<>();
        if (n.isAsterisk()) {
            symbols.add(new ImportedSymbolIR("*", null));
        } else {
            // Last part of the import path is the symbol name
            String symbolName = fullPath.contains(".")
                    ? fullPath.substring(fullPath.lastIndexOf('.') + 1)
                    : fullPath;
            symbols.add(new ImportedSymbolIR(symbolName, null));
        }
        ir.setSymbols(symbols);
        ir.setDefaultImport(null);
        ir.setNamespaceImport(n.isAsterisk() ? fullPath : null);

        ir.setLocation(makeLocation(n));

        imports.add(ir);
        super.visit(n, arg);
    }

    @Override
    public void visit(ClassOrInterfaceDeclaration n, Void arg) {
        String previousClassName = currentClassName;
        currentClassName = n.getNameAsString();

        ClassIR classIR = new ClassIR();
        classIR.setName(n.getNameAsString());

        // Superclass
        if (!n.getExtendedTypes().isEmpty()) {
            classIR.setSuperClass(n.getExtendedTypes().get(0).getNameAsString());
        }

        // Implements
        List<String> implementsList = n.getImplementedTypes().stream()
                .map(ClassOrInterfaceType::getNameAsString)
                .collect(Collectors.toList());
        classIR.setImplementsList(implementsList);

        classIR.setExported(isPublicOrPackagePrivate(n));
        classIR.setAbstract(n.isAbstract());

        // Collect method names
        List<String> methodNames = n.getMethods().stream()
                .map(MethodDeclaration::getNameAsString)
                .collect(Collectors.toList());
        classIR.setMethods(methodNames);

        classIR.setLocation(makeLocation(n));
        classes.add(classIR);

        // Export for public classes
        if (n.isPublic()) {
            ExportIR export = new ExportIR();
            export.setName(n.getNameAsString());
            export.setLocalName(n.getNameAsString());
            export.setDefault(false);
            export.setFromModule(null);
            export.setLocation(makeLocation(n));
            exports.add(export);
        }

        super.visit(n, arg);
        currentClassName = previousClassName;
    }

    @Override
    public void visit(MethodDeclaration n, Void arg) {
        String previousEnclosing = currentEnclosingFunction;
        String qualifiedName = currentClassName != null
                ? currentClassName + "." + n.getNameAsString()
                : n.getNameAsString();
        currentEnclosingFunction = qualifiedName;

        FunctionIR fn = new FunctionIR();
        fn.setName(n.getNameAsString());
        fn.setQualifiedName(qualifiedName);
        fn.setSignature(n.getDeclarationAsString(true, true, true));

        // Parameters
        List<ParameterIR> params = n.getParameters().stream()
                .map(p -> {
                    boolean isVarArgs = p.isVarArgs();
                    String type = p.getTypeAsString();
                    if (isVarArgs) {
                        type = type + "...";
                    }
                    return new ParameterIR(p.getNameAsString(), type, false, isVarArgs);
                })
                .collect(Collectors.toList());
        fn.setParameters(params);

        // Return type
        fn.setReturnType(n.getTypeAsString());

        // Visibility
        fn.setExported(isPublicOrPackagePrivate(n));
        fn.setAsync(false);
        fn.setStatic(n.isStatic());
        fn.setAccessibility(getAccessibility(n));

        fn.setLocation(makeLocation(n));

        // Framework plugin enrichment
        pluginRegistry.enrichFunction(fn, n, currentClassName);

        functions.add(fn);

        // Export for public methods
        if (n.isPublic()) {
            ExportIR export = new ExportIR();
            export.setName(qualifiedName);
            export.setLocalName(n.getNameAsString());
            export.setDefault(false);
            export.setFromModule(null);
            export.setLocation(makeLocation(n));
            exports.add(export);
        }

        super.visit(n, arg);
        currentEnclosingFunction = previousEnclosing;
    }

    @Override
    public void visit(ConstructorDeclaration n, Void arg) {
        String previousEnclosing = currentEnclosingFunction;
        String qualifiedName = currentClassName != null
                ? currentClassName + ".<init>"
                : "<init>";
        currentEnclosingFunction = qualifiedName;

        FunctionIR fn = new FunctionIR();
        fn.setName("<init>");
        fn.setQualifiedName(qualifiedName);
        fn.setSignature(n.getDeclarationAsString(true, true, true));

        List<ParameterIR> params = n.getParameters().stream()
                .map(p -> new ParameterIR(p.getNameAsString(), p.getTypeAsString(), false, p.isVarArgs()))
                .collect(Collectors.toList());
        fn.setParameters(params);

        fn.setReturnType(null);
        fn.setExported(isPublicOrPackagePrivate(n));
        fn.setAsync(false);
        fn.setStatic(false);
        fn.setAccessibility(getAccessibility(n));
        fn.setLocation(makeLocation(n));

        functions.add(fn);

        // Export for public constructors
        if (n.isPublic()) {
            ExportIR export = new ExportIR();
            export.setName(qualifiedName);
            export.setLocalName("<init>");
            export.setDefault(false);
            export.setFromModule(null);
            export.setLocation(makeLocation(n));
            exports.add(export);
        }

        super.visit(n, arg);
        currentEnclosingFunction = previousEnclosing;
    }

    @Override
    public void visit(MethodCallExpr n, Void arg) {
        CallIR call = new CallIR();

        String methodName = n.getNameAsString();
        String receiver = null;

        if (n.getScope().isPresent()) {
            receiver = n.getScope().get().toString();
            call.setCallee(receiver + "." + methodName);
        } else {
            call.setCallee(methodName);
        }

        call.setReceiver(receiver);
        call.setMethod(methodName);
        call.setArgumentCount(n.getArguments().size());
        call.setEnclosingFunction(currentEnclosingFunction);

        // Extract string args and argument refs
        List<String> stringArgs = new ArrayList<>();
        List<String> argumentRefs = new ArrayList<>();
        for (Expression expr : n.getArguments()) {
            if (expr instanceof StringLiteralExpr) {
                stringArgs.add(((StringLiteralExpr) expr).asString());
            }
            if (expr instanceof NameExpr) {
                argumentRefs.add(((NameExpr) expr).getNameAsString());
            }
        }
        if (!stringArgs.isEmpty()) {
            call.setStringArgs(stringArgs);
        }
        if (!argumentRefs.isEmpty()) {
            call.setArgumentRefs(argumentRefs);
        }

        call.setLocation(makeLocation(n));

        // Framework plugin enrichment for calls
        pluginRegistry.enrichCall(call, n, currentEnclosingFunction);

        calls.add(call);

        super.visit(n, arg);
    }

    @Override
    public void visit(FieldDeclaration n, Void arg) {
        // Export public fields
        if (n.isPublic()) {
            for (VariableDeclarator var : n.getVariables()) {
                ExportIR export = new ExportIR();
                String name = currentClassName != null
                        ? currentClassName + "." + var.getNameAsString()
                        : var.getNameAsString();
                export.setName(name);
                export.setLocalName(var.getNameAsString());
                export.setDefault(false);
                export.setFromModule(null);
                export.setLocation(makeLocation(n));
                exports.add(export);
            }
        }
        super.visit(n, arg);
    }

    // --- Helpers ---

    private boolean isExternalImport(String path) {
        return path.startsWith("java.") || path.startsWith("javax.")
                || path.startsWith("org.") || path.startsWith("com.google.")
                || path.startsWith("com.fasterxml.") || path.startsWith("io.")
                || path.startsWith("net.") || path.startsWith("jakarta.");
    }

    private boolean isPublicOrPackagePrivate(ClassOrInterfaceDeclaration n) {
        return !n.isPrivate() && !n.isProtected();
    }

    private boolean isPublicOrPackagePrivate(CallableDeclaration<?> n) {
        return !n.getModifiers().contains(Modifier.privateModifier())
                && !n.getModifiers().contains(Modifier.protectedModifier());
    }

    private String getAccessibility(CallableDeclaration<?> n) {
        if (n.isPublic()) return "public";
        if (n.isProtected()) return "protected";
        if (n.isPrivate()) return "private";
        return null; // package-private
    }

    private SourceLocation makeLocation(com.github.javaparser.ast.Node n) {
        int startLine = n.getBegin().map(p -> p.line).orElse(0);
        int startCol = n.getBegin().map(p -> p.column).orElse(0);
        int endLine = n.getEnd().map(p -> p.line).orElse(0);
        int endCol = n.getEnd().map(p -> p.column).orElse(0);
        return new SourceLocation(startLine, endLine, startCol, endCol);
    }
}
