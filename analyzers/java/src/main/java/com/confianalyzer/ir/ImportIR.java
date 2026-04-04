package com.confianalyzer.ir;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class ImportIR {
    @JsonProperty("kind")
    private final String kind = "import";

    @JsonProperty("modulePath")
    private String modulePath;

    @JsonProperty("resolvedPath")
    private String resolvedPath;

    @JsonProperty("isExternal")
    private boolean isExternal;

    @JsonProperty("symbols")
    private List<ImportedSymbolIR> symbols;

    @JsonProperty("defaultImport")
    private String defaultImport;

    @JsonProperty("namespaceImport")
    private String namespaceImport;

    @JsonProperty("location")
    private SourceLocation location;

    public ImportIR() {}

    public String getKind() { return kind; }
    public String getModulePath() { return modulePath; }
    public void setModulePath(String modulePath) { this.modulePath = modulePath; }
    public String getResolvedPath() { return resolvedPath; }
    public void setResolvedPath(String resolvedPath) { this.resolvedPath = resolvedPath; }
    public boolean isExternal() { return isExternal; }
    public void setExternal(boolean external) { isExternal = external; }
    public List<ImportedSymbolIR> getSymbols() { return symbols; }
    public void setSymbols(List<ImportedSymbolIR> symbols) { this.symbols = symbols; }
    public String getDefaultImport() { return defaultImport; }
    public void setDefaultImport(String defaultImport) { this.defaultImport = defaultImport; }
    public String getNamespaceImport() { return namespaceImport; }
    public void setNamespaceImport(String namespaceImport) { this.namespaceImport = namespaceImport; }
    public SourceLocation getLocation() { return location; }
    public void setLocation(SourceLocation location) { this.location = location; }
}
