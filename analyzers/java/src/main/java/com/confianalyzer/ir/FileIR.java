package com.confianalyzer.ir;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.ArrayList;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class FileIR {
    @JsonProperty("path")
    private String path;

    @JsonProperty("relativePath")
    private String relativePath;

    @JsonProperty("language")
    private String language;

    @JsonProperty("size")
    private long size;

    @JsonProperty("hash")
    private String hash;

    @JsonProperty("functions")
    private List<FunctionIR> functions = new ArrayList<>();

    @JsonProperty("calls")
    private List<CallIR> calls = new ArrayList<>();

    @JsonProperty("imports")
    private List<ImportIR> imports = new ArrayList<>();

    @JsonProperty("exports")
    private List<ExportIR> exports = new ArrayList<>();

    @JsonProperty("classes")
    private List<ClassIR> classes = new ArrayList<>();

    @JsonProperty("enrichments")
    private List<FileEnrichment> enrichments;

    public FileIR() {}

    public String getPath() { return path; }
    public void setPath(String path) { this.path = path; }
    public String getRelativePath() { return relativePath; }
    public void setRelativePath(String relativePath) { this.relativePath = relativePath; }
    public String getLanguage() { return language; }
    public void setLanguage(String language) { this.language = language; }
    public long getSize() { return size; }
    public void setSize(long size) { this.size = size; }
    public String getHash() { return hash; }
    public void setHash(String hash) { this.hash = hash; }
    public List<FunctionIR> getFunctions() { return functions; }
    public void setFunctions(List<FunctionIR> functions) { this.functions = functions; }
    public List<CallIR> getCalls() { return calls; }
    public void setCalls(List<CallIR> calls) { this.calls = calls; }
    public List<ImportIR> getImports() { return imports; }
    public void setImports(List<ImportIR> imports) { this.imports = imports; }
    public List<ExportIR> getExports() { return exports; }
    public void setExports(List<ExportIR> exports) { this.exports = exports; }
    public List<ClassIR> getClasses() { return classes; }
    public void setClasses(List<ClassIR> classes) { this.classes = classes; }
    public List<FileEnrichment> getEnrichments() { return enrichments; }
    public void setEnrichments(List<FileEnrichment> enrichments) { this.enrichments = enrichments; }
}
