package com.confianalyzer.ir;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class FunctionIR {
    @JsonProperty("kind")
    private final String kind = "function";

    @JsonProperty("name")
    private String name;

    @JsonProperty("qualifiedName")
    private String qualifiedName;

    @JsonProperty("signature")
    private String signature;

    @JsonProperty("parameters")
    private List<ParameterIR> parameters;

    @JsonProperty("returnType")
    private String returnType;

    @JsonProperty("isExported")
    private boolean isExported;

    @JsonProperty("isAsync")
    private boolean isAsync;

    @JsonProperty("isStatic")
    private Boolean isStatic;

    @JsonProperty("accessibility")
    private String accessibility;

    @JsonProperty("location")
    private SourceLocation location;

    @JsonProperty("endpointInfo")
    private EndpointInfo endpointInfo;

    @JsonProperty("enrichments")
    private List<Enrichment> enrichments;

    public FunctionIR() {}

    public String getKind() { return kind; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getQualifiedName() { return qualifiedName; }
    public void setQualifiedName(String qualifiedName) { this.qualifiedName = qualifiedName; }
    public String getSignature() { return signature; }
    public void setSignature(String signature) { this.signature = signature; }
    public List<ParameterIR> getParameters() { return parameters; }
    public void setParameters(List<ParameterIR> parameters) { this.parameters = parameters; }
    public String getReturnType() { return returnType; }
    public void setReturnType(String returnType) { this.returnType = returnType; }
    public boolean isExported() { return isExported; }
    public void setExported(boolean exported) { isExported = exported; }
    public boolean isAsync() { return isAsync; }
    public void setAsync(boolean async) { isAsync = async; }
    public Boolean getIsStatic() { return isStatic; }
    public void setStatic(Boolean aStatic) { isStatic = aStatic; }
    public String getAccessibility() { return accessibility; }
    public void setAccessibility(String accessibility) { this.accessibility = accessibility; }
    public SourceLocation getLocation() { return location; }
    public void setLocation(SourceLocation location) { this.location = location; }
    public EndpointInfo getEndpointInfo() { return endpointInfo; }
    public void setEndpointInfo(EndpointInfo endpointInfo) { this.endpointInfo = endpointInfo; }
    public List<Enrichment> getEnrichments() { return enrichments; }
    public void setEnrichments(List<Enrichment> enrichments) { this.enrichments = enrichments; }
}
