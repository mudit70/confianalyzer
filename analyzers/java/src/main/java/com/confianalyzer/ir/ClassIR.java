package com.confianalyzer.ir;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class ClassIR {
    @JsonProperty("kind")
    private final String kind = "class";

    @JsonProperty("name")
    private String name;

    @JsonProperty("superClass")
    private String superClass;

    @JsonProperty("implements")
    private List<String> implementsList;

    @JsonProperty("isExported")
    private boolean isExported;

    @JsonProperty("isAbstract")
    private boolean isAbstract;

    @JsonProperty("methods")
    private List<String> methods;

    @JsonProperty("location")
    private SourceLocation location;

    public ClassIR() {}

    public String getKind() { return kind; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getSuperClass() { return superClass; }
    public void setSuperClass(String superClass) { this.superClass = superClass; }
    public List<String> getImplementsList() { return implementsList; }
    public void setImplementsList(List<String> implementsList) { this.implementsList = implementsList; }
    public boolean isExported() { return isExported; }
    public void setExported(boolean exported) { isExported = exported; }
    public boolean isAbstract() { return isAbstract; }
    public void setAbstract(boolean anAbstract) { isAbstract = anAbstract; }
    public List<String> getMethods() { return methods; }
    public void setMethods(List<String> methods) { this.methods = methods; }
    public SourceLocation getLocation() { return location; }
    public void setLocation(SourceLocation location) { this.location = location; }
}
