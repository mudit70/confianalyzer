pub mod actix;
pub mod axum;
pub mod diesel;

use crate::ir_types::{CallIR, FunctionIR};

/// Trait for framework-specific plugins.
pub trait FrameworkPlugin {
    /// Inspect function attributes and enrich the FunctionIR if a route is detected.
    fn process_function(&self, attrs: &[String], func: &mut FunctionIR);

    /// Inspect a call and enrich the CallIR if a framework-specific pattern is detected.
    fn process_call(&self, call: &mut CallIR);
}

/// Registry that holds all active plugins and delegates to them.
pub struct PluginRegistry {
    plugins: Vec<Box<dyn FrameworkPlugin>>,
}

impl PluginRegistry {
    pub fn new() -> Self {
        Self {
            plugins: vec![
                Box::new(actix::ActixPlugin),
                Box::new(axum::AxumPlugin),
                Box::new(diesel::DieselPlugin),
            ],
        }
    }

    pub fn process_function(&self, attrs: &[String], func: &mut FunctionIR) {
        for plugin in &self.plugins {
            plugin.process_function(attrs, func);
        }
    }

    pub fn process_call(&self, call: &mut CallIR) {
        for plugin in &self.plugins {
            plugin.process_call(call);
        }
    }
}
