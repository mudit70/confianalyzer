package com.confianalyzer;

import com.confianalyzer.ir.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class AnalyzerTest {

    private Analyzer analyzer;

    @BeforeEach
    void setUp() {
        analyzer = new Analyzer(false);
    }

    @Test
    void testFunctionExtraction() {
        String source = """
                package com.example;

                public class MyService {
                    public String greet(String name) {
                        return "Hello " + name;
                    }

                    private int compute(int a, int b) {
                        return a + b;
                    }

                    protected static void reset() {
                    }
                }
                """;

        FileIR result = analyzer.analyzeSource(source, "MyService.java");
        assertNotNull(result);

        List<FunctionIR> functions = result.getFunctions();
        assertEquals(3, functions.size());

        // Public method
        FunctionIR greet = functions.stream()
                .filter(f -> f.getName().equals("greet")).findFirst().orElseThrow();
        assertEquals("MyService.greet", greet.getQualifiedName());
        assertEquals("public", greet.getAccessibility());
        assertTrue(greet.isExported());
        assertFalse(greet.isAsync());
        assertEquals("String", greet.getReturnType());
        assertEquals(1, greet.getParameters().size());
        assertEquals("name", greet.getParameters().get(0).getName());
        assertEquals("String", greet.getParameters().get(0).getTypeAnnotation());

        // Private method
        FunctionIR compute = functions.stream()
                .filter(f -> f.getName().equals("compute")).findFirst().orElseThrow();
        assertEquals("private", compute.getAccessibility());
        assertFalse(compute.isExported());
        assertEquals(2, compute.getParameters().size());

        // Protected static method
        FunctionIR reset = functions.stream()
                .filter(f -> f.getName().equals("reset")).findFirst().orElseThrow();
        assertEquals("protected", reset.getAccessibility());
        assertFalse(reset.isExported());
        assertTrue(reset.getIsStatic());
    }

    @Test
    void testClassExtraction() {
        String source = """
                package com.example;

                public abstract class Animal implements Serializable, Comparable<Animal> {
                    public void eat() {}
                    public abstract void speak();
                }

                class Dog extends Animal {
                    public void speak() {}
                    public void fetch() {}
                }
                """;

        FileIR result = analyzer.analyzeSource(source, "Animal.java");
        assertNotNull(result);

        List<ClassIR> classes = result.getClasses();
        assertEquals(2, classes.size());

        ClassIR animal = classes.stream()
                .filter(c -> c.getName().equals("Animal")).findFirst().orElseThrow();
        assertTrue(animal.isAbstract());
        assertTrue(animal.isExported());
        assertNull(animal.getSuperClass());
        assertEquals(List.of("Serializable", "Comparable"), animal.getImplementsList());
        assertEquals(List.of("eat", "speak"), animal.getMethods());

        ClassIR dog = classes.stream()
                .filter(c -> c.getName().equals("Dog")).findFirst().orElseThrow();
        assertFalse(dog.isAbstract());
        assertEquals("Animal", dog.getSuperClass());
        assertTrue(dog.getImplementsList().isEmpty());
        assertEquals(List.of("speak", "fetch"), dog.getMethods());
    }

    @Test
    void testImportExtraction() {
        String source = """
                package com.example;

                import java.util.List;
                import java.util.Map;
                import com.example.service.UserService;
                import static java.lang.Math.max;

                public class MyClass {}
                """;

        FileIR result = analyzer.analyzeSource(source, "MyClass.java");
        assertNotNull(result);

        List<ImportIR> imports = result.getImports();
        assertEquals(4, imports.size());

        ImportIR listImport = imports.stream()
                .filter(i -> i.getModulePath().equals("java.util.List")).findFirst().orElseThrow();
        assertTrue(listImport.isExternal());
        assertEquals(1, listImport.getSymbols().size());
        assertEquals("List", listImport.getSymbols().get(0).getName());

        ImportIR userImport = imports.stream()
                .filter(i -> i.getModulePath().contains("UserService")).findFirst().orElseThrow();
        // com.example is project code, but our heuristic considers it external
        // because the prefix doesn't match common project patterns
        assertEquals("UserService", userImport.getSymbols().get(0).getName());
    }

    @Test
    void testCallExtractionWithStringArgs() {
        String source = """
                package com.example;

                public class Caller {
                    public void doWork() {
                        service.findUser("admin");
                        logger.info("Starting process", taskName);
                        process();
                    }
                }
                """;

        FileIR result = analyzer.analyzeSource(source, "Caller.java");
        assertNotNull(result);

        List<CallIR> calls = result.getCalls();
        assertEquals(3, calls.size());

        CallIR findUser = calls.stream()
                .filter(c -> c.getMethod().equals("findUser")).findFirst().orElseThrow();
        assertEquals("service.findUser", findUser.getCallee());
        assertEquals("service", findUser.getReceiver());
        assertEquals(1, findUser.getArgumentCount());
        assertEquals(List.of("admin"), findUser.getStringArgs());
        assertEquals("Caller.doWork", findUser.getEnclosingFunction());

        CallIR logInfo = calls.stream()
                .filter(c -> c.getMethod().equals("info")).findFirst().orElseThrow();
        assertEquals(2, logInfo.getArgumentCount());
        assertEquals(List.of("Starting process"), logInfo.getStringArgs());
        assertEquals(List.of("taskName"), logInfo.getArgumentRefs());

        CallIR process = calls.stream()
                .filter(c -> c.getMethod().equals("process")).findFirst().orElseThrow();
        assertNull(process.getReceiver());
        assertEquals("process", process.getCallee());
    }

    @Test
    void testSpringGetMapping() {
        String source = """
                package com.example;

                import org.springframework.web.bind.annotation.GetMapping;
                import org.springframework.web.bind.annotation.RestController;

                @RestController
                public class UserController {
                    @GetMapping("/users")
                    public String getUsers() {
                        return "users";
                    }
                }
                """;

        FileIR result = analyzer.analyzeSource(source, "UserController.java");
        assertNotNull(result);

        FunctionIR getUsers = result.getFunctions().stream()
                .filter(f -> f.getName().equals("getUsers")).findFirst().orElseThrow();

        assertNotNull(getUsers.getEndpointInfo());
        assertEquals("GET", getUsers.getEndpointInfo().getMethod());
        assertEquals("/users", getUsers.getEndpointInfo().getPath());

        assertNotNull(getUsers.getEnrichments());
        assertEquals(1, getUsers.getEnrichments().size());
        assertEquals("spring", getUsers.getEnrichments().get(0).getPluginName());
        assertEquals("API_ENDPOINT", getUsers.getEnrichments().get(0).getSuggestedCategory());
    }

    @Test
    void testSpringRequestMapping() {
        String source = """
                package com.example;

                import org.springframework.web.bind.annotation.RequestMapping;
                import org.springframework.web.bind.annotation.RequestMethod;

                public class OrderController {
                    @RequestMapping(value = "/orders", method = RequestMethod.POST)
                    public String createOrder() {
                        return "created";
                    }
                }
                """;

        FileIR result = analyzer.analyzeSource(source, "OrderController.java");
        assertNotNull(result);

        FunctionIR createOrder = result.getFunctions().stream()
                .filter(f -> f.getName().equals("createOrder")).findFirst().orElseThrow();

        assertNotNull(createOrder.getEndpointInfo());
        assertEquals("POST", createOrder.getEndpointInfo().getMethod());
        assertEquals("/orders", createOrder.getEndpointInfo().getPath());
    }

    @Test
    void testFullIrDocumentStructure(@TempDir Path tempDir) throws IOException {
        Path srcDir = tempDir.resolve("src/main/java/com/example");
        Files.createDirectories(srcDir);

        String source = """
                package com.example;

                import java.util.List;

                public class HelloService {
                    public String hello(String name) {
                        System.out.println("Hello");
                        return "Hello " + name;
                    }
                }
                """;

        Files.writeString(srcDir.resolve("HelloService.java"), source);

        IrDocument doc = analyzer.analyze(tempDir.toString(), "test-repo");

        assertNotNull(doc);
        assertEquals("confianalyzer-ir-v1", doc.getSchema());
        assertEquals("1.0.0", doc.getVersion());
        assertNotNull(doc.getGeneratedAt());
        assertEquals("confianalyzer-java", doc.getAnalyzer().getName());
        assertEquals("java", doc.getAnalyzer().getLanguage());
        assertEquals("test-repo", doc.getRepository().getName());

        assertEquals(1, doc.getFiles().size());
        FileIR file = doc.getFiles().get(0);
        assertEquals("java", file.getLanguage());
        assertTrue(file.getRelativePath().endsWith("HelloService.java"));
        assertTrue(file.getSize() > 0);
        assertNotNull(file.getHash());
        assertEquals(64, file.getHash().length()); // SHA-256 hex

        assertEquals(1, file.getFunctions().size());
        assertEquals("hello", file.getFunctions().get(0).getName());
        assertEquals("function", file.getFunctions().get(0).getKind());

        assertTrue(file.getCalls().size() > 0);
        assertEquals(1, file.getImports().size());
        assertEquals("import", file.getImports().get(0).getKind());

        // Public class and method should be exported
        assertTrue(file.getExports().size() >= 2);
        assertEquals(1, file.getClasses().size());
        assertEquals("class", file.getClasses().get(0).getKind());
    }
}
