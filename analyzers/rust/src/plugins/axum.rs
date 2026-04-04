use crate::ir_types::{CallIR, Enrichment, RouteInfo};
use crate::plugins::FrameworkPlugin;
use crate::ir_types::FunctionIR;

pub struct AxumPlugin;

impl FrameworkPlugin for AxumPlugin {
    fn process_function(&self, _attrs: &[String], _func: &mut FunctionIR) {
        // Axum does not use attribute macros for routing; routes are defined via method calls.
    }

    fn process_call(&self, call: &mut CallIR) {
        // Detect Router::new().route("/path", get(handler)) pattern
        // The method call `route` with a string arg is the signal.
        if let Some(method) = &call.method {
            if method == "route" {
                if let Some(string_args) = &call.string_args {
                    if let Some(path) = string_args.first() {
                        // Try to determine HTTP method from argument_refs (get, post, etc.)
                        let http_method = call
                            .argument_refs
                            .as_ref()
                            .and_then(|refs| {
                                refs.iter().find_map(|r| {
                                    let lower = r.to_lowercase();
                                    match lower.as_str() {
                                        "get" | "post" | "put" | "delete" | "patch" | "head" => {
                                            Some(lower.to_uppercase())
                                        }
                                        _ => None,
                                    }
                                })
                            })
                            .unwrap_or_else(|| "GET".to_string());

                        let enrichment = Enrichment {
                            plugin_name: "axum".to_string(),
                            route: Some(RouteInfo {
                                method: http_method,
                                path: path.clone(),
                            }),
                            db_operation: None,
                            http_call: None,
                            renders: None,
                            middleware_order: None,
                            suggested_category: Some("api-route".to_string()),
                        };
                        call.enrichments = Some(
                            call.enrichments
                                .take()
                                .unwrap_or_default()
                                .into_iter()
                                .chain(std::iter::once(enrichment))
                                .collect(),
                        );
                    }
                }
            }
        }
    }
}
