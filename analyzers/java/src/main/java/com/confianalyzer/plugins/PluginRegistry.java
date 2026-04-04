package com.confianalyzer.plugins;

import com.confianalyzer.ir.CallIR;
import com.confianalyzer.ir.FunctionIR;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.expr.MethodCallExpr;

import java.util.ArrayList;
import java.util.List;

/**
 * Registry of framework detection plugins. Each plugin can enrich
 * FunctionIR and CallIR nodes with framework-specific metadata.
 */
public class PluginRegistry {

    /**
     * Plugin interface for framework detection.
     */
    public interface FrameworkPlugin {
        void enrichFunction(FunctionIR fn, MethodDeclaration node, String className);
        void enrichCall(CallIR call, MethodCallExpr node, String enclosingFunction);
    }

    private final List<FrameworkPlugin> plugins = new ArrayList<>();

    public PluginRegistry() {
        // Register all built-in plugins
        plugins.add(new SpringPlugin());
        plugins.add(new JaxRsPlugin());
        plugins.add(new JpaPlugin());
    }

    public void enrichFunction(FunctionIR fn, MethodDeclaration node, String className) {
        for (FrameworkPlugin plugin : plugins) {
            plugin.enrichFunction(fn, node, className);
        }
    }

    public void enrichCall(CallIR call, MethodCallExpr node, String enclosingFunction) {
        for (FrameworkPlugin plugin : plugins) {
            plugin.enrichCall(call, node, enclosingFunction);
        }
    }
}
