package com.confianalyzer.ir;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class ExportIR {
    @JsonProperty("kind")
    private final String kind = "export";

    @JsonProperty("name")
    private String name;

    @JsonProperty("localName")
    private String localName;

    @JsonProperty("isDefault")
    private boolean isDefault;

    @JsonProperty("fromModule")
    private String fromModule;

    @JsonProperty("location")
    private SourceLocation location;

    public ExportIR() {}

    public String getKind() { return kind; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getLocalName() { return localName; }
    public void setLocalName(String localName) { this.localName = localName; }
    public boolean isDefault() { return isDefault; }
    public void setDefault(boolean aDefault) { isDefault = aDefault; }
    public String getFromModule() { return fromModule; }
    public void setFromModule(String fromModule) { this.fromModule = fromModule; }
    public SourceLocation getLocation() { return location; }
    public void setLocation(SourceLocation location) { this.location = location; }
}
