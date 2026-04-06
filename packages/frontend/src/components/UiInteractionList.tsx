import CategoryList from "./CategoryList";

export default function UiInteractionList() {
  return (
    <CategoryList
      category="UI_INTERACTION"
      title="UI Interactions"
      description="React components and UI event handlers that represent user-facing entry points into the application."
      emptyMessage="No UI interactions found. UI interactions are detected from JSX component rendering patterns."
    />
  );
}
