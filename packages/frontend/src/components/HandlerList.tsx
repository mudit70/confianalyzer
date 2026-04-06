import CategoryList from "./CategoryList";

export default function HandlerList() {
  return (
    <CategoryList
      category="HANDLER"
      title="Handlers"
      description="Functions called directly by API endpoints — the business logic layer between routes and data access."
      emptyMessage="No handlers found. Handlers are functions called by API endpoints that don't have endpoint annotations themselves."
    />
  );
}
