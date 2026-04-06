import CategoryList from "./CategoryList";

export default function ApiCallerList() {
  return (
    <CategoryList
      category="API_CALLER"
      title="API Callers"
      description="Functions that make HTTP calls to external services or other APIs."
      emptyMessage="No API callers found. Your codebase may not have detected HTTP client calls (axios, fetch, etc.)."
    />
  );
}
