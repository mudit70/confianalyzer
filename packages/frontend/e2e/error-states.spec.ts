import { test, expect } from "@playwright/test";

test.describe("Error states - graceful degradation without API", () => {
  test("Dashboard shows welcome state when no projects exist", async ({ page }) => {
    await page.goto("/");

    // Should show welcome message when no projects have been analyzed
    const welcome = page.getByText("Welcome to ConfiAnalyzer");
    const loading = page.locator(".loading");

    await expect(loading.or(welcome).first()).toBeVisible();
    await expect(welcome).toBeVisible({ timeout: 10000 });
  });

  test("Endpoints page handles empty data gracefully", async ({ page }) => {
    await page.goto("/endpoints");

    // Should render the page without crashing
    await page.waitForTimeout(3000);
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
  });

  test("Files page handles empty data gracefully", async ({ page }) => {
    await page.goto("/files");

    // Should render the page without crashing
    await page.waitForTimeout(3000);
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
  });

  test("Graph Explorer shows appropriate state when no data loaded", async ({ page }) => {
    await page.goto("/graph");
    // Without searching, the graph should show the SVG canvas but with no nodes
    await expect(page.locator(".graph-explorer")).toBeVisible();
    await expect(page.locator(".graph-svg")).toBeVisible();

    // No search results or graph nodes should be shown initially
    const searchResults = page.locator(".search-results");
    await expect(searchResults).not.toBeVisible();
  });

  test("App does not crash - no uncaught errors in console", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
    });

    // Visit all routes
    await page.goto("/");
    await page.waitForTimeout(2000);

    await page.goto("/graph");
    await page.waitForTimeout(1000);

    await page.goto("/flow");
    await page.waitForTimeout(1000);

    await page.goto("/endpoints");
    await page.waitForTimeout(2000);

    await page.goto("/files");
    await page.waitForTimeout(2000);

    // No uncaught errors should have been thrown
    expect(errors).toEqual([]);
  });
});
