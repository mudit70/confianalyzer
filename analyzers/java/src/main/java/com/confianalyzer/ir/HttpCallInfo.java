package com.confianalyzer.ir;

import com.fasterxml.jackson.annotation.JsonProperty;

public class HttpCallInfo {
    @JsonProperty("method")
    private String method;

    @JsonProperty("urlPattern")
    private String urlPattern;

    public HttpCallInfo() {}

    public HttpCallInfo(String method, String urlPattern) {
        this.method = method;
        this.urlPattern = urlPattern;
    }

    public String getMethod() { return method; }
    public void setMethod(String method) { this.method = method; }
    public String getUrlPattern() { return urlPattern; }
    public void setUrlPattern(String urlPattern) { this.urlPattern = urlPattern; }
}
