package com.confianalyzer.ir;

import com.fasterxml.jackson.annotation.JsonProperty;

public class RepositoryMeta {
    @JsonProperty("name")
    private String name;

    @JsonProperty("rootPath")
    private String rootPath;

    public RepositoryMeta() {}

    public RepositoryMeta(String name, String rootPath) {
        this.name = name;
        this.rootPath = rootPath;
    }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getRootPath() { return rootPath; }
    public void setRootPath(String rootPath) { this.rootPath = rootPath; }
}
