package com.confianalyzer.ir;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class ImportedSymbolIR {
    @JsonProperty("name")
    private String name;

    @JsonProperty("alias")
    private String alias;

    public ImportedSymbolIR() {}

    public ImportedSymbolIR(String name, String alias) {
        this.name = name;
        this.alias = alias;
    }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getAlias() { return alias; }
    public void setAlias(String alias) { this.alias = alias; }
}
