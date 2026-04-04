use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IrDocument {
    #[serde(rename = "$schema")]
    pub schema: String,
    pub version: String,
    pub generated_at: String,
    pub analyzer: AnalyzerMeta,
    pub repository: RepositoryMeta,
    pub files: Vec<FileIR>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzerMeta {
    pub name: String,
    pub version: String,
    pub language: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryMeta {
    pub name: String,
    pub root_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceLocation {
    pub start_line: usize,
    pub end_line: usize,
    pub start_column: usize,
    pub end_column: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileIR {
    pub path: String,
    pub relative_path: String,
    pub language: String,
    pub size: u64,
    pub hash: String,
    pub functions: Vec<FunctionIR>,
    pub calls: Vec<CallIR>,
    pub imports: Vec<ImportIR>,
    pub exports: Vec<ExportIR>,
    pub classes: Vec<ClassIR>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enrichments: Option<Vec<FileEnrichment>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FunctionIR {
    pub kind: String,
    pub name: String,
    pub qualified_name: Option<String>,
    pub signature: String,
    pub parameters: Vec<ParameterIR>,
    pub return_type: Option<String>,
    pub is_exported: bool,
    pub is_async: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_static: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accessibility: Option<String>,
    pub location: SourceLocation,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub endpoint_info: Option<EndpointInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enrichments: Option<Vec<Enrichment>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParameterIR {
    pub name: String,
    pub type_annotation: Option<String>,
    pub has_default: bool,
    pub is_rest: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CallIR {
    pub kind: String,
    pub callee: String,
    pub receiver: Option<String>,
    pub method: Option<String>,
    pub argument_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub argument_refs: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub string_args: Option<Vec<String>>,
    pub enclosing_function: Option<String>,
    pub location: SourceLocation,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enrichments: Option<Vec<Enrichment>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportIR {
    pub kind: String,
    pub module_path: String,
    pub resolved_path: Option<String>,
    pub is_external: bool,
    pub symbols: Vec<ImportedSymbolIR>,
    pub default_import: Option<String>,
    pub namespace_import: Option<String>,
    pub location: SourceLocation,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedSymbolIR {
    pub name: String,
    pub alias: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportIR {
    pub kind: String,
    pub name: String,
    pub local_name: Option<String>,
    pub is_default: bool,
    pub from_module: Option<String>,
    pub location: SourceLocation,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassIR {
    pub kind: String,
    pub name: String,
    pub super_class: Option<String>,
    pub implements: Vec<String>,
    pub is_exported: bool,
    pub is_abstract: bool,
    pub methods: Vec<String>,
    pub location: SourceLocation,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EndpointInfo {
    pub method: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Enrichment {
    pub plugin_name: String,
    pub route: Option<RouteInfo>,
    pub db_operation: Option<DbOperationInfo>,
    pub http_call: Option<HttpCallInfo>,
    pub renders: Option<Vec<String>>,
    pub middleware_order: Option<i32>,
    pub suggested_category: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteInfo {
    pub method: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DbOperationInfo {
    pub table: String,
    pub operation: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpCallInfo {
    pub method: String,
    pub url_pattern: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEnrichment {
    pub plugin_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_page: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_route: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_layout: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub component_name: Option<String>,
}
