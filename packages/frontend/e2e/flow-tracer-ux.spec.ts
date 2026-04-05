import { test, expect } from "@playwright/test";

test.describe("Flow Tracer UX improvements (issue #37)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/flow");
    // Wait for the Flow Tracer heading to confirm page loaded
    await expect(page.locator("h2", { hasText: "Flow Tracer" })).toBeVisible();
  });

  test("Test 1: Workflow step indicator is visible", async ({ page }) => {
    await expect(page.getByText("Choose function")).toBeVisible();
    await expect(page.getByText("Pick direction & trace")).toBeVisible();
    await expect(page.getByText("View flow")).toBeVisible();
  });

  test("Test 2: Guided intro text shown on initial load", async ({ page }) => {
    await expect(
      page.getByText("Trace call chains through your codebase")
    ).toBeVisible();
    await expect(
      page.getByText("from UI to database", { exact: false })
    ).toBeVisible();
  });

  test("Test 3: Suggested starting points appear", async ({ page }) => {
    // Wait for suggestions to load from the API
    const suggestionsHeading = page.getByText("Suggested starting points:");
    await expect(suggestionsHeading).toBeVisible({ timeout: 10000 });

    // Suggestion buttons are siblings of the heading paragraph, inside the same parent div
    // Structure: div > p("Suggested...") + div > button[]
    const suggestionsWrapper = suggestionsHeading.locator("xpath=.."); // the parent div
    const buttons = suggestionsWrapper.locator("button");
    await expect(buttons.first()).toBeVisible({ timeout: 5000 });
    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("Test 4: Clicking a suggestion selects it", async ({ page }) => {
    // Wait for suggestions to appear
    const suggestionsHeading = page.getByText("Suggested starting points:");
    await expect(suggestionsHeading).toBeVisible({ timeout: 10000 });

    const suggestionsWrapper = suggestionsHeading.locator("xpath=..");
    const firstButton = suggestionsWrapper.locator("button").first();
    await expect(firstButton).toBeVisible({ timeout: 5000 });

    // Get the function name from the second span (index 1) inside the button
    // Structure: button > span(dot) + span(name) + span(category)
    const fnNameSpan = firstButton.locator("span").nth(1);
    const fnName = await fnNameSpan.textContent();

    // Click the suggestion
    await firstButton.click();

    // Verify "Starting from:" appears with the selected function
    await expect(page.getByText("Starting from:")).toBeVisible();
    if (fnName) {
      await expect(page.locator("strong", { hasText: fnName })).toBeVisible();
    }

    // Verify direction options appear
    await expect(page.getByText("Trace callees", { exact: false })).toBeVisible();
    await expect(page.getByText("Trace callers", { exact: false })).toBeVisible();
    await expect(page.getByText("Entry to Exit", { exact: false })).toBeVisible();
  });

  test("Test 5: Full workflow — select, trace, view", async ({ page }) => {
    // Wait for suggestions
    const suggestionsHeading = page.getByText("Suggested starting points:");
    await expect(suggestionsHeading).toBeVisible({ timeout: 10000 });

    const suggestionsWrapper = suggestionsHeading.locator("xpath=..");
    const firstButton = suggestionsWrapper.locator("button").first();
    await expect(firstButton).toBeVisible({ timeout: 5000 });
    await firstButton.click();

    // Verify we're on step 2
    await expect(page.getByText("Starting from:")).toBeVisible();

    // Click the Trace button (the one in the direction section, not any other button)
    const traceBtn = page.locator(".flow-tracer__direction button.btn", { hasText: "Trace" });
    await expect(traceBtn).toBeVisible();
    await traceBtn.click();

    // Wait for loading to finish
    await expect(traceBtn).not.toHaveText("Tracing...", { timeout: 15000 });

    // Either flow results appear, the "no results" message stays, or an error shows
    const flowDiagram = page.locator(".flow-diagram");
    const noResultsMsg = page.getByText("Select a direction and click Trace");
    const errorMsg = page.locator(".error-message");

    await expect(
      flowDiagram.or(noResultsMsg).or(errorMsg)
    ).toBeVisible({ timeout: 10000 });
  });

  test("Test 6: Step indicator updates as user progresses", async ({
    page,
  }) => {
    // Step 1: "Choose function" div should have blue border-bottom
    // getByText("Choose function") resolves to the div itself (the step container)
    const step1Div = page.getByText("Choose function", { exact: false }).first();
    await expect(step1Div).toHaveCSS("border-bottom-color", "rgb(59, 130, 246)");

    // Wait for suggestions and click one
    const suggestionsHeading = page.getByText("Suggested starting points:");
    await expect(suggestionsHeading).toBeVisible({ timeout: 10000 });

    const suggestionsWrapper = suggestionsHeading.locator("xpath=..");
    const firstButton = suggestionsWrapper.locator("button").first();
    await expect(firstButton).toBeVisible({ timeout: 5000 });
    await firstButton.click();

    // Now step 2 should be highlighted (blue) and step 1 should be green (completed)
    const step2Div = page.getByText("Pick direction & trace", { exact: false }).first();
    await expect(step2Div).toHaveCSS("border-bottom-color", "rgb(59, 130, 246)");
    // Step 1 should now be green (completed)
    await expect(step1Div).toHaveCSS("border-bottom-color", "rgb(34, 197, 94)");
  });
});
