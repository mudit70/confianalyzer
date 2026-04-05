import { test, expect } from "@playwright/test";

test.describe("Error states - graceful degradation without API", () => {
  test("Dashboard loads without errors", async ({ page }) => {
    await page.goto("/");

    // Dashboard should show either welcome state (no projects) or project cards (data loaded)
    const welcome = page.getByText("Welcome to ConfiAnalyzer");
    const projects = page.locator(".project-card");
    const loading = page.locator(".loading");

    await expect(loading.or(welcome).or(projects.first()).first()).toBeVisible({ timeout: 10000 });
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

  test("Graph Explorer shows guided empty state when no data loaded", async ({ page }) => {
    await page.goto("/graph");
    await expect(page.locator(".graph-explorer")).toBeVisible();
    // Should show guided empty state instead of blank canvas
    await expect(page.getByText("Explore your codebase as a graph")).toBeVisible({ timeout: 5000 });
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
