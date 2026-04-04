import * as path from "node:path";
import type { IrDocument, FileIR, ResolvedCall } from "./types.js";

/**
 * Generate a stable function ID from repo name, file path, and function name.
 */
export function makeFunctionId(repoName: string, filePath: string, functionName: string): string {
  return `${repoName}::${filePath}::${functionName}`;
}

/**
 * Resolve a module path relative to the importing file.
 * Handles relative paths (./foo, ../bar) by resolving against the importer's directory.
 */
function resolveModulePath(importerPath: string, modulePath: string): string | null {
  if (modulePath.startsWith(".")) {
    const dir = path.dirname(importerPath);
    let resolved = path.join(dir, modulePath);
    // Normalize and remove potential extensions for matching
    resolved = resolved.replace(/\\/g, "/");
    return resolved;
  }
  return null;
}

/**
 * Try to match a resolved/module path to a file in the file index.
 * Handles cases where the import might omit extensions (.ts, .js, etc.) or /index.
 * Also handles absolute paths by stripping the repo rootPath prefix.
 */
function findFileByPath(fileIndex: Map<string, FileIR>, targetPath: string, rootPath?: string): FileIR | undefined {
  // Collect candidate paths: the original targetPath plus a root-stripped version
  const candidates: string[] = [targetPath];

  if (rootPath && targetPath.startsWith(rootPath)) {
    let stripped = targetPath.slice(rootPath.length);
    // Remove leading slash after stripping
    if (stripped.startsWith("/")) {
      stripped = stripped.slice(1);
    }
    candidates.push(stripped);
  }

  for (const candidate of candidates) {
    // Direct match
    if (fileIndex.has(candidate)) {
      return fileIndex.get(candidate);
    }

    // Try common extensions
    const extensions = [".ts", ".tsx", ".js", ".jsx", ".py", ".go"];
    for (const ext of extensions) {
      if (fileIndex.has(candidate + ext)) {
        return fileIndex.get(candidate + ext);
      }
    }

    // Try /index with extensions
    for (const ext of extensions) {
      const indexPath = candidate + "/index" + ext;
      if (fileIndex.has(indexPath)) {
        return fileIndex.get(indexPath);
      }
    }
  }

  return undefined;
}

/**
 * Step 3: Cross-file resolution.
 * For each repo, match imports to exports and build CALLS edges between functions.
 */
export function resolveCrossFileConnections(irDocuments: Map<string, IrDocument>): ResolvedCall[] {
  const resolvedCalls: ResolvedCall[] = [];

  for (const [repoName, doc] of irDocuments) {
    const rootPath = doc.repository.rootPath;

    // Build file index: index by BOTH relativePath and absolute path
    const fileIndex = new Map<string, FileIR>();
    for (const file of doc.files) {
      fileIndex.set(file.relativePath, file);
      if (file.path && file.path !== file.relativePath) {
        fileIndex.set(file.path, file);
      }
    }

    // Build export index: resolvedKey -> functionId
    // Key format: "relativePath::exportName"
    const exportIndex = new Map<string, string>();
    for (const file of doc.files) {
      for (const exp of file.exports) {
        // Find the function that matches this export
        const localName = exp.localName ?? exp.name;
        const func = file.functions.find((f) => f.name === localName);
        if (func) {
          const funcId = makeFunctionId(repoName, file.relativePath, func.name);
          exportIndex.set(`${file.relativePath}::${exp.name}`, funcId);
          if (exp.isDefault) {
            exportIndex.set(`${file.relativePath}::default`, funcId);
          }
        }
      }
    }

    // For each file, resolve imports and match calls
    for (const file of doc.files) {
      // Build import bindings: local symbol name -> target functionId
      const importBindings = new Map<string, string>();

      for (const imp of file.imports) {
        if (imp.isExternal) continue;

        // Resolve target file path
        let targetPath = imp.resolvedPath;
        if (!targetPath) {
          targetPath = resolveModulePath(file.relativePath, imp.modulePath);
        }
        if (!targetPath) continue;

        const targetFile = findFileByPath(fileIndex, targetPath, rootPath);
        if (!targetFile) continue;

        const targetRelPath = targetFile.relativePath;

        // Named imports
        for (const sym of imp.symbols) {
          const localName = sym.alias ?? sym.name;
          const exportKey = `${targetRelPath}::${sym.name}`;
          const funcId = exportIndex.get(exportKey);
          if (funcId) {
            importBindings.set(localName, funcId);
          }
        }

        // Default import
        if (imp.defaultImport) {
          const defaultKey = `${targetRelPath}::default`;
          const funcId = exportIndex.get(defaultKey);
          if (funcId) {
            importBindings.set(imp.defaultImport, funcId);
          }
        }

        // Namespace import
        if (imp.namespaceImport) {
          // Store namespace as a prefix marker; we resolve member access at call time
          // Store all exports of target file under "namespace.exportName"
          for (const exp of targetFile.exports) {
            const exportKey = `${targetRelPath}::${exp.name}`;
            const funcId = exportIndex.get(exportKey);
            if (funcId) {
              importBindings.set(`${imp.namespaceImport}.${exp.name}`, funcId);
            }
          }
        }
      }

      // Resolve calls
      for (const call of file.calls) {
        if (!call.enclosingFunction) continue;

        const callerId = makeFunctionId(repoName, file.relativePath, call.enclosingFunction);
        let targetId: string | undefined;

        // Case 1: Direct call matching an imported symbol
        targetId = importBindings.get(call.callee);

        // Case 2: receiver.method → namespace import
        if (!targetId && call.receiver && call.method) {
          targetId = importBindings.get(`${call.receiver}.${call.method}`);
        }

        // Case 3: callee contains a dot (e.g. "utils.helper")
        if (!targetId && call.callee.includes(".")) {
          targetId = importBindings.get(call.callee);
        }

        if (targetId && callerId !== targetId) {
          resolvedCalls.push({
            callerId,
            targetId,
            callSite: call.location.startLine,
          });
        }
      }
    }
  }

  return resolvedCalls;
}
