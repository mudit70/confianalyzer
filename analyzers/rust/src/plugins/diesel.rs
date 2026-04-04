use crate::ir_types::{CallIR, DbOperationInfo, Enrichment, FunctionIR};
use crate::plugins::FrameworkPlugin;

pub struct DieselPlugin;

impl FrameworkPlugin for DieselPlugin {
    fn process_function(&self, _attrs: &[String], _func: &mut FunctionIR) {
        // Diesel does not use function attributes for DB operations.
    }

    fn process_call(&self, call: &mut CallIR) {
        // Detect diesel patterns:
        //   diesel::insert_into(table) -> write
        //   table.load(...) -> read
        //   table.filter(...) -> read
        //   diesel::delete(table) -> delete
        //   diesel::update(table) -> write

        let callee = &call.callee;

        let db_op = if callee.contains("insert_into") {
            let table = call
                .argument_refs
                .as_ref()
                .and_then(|refs| refs.first().cloned())
                .unwrap_or_else(|| "unknown".to_string());
            Some(("write", table))
        } else if callee.contains("diesel::delete") || callee.ends_with("::delete") {
            let table = call
                .argument_refs
                .as_ref()
                .and_then(|refs| refs.first().cloned())
                .unwrap_or_else(|| "unknown".to_string());
            Some(("delete", table))
        } else if callee.contains("diesel::update") || callee.ends_with("::update") {
            let table = call
                .argument_refs
                .as_ref()
                .and_then(|refs| refs.first().cloned())
                .unwrap_or_else(|| "unknown".to_string());
            Some(("write", table))
        } else if let Some(method) = &call.method {
            match method.as_str() {
                "load" | "first" | "get_result" | "get_results" | "filter" | "find" | "select" => {
                    let table = call.receiver.clone().unwrap_or_else(|| "unknown".to_string());
                    Some(("read", table))
                }
                "execute" => {
                    let table = call.receiver.clone().unwrap_or_else(|| "unknown".to_string());
                    Some(("write", table))
                }
                _ => None,
            }
        } else {
            None
        };

        if let Some((operation, table)) = db_op {
            let enrichment = Enrichment {
                plugin_name: "diesel".to_string(),
                route: None,
                db_operation: Some(DbOperationInfo {
                    table,
                    operation: operation.to_string(),
                }),
                http_call: None,
                renders: None,
                middleware_order: None,
                suggested_category: Some("db-access".to_string()),
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
