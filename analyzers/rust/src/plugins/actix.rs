use crate::ir_types::{CallIR, EndpointInfo, Enrichment, FunctionIR, RouteInfo};
use crate::plugins::FrameworkPlugin;

pub struct ActixPlugin;

/// HTTP method attributes used by actix-web.
const ACTIX_METHODS: &[&str] = &["get", "post", "put", "delete", "patch", "head"];

impl FrameworkPlugin for ActixPlugin {
    fn process_function(&self, attrs: &[String], func: &mut FunctionIR) {
        for attr in attrs {
            let attr_lower = attr.to_lowercase();
            for method in ACTIX_METHODS {
                // Match patterns like `#[get("/path")]` or `# [get ("/path")]`
                let prefix = format!("# [{}", method);
                let prefix2 = format!("#[{}", method);
                if attr_lower.contains(&prefix) || attr_lower.contains(&prefix2) {
                    if let Some(path) = extract_path_from_attr(attr) {
                        let http_method = method.to_uppercase();
                        func.endpoint_info = Some(EndpointInfo {
                            method: http_method.clone(),
                            path: path.clone(),
                        });
                        let enrichment = Enrichment {
                            plugin_name: "actix-web".to_string(),
                            route: Some(RouteInfo {
                                method: http_method,
                                path,
                            }),
                            db_operation: None,
                            http_call: None,
                            renders: None,
                            middleware_order: None,
                            suggested_category: Some("api-endpoint".to_string()),
                        };
                        func.enrichments =
                            Some(func.enrichments.take().unwrap_or_default().into_iter().chain(std::iter::once(enrichment)).collect());
                        return;
                    }
                }
            }
        }
    }

    fn process_call(&self, _call: &mut CallIR) {
        // Actix resource-based routing detection could go here.
        // For now, attribute-based routing covers the primary pattern.
    }
}

fn extract_path_from_attr(attr: &str) -> Option<String> {
    // Match quoted string inside the attribute: #[get("/api/users")]
    let start = attr.find('"')?;
    let rest = &attr[start + 1..];
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}
