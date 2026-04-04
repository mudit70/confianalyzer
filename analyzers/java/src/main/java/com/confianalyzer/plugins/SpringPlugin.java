package com.confianalyzer.plugins;

import com.confianalyzer.ir.*;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.nodeTypes.NodeWithAnnotations;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Detects Spring MVC/WebFlux annotations:
 * - @GetMapping, @PostMapping, @PutMapping, @DeleteMapping, @PatchMapping
 * - @RequestMapping with method parameter
 */
public class SpringPlugin implements PluginRegistry.FrameworkPlugin {

    private static final Map<String, String> MAPPING_ANNOTATIONS = Map.of(
            "GetMapping", "GET",
            "PostMapping", "POST",
            "PutMapping", "PUT",
            "DeleteMapping", "DELETE",
            "PatchMapping", "PATCH"
    );

    @Override
    public void enrichFunction(FunctionIR fn, MethodDeclaration node, String className) {
        // Check shortcut annotations
        for (Map.Entry<String, String> entry : MAPPING_ANNOTATIONS.entrySet()) {
            Optional<AnnotationExpr> ann = node.getAnnotationByName(entry.getKey());
            if (ann.isPresent()) {
                String path = extractPath(ann.get());
                String method = entry.getValue();
                applyEndpoint(fn, method, path);
                return;
            }
        }

        // Check @RequestMapping
        Optional<AnnotationExpr> requestMapping = node.getAnnotationByName("RequestMapping");
        if (requestMapping.isPresent()) {
            AnnotationExpr ann = requestMapping.get();
            String path = extractPath(ann);
            String method = extractRequestMethod(ann);
            applyEndpoint(fn, method, path);
        }
    }

    @Override
    public void enrichCall(CallIR call, MethodCallExpr node, String enclosingFunction) {
        // Spring plugin doesn't enrich calls
    }

    private void applyEndpoint(FunctionIR fn, String method, String path) {
        EndpointInfo endpoint = new EndpointInfo(method, path);
        fn.setEndpointInfo(endpoint);

        Enrichment enrichment = new Enrichment();
        enrichment.setPluginName("spring");
        enrichment.setRoute(new RouteInfo(method, path));
        enrichment.setSuggestedCategory("API_ENDPOINT");

        List<Enrichment> enrichments = fn.getEnrichments();
        if (enrichments == null) {
            enrichments = new ArrayList<>();
        }
        enrichments.add(enrichment);
        fn.setEnrichments(enrichments);
    }

    private String extractPath(AnnotationExpr ann) {
        if (ann instanceof SingleMemberAnnotationExpr) {
            Expression value = ((SingleMemberAnnotationExpr) ann).getMemberValue();
            return extractStringValue(value);
        } else if (ann instanceof NormalAnnotationExpr) {
            NormalAnnotationExpr normal = (NormalAnnotationExpr) ann;
            for (MemberValuePair pair : normal.getPairs()) {
                String name = pair.getNameAsString();
                if ("value".equals(name) || "path".equals(name)) {
                    return extractStringValue(pair.getValue());
                }
            }
        }
        // MarkerAnnotation has no value, path is "/"
        return "/";
    }

    private String extractRequestMethod(AnnotationExpr ann) {
        if (ann instanceof NormalAnnotationExpr) {
            NormalAnnotationExpr normal = (NormalAnnotationExpr) ann;
            for (MemberValuePair pair : normal.getPairs()) {
                if ("method".equals(pair.getNameAsString())) {
                    String val = pair.getValue().toString();
                    // Handle RequestMethod.GET, RequestMethod.POST, etc.
                    if (val.contains(".")) {
                        return val.substring(val.lastIndexOf('.') + 1);
                    }
                    return val;
                }
            }
        }
        return "GET"; // Default for @RequestMapping without method
    }

    private String extractStringValue(Expression expr) {
        if (expr instanceof StringLiteralExpr) {
            return ((StringLiteralExpr) expr).asString();
        }
        return expr.toString();
    }
}
