package com.confianalyzer;

import com.confianalyzer.ir.IrDocument;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;

import java.io.File;
import java.io.IOException;

/**
 * CLI entry point for the Java analyzer.
 *
 * Usage:
 *   java -jar confianalyzer-analyze-java.jar \
 *     --repo /path/to/repo \
 *     --repo-name my-repo \
 *     --output /path/to/output/ir.json \
 *     [--verbose]
 *
 * Exit codes: 0=success, 1=partial, 2=failure, 3=config error
 */
public class Main {

    private static final int EXIT_SUCCESS = 0;
    private static final int EXIT_PARTIAL = 1;
    private static final int EXIT_FAILURE = 2;
    private static final int EXIT_CONFIG_ERROR = 3;

    public static void main(String[] args) {
        String repoPath = null;
        String repoName = null;
        String outputPath = null;
        boolean verbose = false;

        // Parse arguments
        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "--repo":
                    if (i + 1 < args.length) repoPath = args[++i];
                    break;
                case "--repo-name":
                    if (i + 1 < args.length) repoName = args[++i];
                    break;
                case "--output":
                    if (i + 1 < args.length) outputPath = args[++i];
                    break;
                case "--verbose":
                    verbose = true;
                    break;
                default:
                    System.err.println("Unknown argument: " + args[i]);
                    break;
            }
        }

        if (repoPath == null || repoName == null || outputPath == null) {
            System.err.println("Usage: java -jar confianalyzer-analyze-java.jar "
                    + "--repo <path> --repo-name <name> --output <path> [--verbose]");
            System.exit(EXIT_CONFIG_ERROR);
        }

        emitProgress("start", "Analyzing repository: " + repoName);

        try {
            Analyzer analyzer = new Analyzer(verbose);
            IrDocument doc = analyzer.analyze(repoPath, repoName);

            emitProgress("progress", "Analyzed " + doc.getFiles().size() + " files");

            ObjectMapper mapper = new ObjectMapper();
            mapper.enable(SerializationFeature.INDENT_OUTPUT);
            mapper.writeValue(new File(outputPath), doc);

            emitProgress("complete", "Output written to " + outputPath);

            if (verbose) {
                System.err.println("Analysis complete: " + doc.getFiles().size() + " files analyzed");
            }

            System.exit(EXIT_SUCCESS);
        } catch (IOException e) {
            System.err.println("ERROR: " + e.getMessage());
            emitProgress("error", e.getMessage());
            System.exit(EXIT_FAILURE);
        }
    }

    private static void emitProgress(String event, String message) {
        // JSON Lines progress on stdout
        System.out.println("{\"event\":\"" + escapeJson(event)
                + "\",\"message\":\"" + escapeJson(message) + "\"}");
    }

    private static String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }
}
