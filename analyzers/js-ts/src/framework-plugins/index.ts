import ts from "typescript";
import type { CallIR, FunctionIR, Enrichment, EndpointInfo } from "../types.js";
import { createExpressPlugin } from "./express.js";
import { createReactPlugin } from "./react.js";
import { createAxiosPlugin } from "./axios.js";

export interface FunctionAnalysisResult {
  endpointInfo?: EndpointInfo;
  enrichment?: Enrichment;
}

export interface FrameworkPlugin {
  name: string;

  /** Analyze a call expression for framework-specific patterns */
  analyzeCall?(
    call: CallIR,
    node: ts.CallExpression,
    sourceFile: ts.SourceFile
  ): Enrichment | null;

  /** Analyze a function for framework-specific patterns (e.g., JSX renders) */
  analyzeFunction?(
    func: FunctionIR,
    node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | ts.FunctionExpression,
    sourceFile: ts.SourceFile,
    calls: CallIR[]
  ): FunctionAnalysisResult | null;
}

export function createDefaultPlugins(): FrameworkPlugin[] {
  return [createExpressPlugin(), createReactPlugin(), createAxiosPlugin()];
}
