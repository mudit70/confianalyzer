import ts from "typescript";
import type { FrameworkPlugin, FunctionAnalysisResult } from "./index.js";
import type { FunctionIR, CallIR } from "../types.js";

function collectJsxElements(node: ts.Node, sourceFile: ts.SourceFile): string[] {
  const renders: string[] = [];

  function walk(n: ts.Node): void {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tagName = n.tagName.getText(sourceFile);
      // Only collect PascalCase names (user components, not html elements)
      if (tagName[0] && tagName[0] === tagName[0].toUpperCase() && /^[A-Z]/.test(tagName)) {
        if (!renders.includes(tagName)) {
          renders.push(tagName);
        }
      }
    }
    ts.forEachChild(n, walk);
  }

  walk(node);
  return renders;
}

export function createReactPlugin(): FrameworkPlugin {
  return {
    name: "react",

    analyzeFunction(
      func: FunctionIR,
      node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | ts.FunctionExpression,
      sourceFile: ts.SourceFile,
      _calls: CallIR[]
    ): FunctionAnalysisResult | null {
      const renders = collectJsxElements(node, sourceFile);
      if (renders.length === 0) return null;

      return {
        enrichment: {
          pluginName: "react",
          route: null,
          dbOperation: null,
          httpCall: null,
          renders,
          middlewareOrder: null,
          suggestedCategory: "UI_INTERACTION",
        },
      };
    },
  };
}
