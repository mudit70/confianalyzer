#[cfg(test)]
mod tests {
    use crate::ast_walker::walk_file;
    use crate::plugins::PluginRegistry;

    fn parse_and_walk(code: &str) -> crate::ast_walker::WalkResult {
        let file = syn::parse_file(code).expect("Failed to parse test code");
        let plugins = PluginRegistry::new();
        walk_file(&file, &plugins)
    }

    // --------------------------------------------------
    // 1. Function extraction (pub/non-pub, async, methods)
    // --------------------------------------------------
    #[test]
    fn test_pub_function() {
        let result = parse_and_walk("pub fn hello(name: String) -> String { name }");
        assert_eq!(result.functions.len(), 1);
        let f = &result.functions[0];
        assert_eq!(f.name, "hello");
        assert!(f.is_exported);
        assert!(!f.is_async);
        assert_eq!(f.is_static, Some(true));
        assert_eq!(f.parameters.len(), 1);
        assert_eq!(f.parameters[0].name, "name");
        assert!(f.return_type.is_some());
    }

    #[test]
    fn test_private_function() {
        let result = parse_and_walk("fn secret() {}");
        assert_eq!(result.functions.len(), 1);
        assert!(!result.functions[0].is_exported);
    }

    #[test]
    fn test_async_function() {
        let result = parse_and_walk("pub async fn fetch_data() -> Result<(), Error> { Ok(()) }");
        assert_eq!(result.functions.len(), 1);
        let f = &result.functions[0];
        assert!(f.is_async);
        assert!(f.is_exported);
    }

    #[test]
    fn test_impl_methods() {
        let code = r#"
            struct MyStruct;
            impl MyStruct {
                pub fn new() -> Self { MyStruct }
                pub fn greet(&self, name: &str) -> String { name.to_string() }
                fn internal(&mut self) {}
            }
        "#;
        let result = parse_and_walk(code);
        // 3 methods from impl
        let methods: Vec<_> = result
            .functions
            .iter()
            .filter(|f| f.qualified_name.is_some())
            .collect();
        assert_eq!(methods.len(), 3);

        let new_fn = methods.iter().find(|f| f.name == "new").unwrap();
        assert_eq!(new_fn.is_static, Some(true));
        assert!(new_fn.is_exported);

        let greet_fn = methods.iter().find(|f| f.name == "greet").unwrap();
        assert_eq!(greet_fn.is_static, Some(false));
        assert_eq!(
            greet_fn.qualified_name.as_deref(),
            Some("MyStruct.greet")
        );

        let internal_fn = methods.iter().find(|f| f.name == "internal").unwrap();
        assert!(!internal_fn.is_exported);
    }

    // --------------------------------------------------
    // 2. Struct extraction
    // --------------------------------------------------
    #[test]
    fn test_struct_extraction() {
        let code = r#"
            pub struct User {
                pub name: String,
                age: u32,
            }
            impl User {
                pub fn new(name: String) -> Self { User { name, age: 0 } }
            }
        "#;
        let result = parse_and_walk(code);
        assert_eq!(result.classes.len(), 1);
        let cls = &result.classes[0];
        assert_eq!(cls.name, "User");
        assert!(cls.is_exported);
        assert!(!cls.is_abstract);
        assert!(cls.methods.contains(&"new".to_string()));
    }

    // --------------------------------------------------
    // 3. Trait extraction (abstract)
    // --------------------------------------------------
    #[test]
    fn test_trait_extraction() {
        let code = r#"
            pub trait Handler {
                fn handle(&self, req: Request) -> Response;
                fn name(&self) -> &str;
            }
        "#;
        let result = parse_and_walk(code);
        assert_eq!(result.classes.len(), 1);
        let cls = &result.classes[0];
        assert_eq!(cls.name, "Handler");
        assert!(cls.is_abstract);
        assert!(cls.is_exported);
        assert_eq!(cls.methods.len(), 2);
        assert!(cls.methods.contains(&"handle".to_string()));
        assert!(cls.methods.contains(&"name".to_string()));
    }

    // --------------------------------------------------
    // 4. Import extraction (use statements)
    // --------------------------------------------------
    #[test]
    fn test_simple_import() {
        let result = parse_and_walk("use std::collections::HashMap;");
        assert_eq!(result.imports.len(), 1);
        let imp = &result.imports[0];
        assert_eq!(imp.module_path, "std::collections::HashMap");
        assert!(imp.is_external);
        assert_eq!(imp.symbols.len(), 1);
        assert_eq!(imp.symbols[0].name, "HashMap");
    }

    #[test]
    fn test_grouped_import() {
        let result = parse_and_walk("use std::{io, fs};");
        assert_eq!(result.imports.len(), 1);
        let imp = &result.imports[0];
        assert_eq!(imp.symbols.len(), 2);
        let names: Vec<&str> = imp.symbols.iter().map(|s| s.name.as_str()).collect();
        assert!(names.contains(&"io"));
        assert!(names.contains(&"fs"));
    }

    #[test]
    fn test_crate_import_not_external() {
        let result = parse_and_walk("use crate::models::User;");
        assert_eq!(result.imports.len(), 1);
        assert!(!result.imports[0].is_external);
    }

    #[test]
    fn test_self_import_not_external() {
        let result = parse_and_walk("use self::utils::helper;");
        assert_eq!(result.imports.len(), 1);
        assert!(!result.imports[0].is_external);
    }

    #[test]
    fn test_renamed_import() {
        let result = parse_and_walk("use std::collections::HashMap as Map;");
        assert_eq!(result.imports.len(), 1);
        let sym = &result.imports[0].symbols[0];
        assert_eq!(sym.name, "HashMap");
        assert_eq!(sym.alias.as_deref(), Some("Map"));
    }

    // --------------------------------------------------
    // 5. Export detection (pub items)
    // --------------------------------------------------
    #[test]
    fn test_pub_items_exported() {
        let code = r#"
            pub fn public_fn() {}
            fn private_fn() {}
            pub struct PublicStruct;
            struct PrivateStruct;
        "#;
        let result = parse_and_walk(code);
        let export_names: Vec<&str> = result.exports.iter().map(|e| e.name.as_str()).collect();
        assert!(export_names.contains(&"public_fn"));
        assert!(!export_names.contains(&"private_fn"));
        assert!(export_names.contains(&"PublicStruct"));
        assert!(!export_names.contains(&"PrivateStruct"));
    }

    #[test]
    fn test_pub_use_reexport() {
        let result = parse_and_walk("pub use crate::models::User;");
        assert!(result.exports.iter().any(|e| e.name == "User"));
        assert!(result.exports.iter().any(|e| e.from_module.is_some()));
    }

    // --------------------------------------------------
    // 6. Call extraction with stringArgs
    // --------------------------------------------------
    #[test]
    fn test_function_call() {
        let code = r#"
            fn main() {
                println!("hello");
                some_function("arg1", data);
            }
        "#;
        let result = parse_and_walk(code);
        // some_function is a regular call, println is a macro (not captured as ExprCall)
        let calls: Vec<_> = result.calls.iter().filter(|c| c.callee == "some_function").collect();
        assert_eq!(calls.len(), 1);
        let call = calls[0];
        assert_eq!(call.argument_count, 2);
        assert_eq!(call.string_args.as_ref().unwrap(), &vec!["arg1".to_string()]);
        assert_eq!(call.argument_refs.as_ref().unwrap(), &vec!["data".to_string()]);
        assert_eq!(call.enclosing_function.as_deref(), Some("main"));
    }

    #[test]
    fn test_method_call() {
        let code = r#"
            fn process() {
                client.send("message");
            }
        "#;
        let result = parse_and_walk(code);
        let calls: Vec<_> = result.calls.iter().filter(|c| c.method.as_deref() == Some("send")).collect();
        assert_eq!(calls.len(), 1);
        let call = calls[0];
        assert_eq!(call.receiver.as_deref(), Some("client"));
        assert_eq!(call.method.as_deref(), Some("send"));
        assert_eq!(call.string_args.as_ref().unwrap(), &vec!["message".to_string()]);
    }

    // --------------------------------------------------
    // 7. Actix-web route detection
    // --------------------------------------------------
    #[test]
    fn test_actix_get_route() {
        let code = r#"
            #[get("/api/users")]
            pub async fn get_users() -> HttpResponse {
                HttpResponse::Ok()
            }
        "#;
        let result = parse_and_walk(code);
        let f = &result.functions[0];
        assert!(f.endpoint_info.is_some());
        let ep = f.endpoint_info.as_ref().unwrap();
        assert_eq!(ep.method, "GET");
        assert_eq!(ep.path, "/api/users");
        assert!(f.enrichments.is_some());
        let enrichment = &f.enrichments.as_ref().unwrap()[0];
        assert_eq!(enrichment.plugin_name, "actix-web");
    }

    #[test]
    fn test_actix_post_route() {
        let code = r#"
            #[post("/api/users")]
            pub async fn create_user(body: web::Json<NewUser>) -> HttpResponse {
                HttpResponse::Created()
            }
        "#;
        let result = parse_and_walk(code);
        let f = &result.functions[0];
        let ep = f.endpoint_info.as_ref().unwrap();
        assert_eq!(ep.method, "POST");
        assert_eq!(ep.path, "/api/users");
    }

    // --------------------------------------------------
    // 8. Full IR document structure
    // --------------------------------------------------
    #[test]
    fn test_full_ir_document() {
        use tempfile::TempDir;
        use std::fs;

        let dir = TempDir::new().unwrap();
        let file_path = dir.path().join("lib.rs");
        fs::write(
            &file_path,
            r#"
use std::collections::HashMap;

pub struct Config {
    pub name: String,
}

impl Config {
    pub fn new(name: String) -> Self {
        Config { name }
    }
}

pub fn greet(config: &Config) -> String {
    format!("Hello, {}", config.name)
}
"#,
        )
        .unwrap();

        let doc = crate::analyzer::analyze_repository(
            dir.path().to_str().unwrap(),
            "test-repo",
            false,
        )
        .unwrap();

        assert_eq!(doc.schema, "confianalyzer-ir-v1");
        assert_eq!(doc.analyzer.language, "rust");
        assert_eq!(doc.repository.name, "test-repo");
        eprintln!("DEBUG: repo root_path = {}", doc.repository.root_path);
        eprintln!("DEBUG: dir path = {:?}", dir.path());
        eprintln!("DEBUG: file exists = {}", file_path.exists());
        eprintln!("DEBUG: files count = {}", doc.files.len());
        for f in &doc.files {
            eprintln!("DEBUG: file = {}", f.relative_path);
        }
        assert_eq!(doc.files.len(), 1);

        let file = &doc.files[0];
        assert_eq!(file.language, "rust");
        assert!(!file.hash.is_empty());
        assert!(file.size > 0);

        // Should have: Config.new (impl method) + greet (top-level fn)
        assert!(file.functions.len() >= 2);
        // Should have import for HashMap
        assert_eq!(file.imports.len(), 1);
        // Should have struct Config
        assert_eq!(file.classes.len(), 1);
        assert_eq!(file.classes[0].name, "Config");

        // Verify JSON serialization works
        let json = serde_json::to_string_pretty(&doc).unwrap();
        assert!(json.contains("\"$schema\": \"confianalyzer-ir-v1\""));
        assert!(json.contains("\"camelCase\"")==false); // field names should be camelCase
        assert!(json.contains("\"relativePath\""));
        assert!(json.contains("\"isExported\""));
    }

    // --------------------------------------------------
    // Enum extraction
    // --------------------------------------------------
    #[test]
    fn test_enum_extraction() {
        let code = r#"
            pub enum Status {
                Active,
                Inactive,
                Pending,
            }
        "#;
        let result = parse_and_walk(code);
        assert_eq!(result.classes.len(), 1);
        let cls = &result.classes[0];
        assert_eq!(cls.name, "Status");
        assert!(cls.is_exported);
        assert!(!cls.is_abstract);
    }
}
