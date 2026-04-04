package com.confianalyzer.plugins;

import com.confianalyzer.ir.*;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.expr.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * Detects JAX-RS annotations:
 * - @GET, @POST, @PUT, @DELETE + @Path
 * - Class-level @Path as prefix
 */
public class JaxRsPlugin implements PluginRegistry.FrameworkPlugin {

    private static final Set<String> HTTP_METHODS = Set.of("GET", "POST", "PUT", "DELETE", "PATCH");

    @Override
    public void enrichFunction(FunctionIR fn, MethodDeclaration node, String className) {
        String httpMethod = null;
        for (String method : HTTP_METHODS) {
            if (node.getAnnotationByName(method).isPresent()) {
                httpMethod = method;
                break;
            }
        }

        if (httpMethod == null) {
            return;
        }

        // Get path from method-level @Path
        String methodPath = "";
        Optional<AnnotationExpr> pathAnn = node.getAnnotationByName("Path");
        if (pathAnn.isPresent()) {
            methodPath = extractPathValue(pathAnn.get());
        }

        // Get class-level @Path
        String classPath = "";
        if (node.getParentNode().isPresent()
                && node.getParentNode().get() instanceof com.github.javaparser.ast.body.ClassOrInterfaceDeclaration) {
            com.github.javaparser.ast.body.ClassOrInterfaceDeclaration classDecl =
                    (com.github.javaparser.ast.body.ClassOrInterfaceDeclaration) node.getParentNode().get();
            Optional<AnnotationExpr> classPathAnn = classDecl.getAnnotationByName("Path");
            if (classPathAnn.isPresent()) {
                classPath = extractPathValue(classPathAnn.get());
            }
        }

        String fullPath = classPath + methodPath;
        if (fullPath.isEmpty()) {
            fullPath = "/";
        }

        EndpointInfo endpoint = new EndpointInfo(httpMethod, fullPath);
        fn.setEndpointInfo(endpoint);

        Enrichment enrichment = new Enrichment();
        enrichment.setPluginName("jax-rs");
        enrichment.setRoute(new RouteInfo(httpMethod, fullPath));
        enrichment.setSuggestedCategory("API_ENDPOINT");

        List<Enrichment> enrichments = fn.getEnrichments();
        if (enrichments == null) {
            enrichments = new ArrayList<>();
        }
        enrichments.add(enrichment);
        fn.setEnrichments(enrichments);
    }

    @Override
    public void enrichCall(CallIR call, MethodCallExpr node, String enclosingFunction) {
        // JAX-RS plugin doesn't enrich calls
    }

    private String extractPathValue(AnnotationExpr ann) {
        if (ann instanceof SingleMemberAnnotationExpr) {
            Expression value = ((SingleMemberAnnotationExpr) ann).getMemberValue();
            if (value instanceof StringLiteralExpr) {
                return ((StringLiteralExpr) value).asString();
            }
            return value.toString();
        } else if (ann instanceof NormalAnnotationExpr) {
            for (MemberValuePair pair : ((NormalAnnotationExpr) ann).getPairs()) {
                if ("value".equals(pair.getNameAsString())) {
                    Expression value = pair.getValue();
                    if (value instanceof StringLiteralExpr) {
                        return ((StringLiteralExpr) value).asString();
                    }
                    return value.toString();
                }
            }
        }
        return "";
    }
}
