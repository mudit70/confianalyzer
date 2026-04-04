package com.confianalyzer.ir;

import com.fasterxml.jackson.annotation.JsonProperty;

public class AnalyzerMeta {
    @JsonProperty("name")
    private String name;

    @JsonProperty("version")
    private String version;

    @JsonProperty("language")
    private String language;

    public AnalyzerMeta() {}

    public AnalyzerMeta(String name, String version, String language) {
        this.name = name;
        this.version = version;
        this.language = language;
    }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getVersion() { return version; }
    public void setVersion(String version) { this.version = version; }
    public String getLanguage() { return language; }
    public void setLanguage(String language) { this.language = language; }
}
