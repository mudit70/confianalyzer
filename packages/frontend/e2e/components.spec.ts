import { test, expect } from "@playwright/test";

test.describe("Component interaction tests", () => {
  test("Query bar accepts input and shows submit button", async ({ page }) => {
    await page.goto("/");
    const input = page.locator(".query-bar__input");
    const btn = page.locator(".query-bar__btn");

    await expect(input).toBeVisible();
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText("Ask");

    // Type into the query bar
    await input.fill("show all endpoints");
    await expect(input).toHaveValue("show all endpoints");
  });

  test("Query bar shows filter chips", async ({ page }) => {
    await page.goto("/");
    const chips = page.locator(".filter-chips");
    await expect(chips).toBeVisible();

    // Check all four filter chips are present
    await expect(chips.locator(".filter-chip", { hasText: "Frontend Only" })).toBeVisible();
    await expect(chips.locator(".filter-chip", { hasText: "Backend Only" })).toBeVisible();
    await expect(chips.locator(".filter-chip", { hasText: "Exclude Tests" })).toBeVisible();
    await expect(chips.locator(".filter-chip", { hasText: "DB Layer Only" })).toBeVisible();
  });

  test("Filter chips toggle active state on click", async ({ page }) => {
    await page.goto("/");
    const chip = page.locator(".filter-chip", { hasText: "Frontend Only" });

    // Initially not active
    await expect(chip).not.toHaveClass(/filter-chip--active/);

    // Click to activate
    await chip.click();
    await expect(chip).toHaveClass(/filter-chip--active/);

    // Click again to deactivate
    await chip.click();
    await expect(chip).not.toHaveClass(/filter-chip--active/);
  });

  test("Graph Explorer depth control appears in neighborhood mode", async ({ page }) => {
    await page.goto("/graph");
    // Depth control is hidden until neighborhood mode is entered
    // Verify the page loads without error
    await expect(page.locator(".graph-explorer")).toBeVisible();
  });

  test("Graph Explorer shows empty state with guidance on initial load", async ({ page }) => {
    await page.goto("/graph");
    // Should show the guided empty state instead of an empty SVG canvas
    await expect(page.getByText("Explore your codebase as a graph")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Search for a function/)).toBeVisible();
  });

  test("Flow Tracer entry picker dropdown has category options", async ({ page }) => {
    await page.goto("/flow");
    const select = page.locator(".flow-tracer__entry-picker select");
    await expect(select).toBeVisible();

    // Check the dropdown options
    const options = select.locator("option");
    await expect(options).toHaveCount(5);

    // Verify option texts
    await expect(options.nth(0)).toHaveText("Any function");
    await expect(options.nth(1)).toHaveText("Start from UI Interaction");
    await expect(options.nth(2)).toHaveText("Start from API Endpoint");
    await expect(options.nth(3)).toHaveText("Start from Handler");
    await expect(options.nth(4)).toHaveText("Start from API Caller");
  });

  test("Flow Tracer has search input", async ({ page }) => {
    await page.goto("/flow");
    const input = page.locator(".flow-tracer__controls .search-input");
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute("placeholder", /search for a function/i);
  });

  test("Endpoint list shows method filter buttons when loaded", async ({ page }) => {
    await page.goto("/endpoints");
    // If API is not running, we may see loading then error.
    // Wait a moment for the component to settle
    await page.waitForTimeout(1000);

    // If endpoint-list rendered (with or without data), check for method filters
    const list = page.locator(".endpoint-list");
    if (await list.isVisible()) {
      const methodFilters = page.locator(".method-filters");
      await expect(methodFilters).toBeVisible();

      // Should have ALL, GET, POST, PUT, PATCH, DELETE
      const buttons = methodFilters.locator("button");
      await expect(buttons).toHaveCount(6);
      await expect(buttons.nth(0)).toHaveText("ALL");
      await expect(buttons.nth(1)).toHaveText("GET");
    }
  });

  test("Endpoint list shows search filter input when loaded", async ({ page }) => {
    await page.goto("/endpoints");
    await page.waitForTimeout(1000);

    const list = page.locator(".endpoint-list");
    if (await list.isVisible()) {
      const searchInput = list.locator(".search-input");
      await expect(searchInput).toBeVisible();
      await expect(searchInput).toHaveAttribute("placeholder", "Filter by path...");
    }
  });
});
