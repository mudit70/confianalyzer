package com.confianalyzer.ir;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class CallIR {
    @JsonProperty("kind")
    private final String kind = "call";

    @JsonProperty("callee")
    private String callee;

    @JsonProperty("receiver")
    private String receiver;

    @JsonProperty("method")
    private String method;

    @JsonProperty("argumentCount")
    private int argumentCount;

    @JsonProperty("argumentRefs")
    private List<String> argumentRefs;

    @JsonProperty("stringArgs")
    private List<String> stringArgs;

    @JsonProperty("enclosingFunction")
    private String enclosingFunction;

    @JsonProperty("location")
    private SourceLocation location;

    @JsonProperty("enrichments")
    private List<Enrichment> enrichments;

    public CallIR() {}

    public String getKind() { return kind; }
    public String getCallee() { return callee; }
    public void setCallee(String callee) { this.callee = callee; }
    public String getReceiver() { return receiver; }
    public void setReceiver(String receiver) { this.receiver = receiver; }
    public String getMethod() { return method; }
    public void setMethod(String method) { this.method = method; }
    public int getArgumentCount() { return argumentCount; }
    public void setArgumentCount(int argumentCount) { this.argumentCount = argumentCount; }
    public List<String> getArgumentRefs() { return argumentRefs; }
    public void setArgumentRefs(List<String> argumentRefs) { this.argumentRefs = argumentRefs; }
    public List<String> getStringArgs() { return stringArgs; }
    public void setStringArgs(List<String> stringArgs) { this.stringArgs = stringArgs; }
    public String getEnclosingFunction() { return enclosingFunction; }
    public void setEnclosingFunction(String enclosingFunction) { this.enclosingFunction = enclosingFunction; }
    public SourceLocation getLocation() { return location; }
    public void setLocation(SourceLocation location) { this.location = location; }
    public List<Enrichment> getEnrichments() { return enrichments; }
    public void setEnrichments(List<Enrichment> enrichments) { this.enrichments = enrichments; }
}
