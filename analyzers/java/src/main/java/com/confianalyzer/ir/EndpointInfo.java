package com.confianalyzer.ir;

import com.fasterxml.jackson.annotation.JsonProperty;

public class EndpointInfo {
    @JsonProperty("method")
    private String method;

    @JsonProperty("path")
    private String path;

    public EndpointInfo() {}

    public EndpointInfo(String method, String path) {
        this.method = method;
        this.path = path;
    }

    public String getMethod() { return method; }
    public void setMethod(String method) { this.method = method; }
    public String getPath() { return path; }
    public void setPath(String path) { this.path = path; }
}
