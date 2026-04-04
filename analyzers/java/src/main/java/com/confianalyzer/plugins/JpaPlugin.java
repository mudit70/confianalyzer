package com.confianalyzer.plugins;

import com.confianalyzer.ir.*;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.expr.MethodCallExpr;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Detects JPA / Spring Data operations:
 * - entityManager.find(), persist(), remove(), merge(), createQuery()
 * - repository.findById(), save(), delete(), findAll()
 */
public class JpaPlugin implements PluginRegistry.FrameworkPlugin {

    private static final Map<String, String> ENTITY_MANAGER_OPS = Map.of(
            "find", "read",
            "persist", "write",
            "merge", "write",
            "remove", "delete",
            "createQuery", "read",
            "createNamedQuery", "read",
            "createNativeQuery", "read",
            "getReference", "read"
    );

    private static final Map<String, String> REPOSITORY_OPS = Map.of(
            "findById", "read",
            "findAll", "read",
            "findAllById", "read",
            "save", "write",
            "saveAll", "write",
            "delete", "delete",
            "deleteById", "delete",
            "deleteAll", "delete",
            "count", "read",
            "existsById", "read"
    );

    private static final Set<String> EM_RECEIVERS = Set.of(
            "entityManager", "em", "EntityManager"
    );

    private static final Set<String> REPO_SUFFIXES = Set.of(
            "Repository", "Repo", "repository", "repo"
    );

    @Override
    public void enrichFunction(FunctionIR fn, MethodDeclaration node, String className) {
        // JPA plugin doesn't enrich functions directly
    }

    @Override
    public void enrichCall(CallIR call, MethodCallExpr node, String enclosingFunction) {
        String receiver = call.getReceiver();
        String method = call.getMethod();

        if (receiver == null || method == null) return;

        // Check EntityManager calls
        if (EM_RECEIVERS.contains(receiver) && ENTITY_MANAGER_OPS.containsKey(method)) {
            String operation = ENTITY_MANAGER_OPS.get(method);
            applyDbEnrichment(call, "EntityManager", operation);
            return;
        }

        // Check Repository calls
        boolean isRepo = REPO_SUFFIXES.stream().anyMatch(receiver::endsWith);
        if (isRepo && REPOSITORY_OPS.containsKey(method)) {
            String operation = REPOSITORY_OPS.get(method);
            applyDbEnrichment(call, receiver, operation);
        }
    }

    private void applyDbEnrichment(CallIR call, String table, String operation) {
        Enrichment enrichment = new Enrichment();
        enrichment.setPluginName("jpa");
        enrichment.setDbOperation(new DbOperationInfo(table, operation));
        enrichment.setSuggestedCategory("DB_OPERATION");

        List<Enrichment> enrichments = call.getEnrichments();
        if (enrichments == null) {
            enrichments = new ArrayList<>();
        }
        enrichments.add(enrichment);
        call.setEnrichments(enrichments);
    }
}
