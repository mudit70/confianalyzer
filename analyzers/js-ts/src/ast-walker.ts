import ts from "typescript";
import type {
  FunctionIR,
  CallIR,
  ImportIR,
  ExportIR,
  ClassIR,
  ParameterIR,
  SourceLocation,
  ImportedSymbolIR,
} from "./types.js";
import type { FrameworkPlugin } from "./framework-plugins/index.js";

export interface FileWalkResult {
  functions: FunctionIR[];
  calls: CallIR[];
  imports: ImportIR[];
  exports: ExportIR[];
  classes: ClassIR[];
}

function getLocation(node: ts.Node, sourceFile: ts.SourceFile): SourceLocation {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return {
    startLine: start.line + 1,
    endLine: end.line + 1,
    startColumn: start.character + 1,
    endColumn: end.character + 1,
  };
}

function getParameterIR(param: ts.ParameterDeclaration, sourceFile: ts.SourceFile): ParameterIR {
  const name = param.name.getText(sourceFile);
  const typeAnnotation = param.type ? param.type.getText(sourceFile) : null;
  const hasDefault = param.initializer !== undefined;
  const isRest = param.dotDotDotToken !== undefined;
  return { name, typeAnnotation, hasDefault, isRest };
}

function getReturnType(
  node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | ts.FunctionExpression,
  sourceFile: ts.SourceFile
): string | null {
  if (node.type) {
    return node.type.getText(sourceFile);
  }
  return null;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return modifiers?.some((m) => m.kind === kind) ?? false;
}

function isNodeExported(node: ts.Node): boolean {
  return hasModifier(node, ts.SyntaxKind.ExportKeyword);
}

function buildSignature(
  name: string,
  params: ParameterIR[],
  returnType: string | null
): string {
  const paramStr = params
    .map((p) => {
      let s = p.isRest ? `...${p.name}` : p.name;
      if (p.typeAnnotation) s += `: ${p.typeAnnotation}`;
      if (p.hasDefault) s += " = ...";
      return s;
    })
    .join(", ");
  const ret = returnType ? `: ${returnType}` : "";
  return `${name}(${paramStr})${ret}`;
}

function getCalleeText(expr: ts.Expression, sourceFile: ts.SourceFile): string {
  return expr.getText(sourceFile);
}

function getReceiverAndMethod(
  expr: ts.LeftHandSideExpression,
  sourceFile: ts.SourceFile
): { receiver: string | null; method: string | null } {
  if (ts.isPropertyAccessExpression(expr)) {
    return {
      receiver: expr.expression.getText(sourceFile),
      method: expr.name.getText(sourceFile),
    };
  }
  return { receiver: null, method: null };
}

function extractStringArgs(args: ts.NodeArray<ts.Expression>, sourceFile: ts.SourceFile): string[] {
  const result: string[] = [];
  for (const arg of args) {
    if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
      result.push(arg.text);
    }
  }
  return result;
}

function extractArgumentRefs(args: ts.NodeArray<ts.Expression>, sourceFile: ts.SourceFile): string[] {
  const result: string[] = [];
  for (const arg of args) {
    if (ts.isIdentifier(arg)) {
      result.push(arg.text);
    }
  }
  return result;
}

export function walkFile(
  sourceFile: ts.SourceFile,
  program: ts.Program,
  plugins: FrameworkPlugin[]
): FileWalkResult {
  const functions: FunctionIR[] = [];
  const calls: CallIR[] = [];
  const imports: ImportIR[] = [];
  const exports: ExportIR[] = [];
  const classes: ClassIR[] = [];

  const enclosingFunctionStack: string[] = [];

  function currentEnclosingFunction(): string | null {
    return enclosingFunctionStack.length > 0
      ? enclosingFunctionStack[enclosingFunctionStack.length - 1]
      : null;
  }

  function processFunctionLike(
    node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | ts.FunctionExpression,
    name: string,
    qualifiedName: string | null,
    exported: boolean,
    isStatic: boolean,
    accessibility: "public" | "protected" | "private" | null
  ): FunctionIR {
    const params = node.parameters.map((p) => getParameterIR(p, sourceFile));
    const returnType = getReturnType(node, sourceFile);
    const isAsync = hasModifier(node, ts.SyntaxKind.AsyncKeyword);
    const signature = buildSignature(name, params, returnType);
    const location = getLocation(node, sourceFile);

    const funcIR: FunctionIR = {
      kind: "function",
      name,
      qualifiedName,
      signature,
      parameters: params,
      returnType,
      isExported: exported,
      isAsync,
      isStatic: isStatic || undefined,
      accessibility: accessibility || undefined,
      location,
    };

    return funcIR;
  }

  function visitCallExpression(node: ts.CallExpression): void {
    const callee = getCalleeText(node.expression, sourceFile);
    const { receiver, method } = getReceiverAndMethod(node.expression, sourceFile);
    const stringArgs = extractStringArgs(node.arguments, sourceFile);
    const argumentRefs = extractArgumentRefs(node.arguments, sourceFile);

    const callIR: CallIR = {
      kind: "call",
      callee,
      receiver,
      method,
      argumentCount: node.arguments.length,
      argumentRefs: argumentRefs.length > 0 ? argumentRefs : undefined,
      stringArgs: stringArgs.length > 0 ? stringArgs : undefined,
      enclosingFunction: currentEnclosingFunction(),
      location: getLocation(node, sourceFile),
    };

    // Run framework plugins on calls
    for (const plugin of plugins) {
      if (plugin.analyzeCall) {
        const enrichment = plugin.analyzeCall(callIR, node, sourceFile);
        if (enrichment) {
          if (!callIR.enrichments) callIR.enrichments = [];
          callIR.enrichments.push(enrichment);
        }
      }
    }

    calls.push(callIR);
  }

  function visitImportDeclaration(node: ts.ImportDeclaration): void {
    if (!ts.isStringLiteral(node.moduleSpecifier)) return;

    const modulePath = node.moduleSpecifier.text;
    const isExternal = !modulePath.startsWith(".") && !modulePath.startsWith("/");

    let defaultImport: string | null = null;
    let namespaceImport: string | null = null;
    const symbols: ImportedSymbolIR[] = [];

    const importClause = node.importClause;
    if (importClause) {
      if (importClause.name) {
        defaultImport = importClause.name.text;
      }
      const bindings = importClause.namedBindings;
      if (bindings) {
        if (ts.isNamespaceImport(bindings)) {
          namespaceImport = bindings.name.text;
        } else if (ts.isNamedImports(bindings)) {
          for (const el of bindings.elements) {
            symbols.push({
              name: (el.propertyName || el.name).text,
              alias: el.propertyName ? el.name.text : null,
            });
          }
        }
      }
    }

    // Try to resolve the module path
    let resolvedPath: string | null = null;
    if (!isExternal) {
      const resolved = ts.resolveModuleName(
        modulePath,
        sourceFile.fileName,
        program.getCompilerOptions(),
        ts.sys
      );
      if (resolved.resolvedModule) {
        resolvedPath = resolved.resolvedModule.resolvedFileName;
      }
    }

    imports.push({
      kind: "import",
      modulePath,
      resolvedPath,
      isExternal,
      symbols,
      defaultImport,
      namespaceImport,
      location: getLocation(node, sourceFile),
    });
  }

  function visitExportDeclaration(node: ts.ExportDeclaration): void {
    const fromModule = node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
      ? node.moduleSpecifier.text
      : null;

    if (node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const el of node.exportClause.elements) {
        const exportedName = el.name.text;
        const localName = el.propertyName ? el.propertyName.text : null;
        exports.push({
          kind: "export",
          name: exportedName,
          localName,
          isDefault: false,
          fromModule,
          location: getLocation(node, sourceFile),
        });
      }
    }
  }

  function visitExportAssignment(node: ts.ExportAssignment): void {
    const name = node.expression.getText(sourceFile);
    exports.push({
      kind: "export",
      name,
      localName: null,
      isDefault: !node.isExportEquals,
      fromModule: null,
      location: getLocation(node, sourceFile),
    });
  }

  function visitRequire(node: ts.VariableStatement): void {
    for (const decl of node.declarationList.declarations) {
      if (
        decl.initializer &&
        ts.isCallExpression(decl.initializer) &&
        ts.isIdentifier(decl.initializer.expression) &&
        decl.initializer.expression.text === "require" &&
        decl.initializer.arguments.length === 1 &&
        ts.isStringLiteral(decl.initializer.arguments[0])
      ) {
        const modulePath = (decl.initializer.arguments[0] as ts.StringLiteral).text;
        const isExternal = !modulePath.startsWith(".") && !modulePath.startsWith("/");
        const varName = decl.name.getText(sourceFile);

        imports.push({
          kind: "import",
          modulePath,
          resolvedPath: null,
          isExternal,
          symbols: [],
          defaultImport: null,
          namespaceImport: varName,
          location: getLocation(node, sourceFile),
        });
      }
    }
  }

  function visit(node: ts.Node): void {
    // Import declarations
    if (ts.isImportDeclaration(node)) {
      visitImportDeclaration(node);
      return;
    }

    // Export declarations (named exports)
    if (ts.isExportDeclaration(node)) {
      visitExportDeclaration(node);
      // Don't return - still visit children
    }

    // Export assignment (export default X)
    if (ts.isExportAssignment(node)) {
      visitExportAssignment(node);
      return;
    }

    // Require statements
    if (ts.isVariableStatement(node)) {
      visitRequire(node);
    }

    // Function declarations
    if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.text;
      const exported = isNodeExported(node);
      const funcIR = processFunctionLike(node, name, null, exported, false, null);

      if (exported) {
        exports.push({
          kind: "export",
          name,
          localName: null,
          isDefault: hasModifier(node, ts.SyntaxKind.DefaultKeyword),
          fromModule: null,
          location: getLocation(node, sourceFile),
        });
      }

      functions.push(funcIR);

      // Walk body
      enclosingFunctionStack.push(name);
      ts.forEachChild(node, visit);
      enclosingFunctionStack.pop();

      // Run plugins on the function after walking body (so calls are collected)
      for (const plugin of plugins) {
        if (plugin.analyzeFunction) {
          const result = plugin.analyzeFunction(funcIR, node, sourceFile, calls);
          if (result?.endpointInfo) funcIR.endpointInfo = result.endpointInfo;
          if (result?.enrichment) {
            if (!funcIR.enrichments) funcIR.enrichments = [];
            funcIR.enrichments.push(result.enrichment);
          }
        }
      }
      return;
    }

    // Variable declarations with arrow functions / function expressions
    if (ts.isVariableStatement(node)) {
      const exported = isNodeExported(node);
      for (const decl of node.declarationList.declarations) {
        if (
          decl.initializer &&
          ts.isIdentifier(decl.name) &&
          (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
        ) {
          const name = decl.name.text;
          const funcIR = processFunctionLike(decl.initializer, name, null, exported, false, null);

          if (exported) {
            exports.push({
              kind: "export",
              name,
              localName: null,
              isDefault: false,
              fromModule: null,
              location: getLocation(node, sourceFile),
            });
          }

          functions.push(funcIR);

          enclosingFunctionStack.push(name);
          ts.forEachChild(decl.initializer, visit);
          enclosingFunctionStack.pop();

          // Run plugins
          for (const plugin of plugins) {
            if (plugin.analyzeFunction) {
              const result = plugin.analyzeFunction(funcIR, decl.initializer, sourceFile, calls);
              if (result?.endpointInfo) funcIR.endpointInfo = result.endpointInfo;
              if (result?.enrichment) {
                if (!funcIR.enrichments) funcIR.enrichments = [];
                funcIR.enrichments.push(result.enrichment);
              }
            }
          }
          continue;
        }
      }
      // Still visit children for other variable declarations
      ts.forEachChild(node, visit);
      return;
    }

    // Class declarations
    if (ts.isClassDeclaration(node)) {
      const className = node.name?.text ?? "<anonymous>";
      const exported = isNodeExported(node);
      const isAbstract = hasModifier(node, ts.SyntaxKind.AbstractKeyword);

      let superClass: string | null = null;
      const implementsList: string[] = [];

      if (node.heritageClauses) {
        for (const clause of node.heritageClauses) {
          if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
            superClass = clause.types[0]?.expression.getText(sourceFile) ?? null;
          } else if (clause.token === ts.SyntaxKind.ImplementsKeyword) {
            for (const t of clause.types) {
              implementsList.push(t.expression.getText(sourceFile));
            }
          }
        }
      }

      const methodNames: string[] = [];

      // Visit class members
      for (const member of node.members) {
        if (ts.isMethodDeclaration(member) && member.name) {
          const methodName = member.name.getText(sourceFile);
          const qualifiedName = `${className}.${methodName}`;
          const isStatic = hasModifier(member, ts.SyntaxKind.StaticKeyword);

          let accessibility: "public" | "protected" | "private" | null = null;
          if (hasModifier(member, ts.SyntaxKind.PublicKeyword)) accessibility = "public";
          else if (hasModifier(member, ts.SyntaxKind.ProtectedKeyword)) accessibility = "protected";
          else if (hasModifier(member, ts.SyntaxKind.PrivateKeyword)) accessibility = "private";

          const funcIR = processFunctionLike(
            member,
            methodName,
            qualifiedName,
            exported,
            isStatic,
            accessibility
          );
          functions.push(funcIR);
          methodNames.push(methodName);

          enclosingFunctionStack.push(qualifiedName);
          ts.forEachChild(member, visit);
          enclosingFunctionStack.pop();
        } else if (ts.isConstructorDeclaration(member)) {
          const params = member.parameters.map((p) => getParameterIR(p, sourceFile));
          const signature = buildSignature("constructor", params, null);
          const funcIR: FunctionIR = {
            kind: "function",
            name: "constructor",
            qualifiedName: `${className}.constructor`,
            signature,
            parameters: params,
            returnType: null,
            isExported: exported,
            isAsync: false,
            location: getLocation(member, sourceFile),
          };
          functions.push(funcIR);
          methodNames.push("constructor");

          enclosingFunctionStack.push(`${className}.constructor`);
          ts.forEachChild(member, visit);
          enclosingFunctionStack.pop();
        }
      }

      if (exported) {
        exports.push({
          kind: "export",
          name: className,
          localName: null,
          isDefault: hasModifier(node, ts.SyntaxKind.DefaultKeyword),
          fromModule: null,
          location: getLocation(node, sourceFile),
        });
      }

      classes.push({
        kind: "class",
        name: className,
        superClass,
        implements: implementsList,
        isExported: exported,
        isAbstract,
        methods: methodNames,
        location: getLocation(node, sourceFile),
      });

      return;
    }

    // Call expressions
    if (ts.isCallExpression(node)) {
      visitCallExpression(node);
      // Continue visiting children (args may contain more calls)
      ts.forEachChild(node, visit);
      return;
    }

    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sourceFile, visit);

  return { functions, calls, imports, exports, classes };
}
