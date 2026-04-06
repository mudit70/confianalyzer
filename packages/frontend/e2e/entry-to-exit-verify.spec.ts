import { test, expect } from "@playwright/test";

test.describe("Entry-to-Exit flow tracing fix verification", () => {
  async function navigateAndTrace(page: import("@playwright/test").Page) {
    // Navigate to flow page
    await page.goto("/flow");
    await expect(page.locator("h2", { hasText: "Flow Tracer" })).toBeVisible();

    // Search for projectRoutes
    const searchInput = page.locator(
      'input[placeholder*="Search for a function"]'
    );
    await searchInput.fill("projectRoutes");
    await searchInput.press("Enter");

    // Wait for search results and click
    await page.waitForSelector(".search-result-item", { timeout: 10000 });
    await page
      .locator(".search-result-item")
      .filter({ hasText: "projectRoutes" })
      .first()
      .click();

    // Select "Entry to Exit (full flow)" radio button
    await page.waitForSelector('input[value="entry-to-exit"]', {
      timeout: 5000,
    });
    await page.locator('input[value="entry-to-exit"]').click();

    // Click Trace
    const traceBtn = page.locator(".flow-tracer__direction button.btn", {
      hasText: "Trace",
    });
    await expect(traceBtn).toBeVisible();
    await traceBtn.click();

    // Wait for loading to finish
    await expect(traceBtn).not.toHaveText("Tracing...", { timeout: 15000 });

    // Small wait for rendering
    await page.waitForTimeout(500);
  }

  test("Test 1: Entry-to-exit trace renders results without crashing", async ({
    page,
  }) => {
    // Collect page errors to detect crashes
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await navigateAndTrace(page);

    // Verify no crash (no uncaught JS errors)
    expect(pageErrors).toHaveLength(0);

    // Verify the page is not blank - the flow-tracer container should still be present
    await expect(page.locator(".flow-tracer")).toBeVisible();

    // Verify either flow diagram content OR swimlane SVG is visible
    const flowDiagram = page.locator(".flow-diagram");
    const swimlaneSvg = page.locator(".flow-tracer__swimlane-svg");
    await expect(flowDiagram.or(swimlaneSvg)).toBeVisible({ timeout: 5000 });
  });

  test("Test 2: Entry-to-exit shows flow nodes", async ({ page }) => {
    await navigateAndTrace(page);

    // Verify the flow diagram rendered with actual node elements
    const flowDiagram = page.locator(".flow-diagram");
    await expect(flowDiagram).toBeVisible({ timeout: 5000 });

    // Check that at least one flow-node element exists
    const flowNodes = flowDiagram.locator(".flow-node");
    const count = await flowNodes.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("Test 3: Spine toggle and layout toggle visible after trace", async ({
    page,
  }) => {
    await navigateAndTrace(page);

    // Verify the spine toggle ("Show spine only") is visible
    await expect(
      page.getByText("Show spine only", { exact: false })
    ).toBeVisible();

    // Verify the layout toggle buttons (Flow / Swimlane) are visible
    const layoutToggle = page.locator(".flow-tracer__layout-toggle");
    await expect(layoutToggle).toBeVisible();
    await expect(
      layoutToggle.locator("button", { hasText: "Flow" })
    ).toBeVisible();
    await expect(
      layoutToggle.locator("button", { hasText: "Swimlane" })
    ).toBeVisible();
  });

  test("Test 4: No error message shown", async ({ page }) => {
    await navigateAndTrace(page);

    // Verify no .error-message element is visible
    const errorMessage = page.locator(".error-message");
    await expect(errorMessage).not.toBeVisible();
  });
});
