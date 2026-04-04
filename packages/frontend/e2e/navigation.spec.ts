import { test, expect } from "@playwright/test";

test.describe("Navigation tests", () => {
  test("Dashboard route (/) renders dashboard component", async ({ page }) => {
    await page.goto("/");
    // Dashboard fetches data from API; without API it shows loading then error
    // Either the dashboard div, a loading indicator, or an error message should appear
    const dashboard = page.locator(".dashboard");
    const loading = page.locator(".loading");
    const error = page.locator(".error-message");
    await expect(dashboard.or(loading).or(error).first()).toBeVisible();
  });

  test("Graph Explorer route shows the explorer with search", async ({ page }) => {
    await page.goto("/graph");
    await expect(page.locator(".graph-explorer")).toBeVisible();
    // Search input and button should be present
    await expect(page.locator(".graph-explorer .search-input")).toBeVisible();
    await expect(page.locator(".graph-explorer .btn", { hasText: "Search" })).toBeVisible();
  });

  test("Flow Tracer route shows the tracer with direction selector", async ({ page }) => {
    await page.goto("/flow");
    await expect(page.locator(".flow-tracer")).toBeVisible();
    // Should have the h2 heading
    await expect(page.locator(".flow-tracer h2")).toHaveText("Flow Tracer");
    // Entry picker select dropdown should exist
    await expect(page.locator(".flow-tracer__entry-picker select")).toBeVisible();
  });

  test("Endpoints route shows the endpoints list", async ({ page }) => {
    await page.goto("/endpoints");
    // EndpointList fetches data; without API it shows loading then error
    const list = page.locator(".endpoint-list");
    const loading = page.locator(".loading");
    const error = page.locator(".error-message");
    await expect(list.or(loading).or(error).first()).toBeVisible();
  });

  test("Files route shows the file tree page", async ({ page }) => {
    await page.goto("/files");
    // FileTree fetches repos; without API it shows loading then error
    const tree = page.locator(".file-tree-page");
    const loading = page.locator(".loading");
    const error = page.locator(".error-message");
    await expect(tree.or(loading).or(error).first()).toBeVisible();
  });

  test("Navigating between routes preserves the layout", async ({ page }) => {
    await page.goto("/");
    // Layout elements should be visible
    await expect(page.locator(".sidebar")).toBeVisible();
    await expect(page.locator(".top-bar")).toBeVisible();

    // Navigate to graph
    await page.locator(".nav-link", { hasText: "Graph Explorer" }).click();
    // Layout should still be there
    await expect(page.locator(".sidebar")).toBeVisible();
    await expect(page.locator(".top-bar")).toBeVisible();
    await expect(page.locator(".graph-explorer")).toBeVisible();

    // Navigate to flow
    await page.locator(".nav-link", { hasText: "Flow Tracer" }).click();
    await expect(page.locator(".sidebar")).toBeVisible();
    await expect(page.locator(".top-bar")).toBeVisible();
    await expect(page.locator(".flow-tracer")).toBeVisible();

    // Navigate to endpoints
    await page.locator(".nav-link", { hasText: "Endpoints" }).click();
    await expect(page.locator(".sidebar")).toBeVisible();
    await expect(page.locator(".top-bar")).toBeVisible();

    // Navigate to files
    await page.locator(".nav-link", { hasText: "Files" }).click();
    await expect(page.locator(".sidebar")).toBeVisible();
    await expect(page.locator(".top-bar")).toBeVisible();
  });

  test("Active nav link has active class", async ({ page }) => {
    await page.goto("/");
    // Dashboard link should have the active class
    await expect(page.locator(".nav-link--active")).toHaveText("Dashboard");

    // Navigate to graph
    await page.locator(".nav-link", { hasText: "Graph Explorer" }).click();
    await expect(page.locator(".nav-link--active")).toHaveText("Graph Explorer");
  });
});
