package com.confianalyzer;

import com.confianalyzer.ir.*;
import com.confianalyzer.plugins.PluginRegistry;
import com.github.javaparser.JavaParser;
import com.github.javaparser.ParseResult;
import com.github.javaparser.ast.CompilationUnit;

import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * Main analyzer that walks a repository directory, parses Java files,
 * and produces an IrDocument.
 */
public class Analyzer {

    private static final String ANALYZER_NAME = "confianalyzer-java";
    private static final String ANALYZER_VERSION = "0.1.0";
    private static final String LANGUAGE = "java";

    private static final Set<String> SKIP_DIRS = Set.of(
            "target", "build", "test", ".gradle", ".idea", ".git", "node_modules", ".mvn"
    );

    private final boolean verbose;
    private final PluginRegistry pluginRegistry;

    public Analyzer(boolean verbose) {
        this.verbose = verbose;
        this.pluginRegistry = new PluginRegistry();
    }

    /**
     * Analyze an entire repository and return the IR document.
     */
    public IrDocument analyze(String repoPath, String repoName) throws IOException {
        Path root = Paths.get(repoPath).toAbsolutePath().normalize();

        List<Path> javaFiles = findJavaFiles(root);
        if (verbose) {
            System.err.println("Found " + javaFiles.size() + " Java files");
        }

        List<FileIR> fileIRs = new ArrayList<>();
        int errors = 0;

        JavaParser parser = new JavaParser();

        for (Path file : javaFiles) {
            try {
                FileIR fileIR = analyzeFile(parser, file, root);
                if (fileIR != null) {
                    fileIRs.add(fileIR);
                }
            } catch (Exception e) {
                errors++;
                if (verbose) {
                    System.err.println("Error parsing " + file + ": " + e.getMessage());
                }
            }
        }

        IrDocument doc = new IrDocument();
        doc.setSchema("confianalyzer-ir-v1");
        doc.setVersion("1.0.0");
        doc.setGeneratedAt(Instant.now().toString());
        doc.setAnalyzer(new AnalyzerMeta(ANALYZER_NAME, ANALYZER_VERSION, LANGUAGE));
        doc.setRepository(new RepositoryMeta(repoName, root.toString()));
        doc.setFiles(fileIRs);

        if (verbose) {
            System.err.println("Analyzed " + fileIRs.size() + " files, " + errors + " errors");
        }

        return doc;
    }

    /**
     * Analyze a single file from source code string (for testing).
     */
    public FileIR analyzeSource(String source, String fileName) {
        JavaParser parser = new JavaParser();
        ParseResult<CompilationUnit> result = parser.parse(source);

        if (!result.isSuccessful() || result.getResult().isEmpty()) {
            return null;
        }

        CompilationUnit cu = result.getResult().get();
        AstWalker walker = new AstWalker(pluginRegistry);
        walker.walk(cu);

        FileIR fileIR = new FileIR();
        fileIR.setPath(fileName);
        fileIR.setRelativePath(fileName);
        fileIR.setLanguage(LANGUAGE);
        fileIR.setSize(source.length());
        fileIR.setHash(computeHash(source.getBytes()));
        fileIR.setFunctions(walker.getFunctions());
        fileIR.setCalls(walker.getCalls());
        fileIR.setImports(walker.getImports());
        fileIR.setExports(walker.getExports());
        fileIR.setClasses(walker.getClasses());

        return fileIR;
    }

    private FileIR analyzeFile(JavaParser parser, Path file, Path root) throws IOException {
        byte[] content = Files.readAllBytes(file);
        String source = new String(content);

        ParseResult<CompilationUnit> result = parser.parse(source);
        if (!result.isSuccessful() || result.getResult().isEmpty()) {
            if (verbose) {
                System.err.println("Parse failed for: " + file);
            }
            return null;
        }

        CompilationUnit cu = result.getResult().get();
        AstWalker walker = new AstWalker(pluginRegistry);
        walker.walk(cu);

        FileIR fileIR = new FileIR();
        fileIR.setPath(file.toString());
        fileIR.setRelativePath(root.relativize(file).toString());
        fileIR.setLanguage(LANGUAGE);
        fileIR.setSize(content.length);
        fileIR.setHash(computeHash(content));
        fileIR.setFunctions(walker.getFunctions());
        fileIR.setCalls(walker.getCalls());
        fileIR.setImports(walker.getImports());
        fileIR.setExports(walker.getExports());
        fileIR.setClasses(walker.getClasses());

        return fileIR;
    }

    private List<Path> findJavaFiles(Path root) throws IOException {
        List<Path> files = new ArrayList<>();

        if (!Files.isDirectory(root)) {
            return files;
        }

        Files.walkFileTree(root, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
                String dirName = dir.getFileName().toString();
                if (SKIP_DIRS.contains(dirName)) {
                    return FileVisitResult.SKIP_SUBTREE;
                }
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                if (file.toString().endsWith(".java")) {
                    files.add(file);
                }
                return FileVisitResult.CONTINUE;
            }
        });

        return files;
    }

    static String computeHash(byte[] content) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(content);
            StringBuilder hex = new StringBuilder();
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 not available", e);
        }
    }
}
