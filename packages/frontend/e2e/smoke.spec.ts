import { test, expect } from "@playwright/test";

test.describe("Smoke tests", () => {
  test("App loads and shows the layout (sidebar, top bar)", async ({ page }) => {
    await page.goto("/");
    // Sidebar should be visible
    await expect(page.locator(".sidebar")).toBeVisible();
    // Top bar should be visible
    await expect(page.locator(".top-bar")).toBeVisible();
    // Main content area should be visible
    await expect(page.locator(".content")).toBeVisible();
  });

  test("Page title is set", async ({ page }) => {
    await page.goto("/");
    // Vite apps typically have a title — just confirm it's not empty
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test("Sidebar has navigation links", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator(".sidebar-nav");
    await expect(nav).toBeVisible();

    // Check all 5 nav links are present with correct text
    await expect(nav.locator(".nav-link", { hasText: "Dashboard" })).toBeVisible();
    await expect(nav.locator(".nav-link", { hasText: "Graph Explorer" })).toBeVisible();
    await expect(nav.locator(".nav-link", { hasText: "Flow Tracer" })).toBeVisible();
    await expect(nav.locator(".nav-link", { hasText: "Endpoints" })).toBeVisible();
    await expect(nav.locator(".nav-link", { hasText: "Files" })).toBeVisible();
  });

  test("Clicking nav links changes the route/URL", async ({ page }) => {
    await page.goto("/");

    // Click Graph Explorer
    await page.locator(".nav-link", { hasText: "Graph Explorer" }).click();
    await expect(page).toHaveURL(/\/graph$/);

    // Click Flow Tracer
    await page.locator(".nav-link", { hasText: "Flow Tracer" }).click();
    await expect(page).toHaveURL(/\/flow$/);

    // Click Endpoints
    await page.locator(".nav-link", { hasText: "Endpoints" }).click();
    await expect(page).toHaveURL(/\/endpoints$/);

    // Click Files
    await page.locator(".nav-link", { hasText: "Files" }).click();
    await expect(page).toHaveURL(/\/files$/);

    // Click Dashboard to go back
    await page.locator(".nav-link", { hasText: "Dashboard" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("Query bar is visible in the layout", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".query-bar")).toBeVisible();
    await expect(page.locator(".query-bar__input")).toBeVisible();
    await expect(page.locator(".query-bar__btn")).toBeVisible();
  });

  test("Sidebar header shows logo text", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".logo")).toHaveText("ConfiAnalyzer");
  });

  test("Top bar shows project name", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".top-bar__project")).toContainText("Project: default");
  });
});
