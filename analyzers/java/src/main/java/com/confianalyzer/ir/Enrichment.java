package com.confianalyzer.ir;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class Enrichment {
    @JsonProperty("pluginName")
    private String pluginName;

    @JsonProperty("route")
    private RouteInfo route;

    @JsonProperty("dbOperation")
    private DbOperationInfo dbOperation;

    @JsonProperty("httpCall")
    private HttpCallInfo httpCall;

    @JsonProperty("renders")
    private java.util.List<String> renders;

    @JsonProperty("middlewareOrder")
    private Integer middlewareOrder;

    @JsonProperty("suggestedCategory")
    private String suggestedCategory;

    public Enrichment() {}

    public String getPluginName() { return pluginName; }
    public void setPluginName(String pluginName) { this.pluginName = pluginName; }
    public RouteInfo getRoute() { return route; }
    public void setRoute(RouteInfo route) { this.route = route; }
    public DbOperationInfo getDbOperation() { return dbOperation; }
    public void setDbOperation(DbOperationInfo dbOperation) { this.dbOperation = dbOperation; }
    public HttpCallInfo getHttpCall() { return httpCall; }
    public void setHttpCall(HttpCallInfo httpCall) { this.httpCall = httpCall; }
    public java.util.List<String> getRenders() { return renders; }
    public void setRenders(java.util.List<String> renders) { this.renders = renders; }
    public Integer getMiddlewareOrder() { return middlewareOrder; }
    public void setMiddlewareOrder(Integer middlewareOrder) { this.middlewareOrder = middlewareOrder; }
    public String getSuggestedCategory() { return suggestedCategory; }
    public void setSuggestedCategory(String suggestedCategory) { this.suggestedCategory = suggestedCategory; }
}
