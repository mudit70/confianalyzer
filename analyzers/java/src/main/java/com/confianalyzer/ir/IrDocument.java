package com.confianalyzer.ir;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class IrDocument {
    @JsonProperty("$schema")
    private String schema = "confianalyzer-ir-v1";

    @JsonProperty("version")
    private String version;

    @JsonProperty("generatedAt")
    private String generatedAt;

    @JsonProperty("analyzer")
    private AnalyzerMeta analyzer;

    @JsonProperty("repository")
    private RepositoryMeta repository;

    @JsonProperty("files")
    private List<FileIR> files;

    public IrDocument() {}

    public String getSchema() { return schema; }
    public void setSchema(String schema) { this.schema = schema; }
    public String getVersion() { return version; }
    public void setVersion(String version) { this.version = version; }
    public String getGeneratedAt() { return generatedAt; }
    public void setGeneratedAt(String generatedAt) { this.generatedAt = generatedAt; }
    public AnalyzerMeta getAnalyzer() { return analyzer; }
    public void setAnalyzer(AnalyzerMeta analyzer) { this.analyzer = analyzer; }
    public RepositoryMeta getRepository() { return repository; }
    public void setRepository(RepositoryMeta repository) { this.repository = repository; }
    public List<FileIR> getFiles() { return files; }
    public void setFiles(List<FileIR> files) { this.files = files; }
}
