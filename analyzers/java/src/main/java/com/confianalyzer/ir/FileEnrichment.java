package com.confianalyzer.ir;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class FileEnrichment {
    @JsonProperty("pluginName")
    private String pluginName;

    @JsonProperty("isPage")
    private Boolean isPage;

    @JsonProperty("pageRoute")
    private String pageRoute;

    @JsonProperty("isLayout")
    private Boolean isLayout;

    @JsonProperty("componentName")
    private String componentName;

    public FileEnrichment() {}

    public String getPluginName() { return pluginName; }
    public void setPluginName(String pluginName) { this.pluginName = pluginName; }
    public Boolean getIsPage() { return isPage; }
    public void setIsPage(Boolean isPage) { this.isPage = isPage; }
    public String getPageRoute() { return pageRoute; }
    public void setPageRoute(String pageRoute) { this.pageRoute = pageRoute; }
    public Boolean getIsLayout() { return isLayout; }
    public void setIsLayout(Boolean isLayout) { this.isLayout = isLayout; }
    public String getComponentName() { return componentName; }
    public void setComponentName(String componentName) { this.componentName = componentName; }
}
