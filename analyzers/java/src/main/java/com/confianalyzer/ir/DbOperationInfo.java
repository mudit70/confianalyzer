package com.confianalyzer.ir;

import com.fasterxml.jackson.annotation.JsonProperty;

public class DbOperationInfo {
    @JsonProperty("table")
    private String table;

    @JsonProperty("operation")
    private String operation;

    public DbOperationInfo() {}

    public DbOperationInfo(String table, String operation) {
        this.table = table;
        this.operation = operation;
    }

    public String getTable() { return table; }
    public void setTable(String table) { this.table = table; }
    public String getOperation() { return operation; }
    public void setOperation(String operation) { this.operation = operation; }
}
