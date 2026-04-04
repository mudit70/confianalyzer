package com.confianalyzer.ir;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class ParameterIR {
    @JsonProperty("name")
    private String name;

    @JsonProperty("typeAnnotation")
    private String typeAnnotation;

    @JsonProperty("hasDefault")
    private boolean hasDefault;

    @JsonProperty("isRest")
    private boolean isRest;

    public ParameterIR() {}

    public ParameterIR(String name, String typeAnnotation, boolean hasDefault, boolean isRest) {
        this.name = name;
        this.typeAnnotation = typeAnnotation;
        this.hasDefault = hasDefault;
        this.isRest = isRest;
    }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getTypeAnnotation() { return typeAnnotation; }
    public void setTypeAnnotation(String typeAnnotation) { this.typeAnnotation = typeAnnotation; }
    public boolean isHasDefault() { return hasDefault; }
    public void setHasDefault(boolean hasDefault) { this.hasDefault = hasDefault; }
    public boolean isRest() { return isRest; }
    public void setRest(boolean rest) { isRest = rest; }
}
