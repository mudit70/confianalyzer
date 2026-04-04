use proc_macro2::Span;
use syn::{
    Expr, ExprCall, ExprMethodCall, ExprPath, FnArg, ImplItem, Item, ItemEnum, ItemFn, ItemImpl,
    ItemStruct, ItemTrait, ItemUse, Lit, Pat, ReturnType, Signature, TraitItem, Type, UseTree,
    Visibility,
};

use crate::ir_types::*;
use crate::plugins::PluginRegistry;

/// Result of walking an entire file's AST.
pub struct WalkResult {
    pub functions: Vec<FunctionIR>,
    pub calls: Vec<CallIR>,
    pub imports: Vec<ImportIR>,
    pub exports: Vec<ExportIR>,
    pub classes: Vec<ClassIR>,
}

pub fn walk_file(file: &syn::File, plugins: &PluginRegistry) -> WalkResult {
    let mut result = WalkResult {
        functions: Vec::new(),
        calls: Vec::new(),
        imports: Vec::new(),
        exports: Vec::new(),
        classes: Vec::new(),
    };

    // First pass: collect impl blocks so we can associate methods with types
    let mut impl_methods: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();

    for item in &file.items {
        if let Item::Impl(item_impl) = item {
            process_impl_block(item_impl, &mut result, &mut impl_methods, plugins);
        }
    }

    // Second pass: everything else
    for item in &file.items {
        match item {
            Item::Fn(item_fn) => {
                process_top_level_fn(item_fn, &mut result, plugins);
            }
            Item::Use(item_use) => {
                process_use(item_use, &mut result);
            }
            Item::Struct(item_struct) => {
                process_struct(item_struct, &mut result, &impl_methods);
            }
            Item::Enum(item_enum) => {
                process_enum(item_enum, &mut result, &impl_methods);
            }
            Item::Trait(item_trait) => {
                process_trait(item_trait, &mut result);
            }
            Item::Impl(_) => { /* already handled */ }
            _ => {}
        }
    }

    result
}

fn is_pub(vis: &Visibility) -> bool {
    matches!(vis, Visibility::Public(_))
}

fn span_to_location(span: Span) -> SourceLocation {
    let start = span.start();
    let end = span.end();
    SourceLocation {
        start_line: start.line,
        end_line: end.line,
        start_column: start.column,
        end_column: end.column,
    }
}

fn type_to_string(ty: &Type) -> String {
    quote::quote!(#ty).to_string().replace(' ', "")
        // fix common spacing issues from quote
        .replace("& ", "&")
        .replace("< ", "<")
        .replace(" >", ">")
}

fn return_type_to_string(ret: &ReturnType) -> Option<String> {
    match ret {
        ReturnType::Default => None,
        ReturnType::Type(_, ty) => Some(type_to_string(ty)),
    }
}

fn signature_to_string(sig: &Signature) -> String {
    let async_part = if sig.asyncness.is_some() { "async " } else { "" };
    let name = &sig.ident;
    let params: Vec<String> = sig.inputs.iter().map(|arg| {
        quote::quote!(#arg).to_string()
    }).collect();
    let ret = match &sig.output {
        ReturnType::Default => String::new(),
        ReturnType::Type(_, ty) => format!(" -> {}", quote::quote!(#ty)),
    };
    format!("{}fn {}({}){}", async_part, name, params.join(", "), ret)
}

fn extract_parameters(sig: &Signature) -> Vec<ParameterIR> {
    sig.inputs
        .iter()
        .filter_map(|arg| match arg {
            FnArg::Receiver(_) => None,
            FnArg::Typed(pat_type) => {
                let name = match pat_type.pat.as_ref() {
                    Pat::Ident(pat_ident) => pat_ident.ident.to_string(),
                    _ => quote::quote!(#pat_type.pat).to_string(),
                };
                let type_annotation = Some(type_to_string(&pat_type.ty));
                Some(ParameterIR {
                    name,
                    type_annotation,
                    has_default: false,
                    is_rest: false,
                })
            }
        })
        .collect()
}

fn has_self_receiver(sig: &Signature) -> bool {
    sig.inputs.iter().any(|arg| matches!(arg, FnArg::Receiver(_)))
}

fn process_top_level_fn(
    item_fn: &ItemFn,
    result: &mut WalkResult,
    plugins: &PluginRegistry,
) {
    let name = item_fn.sig.ident.to_string();
    let exported = is_pub(&item_fn.vis);
    let is_async = item_fn.sig.asyncness.is_some();

    let mut func = FunctionIR {
        kind: "function".to_string(),
        name: name.clone(),
        qualified_name: None,
        signature: signature_to_string(&item_fn.sig),
        parameters: extract_parameters(&item_fn.sig),
        return_type: return_type_to_string(&item_fn.sig.output),
        is_exported: exported,
        is_async,
        is_static: Some(true),
        accessibility: if exported {
            Some("public".to_string())
        } else {
            Some("private".to_string())
        },
        location: span_to_location(item_fn.sig.ident.span()),
        endpoint_info: None,
        enrichments: None,
    };

    // Run plugins on the function
    let attrs: Vec<String> = item_fn
        .attrs
        .iter()
        .map(|a| quote::quote!(#a).to_string())
        .collect();
    plugins.process_function(&attrs, &mut func);

    if exported {
        result.exports.push(ExportIR {
            kind: "export".to_string(),
            name: name.clone(),
            local_name: Some(name.clone()),
            is_default: false,
            from_module: None,
            location: func.location.clone(),
        });
    }

    // Extract calls from the function body
    extract_calls_from_block(&item_fn.block, &name, result, plugins);

    result.functions.push(func);
}

fn process_impl_block(
    item_impl: &ItemImpl,
    result: &mut WalkResult,
    impl_methods: &mut std::collections::HashMap<String, Vec<String>>,
    plugins: &PluginRegistry,
) {
    let type_name = type_to_string(&item_impl.self_ty);

    for impl_item in &item_impl.items {
        if let ImplItem::Fn(method) = impl_item {
            let method_name = method.sig.ident.to_string();
            let qualified = format!("{}.{}", type_name, method_name);
            let exported = is_pub(&method.vis);
            let is_async = method.sig.asyncness.is_some();
            let is_static = !has_self_receiver(&method.sig);

            let mut func = FunctionIR {
                kind: "function".to_string(),
                name: method_name.clone(),
                qualified_name: Some(qualified.clone()),
                signature: signature_to_string(&method.sig),
                parameters: extract_parameters(&method.sig),
                return_type: return_type_to_string(&method.sig.output),
                is_exported: exported,
                is_async,
                is_static: Some(is_static),
                accessibility: if exported {
                    Some("public".to_string())
                } else {
                    Some("private".to_string())
                },
                location: span_to_location(method.sig.ident.span()),
                endpoint_info: None,
                enrichments: None,
            };

            let attrs: Vec<String> = method
                .attrs
                .iter()
                .map(|a| quote::quote!(#a).to_string())
                .collect();
            plugins.process_function(&attrs, &mut func);

            if exported {
                result.exports.push(ExportIR {
                    kind: "export".to_string(),
                    name: qualified.clone(),
                    local_name: Some(method_name.clone()),
                    is_default: false,
                    from_module: None,
                    location: func.location.clone(),
                });
            }

            impl_methods
                .entry(type_name.clone())
                .or_default()
                .push(method_name.clone());

            extract_calls_from_block(&method.block, &qualified, result, plugins);

            result.functions.push(func);
        }
    }
}

fn process_use(item_use: &ItemUse, result: &mut WalkResult) {
    let mut symbols = Vec::new();
    let mut path_parts = Vec::new();
    collect_use_tree(&item_use.tree, &mut path_parts, &mut symbols);

    let module_path = use_tree_to_module_path(&item_use.tree);
    let is_external = !module_path.starts_with("crate::")
        && !module_path.starts_with("self::")
        && !module_path.starts_with("super::");

    // Check for pub use re-exports
    if is_pub(&item_use.vis) {
        for sym in &symbols {
            result.exports.push(ExportIR {
                kind: "export".to_string(),
                name: sym.name.clone(),
                local_name: sym.alias.clone().or_else(|| Some(sym.name.clone())),
                is_default: false,
                from_module: Some(module_path.clone()),
                location: span_to_location(item_use.use_token.span),
            });
        }
    }

    result.imports.push(ImportIR {
        kind: "import".to_string(),
        module_path,
        resolved_path: None,
        is_external,
        symbols,
        default_import: None,
        namespace_import: None,
        location: span_to_location(item_use.use_token.span),
    });
}

fn use_tree_to_module_path(tree: &UseTree) -> String {
    match tree {
        UseTree::Path(path) => {
            let rest = use_tree_to_module_path(&path.tree);
            if rest.is_empty() {
                path.ident.to_string()
            } else {
                format!("{}::{}", path.ident, rest)
            }
        }
        UseTree::Name(name) => name.ident.to_string(),
        UseTree::Rename(rename) => rename.ident.to_string(),
        UseTree::Glob(_) => "*".to_string(),
        UseTree::Group(_) => String::new(),
    }
}

fn collect_use_tree(
    tree: &UseTree,
    prefix: &mut Vec<String>,
    symbols: &mut Vec<ImportedSymbolIR>,
) {
    match tree {
        UseTree::Path(path) => {
            prefix.push(path.ident.to_string());
            collect_use_tree(&path.tree, prefix, symbols);
            prefix.pop();
        }
        UseTree::Name(name) => {
            symbols.push(ImportedSymbolIR {
                name: name.ident.to_string(),
                alias: None,
            });
        }
        UseTree::Rename(rename) => {
            symbols.push(ImportedSymbolIR {
                name: rename.ident.to_string(),
                alias: Some(rename.rename.to_string()),
            });
        }
        UseTree::Glob(_) => {
            symbols.push(ImportedSymbolIR {
                name: "*".to_string(),
                alias: None,
            });
        }
        UseTree::Group(group) => {
            for tree in &group.items {
                collect_use_tree(tree, prefix, symbols);
            }
        }
    }
}

fn process_struct(
    item_struct: &ItemStruct,
    result: &mut WalkResult,
    impl_methods: &std::collections::HashMap<String, Vec<String>>,
) {
    let name = item_struct.ident.to_string();
    let exported = is_pub(&item_struct.vis);
    let methods = impl_methods.get(&name).cloned().unwrap_or_default();

    if exported {
        result.exports.push(ExportIR {
            kind: "export".to_string(),
            name: name.clone(),
            local_name: Some(name.clone()),
            is_default: false,
            from_module: None,
            location: span_to_location(item_struct.ident.span()),
        });
    }

    result.classes.push(ClassIR {
        kind: "class".to_string(),
        name,
        super_class: None,
        implements: Vec::new(),
        is_exported: exported,
        is_abstract: false,
        methods,
        location: span_to_location(item_struct.ident.span()),
    });
}

fn process_enum(
    item_enum: &ItemEnum,
    result: &mut WalkResult,
    impl_methods: &std::collections::HashMap<String, Vec<String>>,
) {
    let name = item_enum.ident.to_string();
    let exported = is_pub(&item_enum.vis);
    let methods = impl_methods.get(&name).cloned().unwrap_or_default();

    if exported {
        result.exports.push(ExportIR {
            kind: "export".to_string(),
            name: name.clone(),
            local_name: Some(name.clone()),
            is_default: false,
            from_module: None,
            location: span_to_location(item_enum.ident.span()),
        });
    }

    result.classes.push(ClassIR {
        kind: "class".to_string(),
        name,
        super_class: None,
        implements: Vec::new(),
        is_exported: exported,
        is_abstract: false,
        methods,
        location: span_to_location(item_enum.ident.span()),
    });
}

fn process_trait(item_trait: &ItemTrait, result: &mut WalkResult) {
    let name = item_trait.ident.to_string();
    let exported = is_pub(&item_trait.vis);

    let methods: Vec<String> = item_trait
        .items
        .iter()
        .filter_map(|item| {
            if let TraitItem::Fn(method) = item {
                Some(method.sig.ident.to_string())
            } else {
                None
            }
        })
        .collect();

    // Extract trait method signatures as functions
    for trait_item in &item_trait.items {
        if let TraitItem::Fn(method) = trait_item {
            let method_name = method.sig.ident.to_string();
            let qualified = format!("{}.{}", name, method_name);

            result.functions.push(FunctionIR {
                kind: "function".to_string(),
                name: method_name,
                qualified_name: Some(qualified),
                signature: signature_to_string(&method.sig),
                parameters: extract_parameters(&method.sig),
                return_type: return_type_to_string(&method.sig.output),
                is_exported: exported,
                is_async: method.sig.asyncness.is_some(),
                is_static: Some(!has_self_receiver(&method.sig)),
                accessibility: if exported {
                    Some("public".to_string())
                } else {
                    Some("private".to_string())
                },
                location: span_to_location(method.sig.ident.span()),
                endpoint_info: None,
                enrichments: None,
            });
        }
    }

    // Super traits
    let super_class = item_trait.supertraits.iter().next().map(|bound| {
        quote::quote!(#bound).to_string()
    });
    let implements: Vec<String> = item_trait
        .supertraits
        .iter()
        .skip(1)
        .map(|bound| quote::quote!(#bound).to_string())
        .collect();

    if exported {
        result.exports.push(ExportIR {
            kind: "export".to_string(),
            name: name.clone(),
            local_name: Some(name.clone()),
            is_default: false,
            from_module: None,
            location: span_to_location(item_trait.ident.span()),
        });
    }

    result.classes.push(ClassIR {
        kind: "class".to_string(),
        name,
        super_class,
        implements,
        is_exported: exported,
        is_abstract: true,
        methods,
        location: span_to_location(item_trait.ident.span()),
    });
}

fn extract_calls_from_block(
    block: &syn::Block,
    enclosing_fn: &str,
    result: &mut WalkResult,
    plugins: &PluginRegistry,
) {
    for stmt in &block.stmts {
        extract_calls_from_stmt(stmt, enclosing_fn, result, plugins);
    }
}

fn extract_calls_from_stmt(
    stmt: &syn::Stmt,
    enclosing_fn: &str,
    result: &mut WalkResult,
    plugins: &PluginRegistry,
) {
    match stmt {
        syn::Stmt::Expr(expr, _) => {
            extract_calls_from_expr(expr, enclosing_fn, result, plugins);
        }
        syn::Stmt::Macro(_) => {
            // Macro invocations are not standard expressions; skip.
        }
        syn::Stmt::Local(local) => {
            if let Some(init) = &local.init {
                extract_calls_from_expr(&init.expr, enclosing_fn, result, plugins);
            }
        }
        syn::Stmt::Item(_) => {}
    }
}

fn extract_calls_from_expr(
    expr: &Expr,
    enclosing_fn: &str,
    result: &mut WalkResult,
    plugins: &PluginRegistry,
) {
    match expr {
        Expr::Call(call) => {
            process_call_expr(call, enclosing_fn, result, plugins);
            // Also walk arguments
            for arg in &call.args {
                extract_calls_from_expr(arg, enclosing_fn, result, plugins);
            }
        }
        Expr::MethodCall(method_call) => {
            process_method_call_expr(method_call, enclosing_fn, result, plugins);
            // Walk receiver and arguments
            extract_calls_from_expr(&method_call.receiver, enclosing_fn, result, plugins);
            for arg in &method_call.args {
                extract_calls_from_expr(arg, enclosing_fn, result, plugins);
            }
        }
        Expr::Block(block) => {
            extract_calls_from_block(&block.block, enclosing_fn, result, plugins);
        }
        Expr::If(expr_if) => {
            extract_calls_from_expr(&expr_if.cond, enclosing_fn, result, plugins);
            extract_calls_from_block(&expr_if.then_branch, enclosing_fn, result, plugins);
            if let Some((_, else_expr)) = &expr_if.else_branch {
                extract_calls_from_expr(else_expr, enclosing_fn, result, plugins);
            }
        }
        Expr::Match(expr_match) => {
            extract_calls_from_expr(&expr_match.expr, enclosing_fn, result, plugins);
            for arm in &expr_match.arms {
                extract_calls_from_expr(&arm.body, enclosing_fn, result, plugins);
            }
        }
        Expr::Closure(closure) => {
            extract_calls_from_expr(&closure.body, enclosing_fn, result, plugins);
        }
        Expr::Await(expr_await) => {
            extract_calls_from_expr(&expr_await.base, enclosing_fn, result, plugins);
        }
        Expr::Return(ret) => {
            if let Some(expr) = &ret.expr {
                extract_calls_from_expr(expr, enclosing_fn, result, plugins);
            }
        }
        Expr::Let(expr_let) => {
            extract_calls_from_expr(&expr_let.expr, enclosing_fn, result, plugins);
        }
        Expr::Reference(expr_ref) => {
            extract_calls_from_expr(&expr_ref.expr, enclosing_fn, result, plugins);
        }
        Expr::Try(expr_try) => {
            extract_calls_from_expr(&expr_try.expr, enclosing_fn, result, plugins);
        }
        Expr::Tuple(tuple) => {
            for elem in &tuple.elems {
                extract_calls_from_expr(elem, enclosing_fn, result, plugins);
            }
        }
        Expr::Paren(paren) => {
            extract_calls_from_expr(&paren.expr, enclosing_fn, result, plugins);
        }
        _ => {}
    }
}

fn process_call_expr(
    call: &ExprCall,
    enclosing_fn: &str,
    result: &mut WalkResult,
    plugins: &PluginRegistry,
) {
    let callee = expr_to_callee_string(&call.func);
    let (string_args, argument_refs) = extract_args(&call.args);

    let mut call_ir = CallIR {
        kind: "call".to_string(),
        callee: callee.clone(),
        receiver: None,
        method: None,
        argument_count: call.args.len(),
        argument_refs: if argument_refs.is_empty() {
            None
        } else {
            Some(argument_refs)
        },
        string_args: if string_args.is_empty() {
            None
        } else {
            Some(string_args)
        },
        enclosing_function: Some(enclosing_fn.to_string()),
        location: span_to_location(call.paren_token.span.join()),
        enrichments: None,
    };

    plugins.process_call(&mut call_ir);

    result.calls.push(call_ir);
}

fn process_method_call_expr(
    method_call: &ExprMethodCall,
    enclosing_fn: &str,
    result: &mut WalkResult,
    plugins: &PluginRegistry,
) {
    let receiver = expr_to_callee_string(&method_call.receiver);
    let method = method_call.method.to_string();
    let callee = format!("{}.{}", receiver, method);
    let (string_args, argument_refs) = extract_args(&method_call.args);

    let mut call_ir = CallIR {
        kind: "call".to_string(),
        callee,
        receiver: Some(receiver),
        method: Some(method),
        argument_count: method_call.args.len(),
        argument_refs: if argument_refs.is_empty() {
            None
        } else {
            Some(argument_refs)
        },
        string_args: if string_args.is_empty() {
            None
        } else {
            Some(string_args)
        },
        enclosing_function: Some(enclosing_fn.to_string()),
        location: span_to_location(method_call.method.span()),
        enrichments: None,
    };

    plugins.process_call(&mut call_ir);

    result.calls.push(call_ir);
}

fn expr_to_callee_string(expr: &Expr) -> String {
    match expr {
        Expr::Path(ExprPath { path, .. }) => {
            path.segments
                .iter()
                .map(|seg| seg.ident.to_string())
                .collect::<Vec<_>>()
                .join("::")
        }
        Expr::Field(field) => {
            let base = expr_to_callee_string(&field.base);
            match &field.member {
                syn::Member::Named(ident) => format!("{}.{}", base, ident),
                syn::Member::Unnamed(index) => format!("{}.{}", base, index.index),
            }
        }
        Expr::MethodCall(mc) => {
            let base = expr_to_callee_string(&mc.receiver);
            format!("{}.{}", base, mc.method)
        }
        _ => quote::quote!(#expr).to_string(),
    }
}

fn extract_args(
    args: &syn::punctuated::Punctuated<Expr, syn::token::Comma>,
) -> (Vec<String>, Vec<String>) {
    let mut string_args = Vec::new();
    let mut argument_refs = Vec::new();

    for arg in args.iter() {
        match arg {
            Expr::Lit(expr_lit) => {
                if let Lit::Str(lit_str) = &expr_lit.lit {
                    string_args.push(lit_str.value());
                }
            }
            Expr::Path(expr_path) => {
                let path_str = expr_path
                    .path
                    .segments
                    .iter()
                    .map(|s| s.ident.to_string())
                    .collect::<Vec<_>>()
                    .join("::");
                argument_refs.push(path_str);
            }
            _ => {}
        }
    }

    (string_args, argument_refs)
}
