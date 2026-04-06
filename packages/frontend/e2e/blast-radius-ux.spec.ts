import { test, expect } from "@playwright/test";

test.describe("Blast Radius UX improvements (issue #39)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/blast-radius");
    await expect(page.locator("h2", { hasText: "Blast Radius" })).toBeVisible();
  });

  test("Test 1: Workflow step indicator visible", async ({ page }) => {
    await expect(page.getByText("Choose a function")).toBeVisible();
    await expect(page.getByText("View impact")).toBeVisible();
  });

  test("Test 2: Guided intro shown on initial load", async ({ page }) => {
    await expect(
      page.getByText("If I change this function, what breaks?")
    ).toBeVisible();
    await expect(
      page.getByText("before refactoring to understand the full impact", { exact: false })
    ).toBeVisible();
  });

  test("Test 3: Suggested starting points appear", async ({ page }) => {
    const suggestionsHeading = page.getByText("Suggested functions to analyze:");
    await expect(suggestionsHeading).toBeVisible({ timeout: 10000 });

    const suggestionsWrapper = suggestionsHeading.locator("xpath=..");
    const buttons = suggestionsWrapper.locator("button");
    await expect(buttons.first()).toBeVisible({ timeout: 5000 });
    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("Test 4: Clicking a suggestion loads blast radius", async ({ page }) => {
    const suggestionsHeading = page.getByText("Suggested functions to analyze:");
    await expect(suggestionsHeading).toBeVisible({ timeout: 10000 });

    const suggestionsWrapper = suggestionsHeading.locator("xpath=..");
    const firstButton = suggestionsWrapper.locator("button").first();
    await expect(firstButton).toBeVisible({ timeout: 5000 });

    await firstButton.click();

    // Wait for loading to finish
    await expect(page.getByText("Analyzing impact...")).toBeHidden({ timeout: 15000 });

    // Either summary metrics appear or "No callers found" message
    const directCallersLabel = page.getByText("Direct callers");
    const transitiveCallersLabel = page.getByText("Transitive callers");
    const noCallersMsg = page.getByText("No callers found", { exact: false });

    await expect(
      directCallersLabel.or(noCallersMsg)
    ).toBeVisible({ timeout: 10000 });

    // If summary is visible, transitive callers label should be too
    if (await directCallersLabel.isVisible()) {
      await expect(transitiveCallersLabel).toBeVisible();
    }
  });

  test("Test 5: Summary card uses light theme", async ({ page }) => {
    const suggestionsHeading = page.getByText("Suggested functions to analyze:");
    await expect(suggestionsHeading).toBeVisible({ timeout: 10000 });

    const suggestionsWrapper = suggestionsHeading.locator("xpath=..");
    const firstButton = suggestionsWrapper.locator("button").first();
    await expect(firstButton).toBeVisible({ timeout: 5000 });
    await firstButton.click();

    await expect(page.getByText("Analyzing impact...")).toBeHidden({ timeout: 15000 });

    const directCallersLabel = page.getByText("Direct callers");
    const noCallersMsg = page.getByText("No callers found", { exact: false });

    await expect(
      directCallersLabel.or(noCallersMsg)
    ).toBeVisible({ timeout: 10000 });

    // If we have results with the summary card, verify it uses light background
    if (await directCallersLabel.isVisible()) {
      // The summary card is the parent container of the "Direct callers" label
      const summaryCard = directCallersLabel.locator("xpath=ancestor::div[contains(@style, 'background')]").first();
      // Verify it does NOT use dark background (#1e293b = rgb(30, 41, 59))
      await expect(summaryCard).not.toHaveCSS("background-color", "rgb(30, 41, 59)");
    }
  });

  test("Test 6: Full workflow — search, select, view, change", async ({ page }) => {
    // Step 1: Search for a function
    const searchInput = page.locator('input[placeholder*="Search for a function"]');
    await expect(searchInput).toBeVisible();
    await searchInput.fill("parse");
    await page.locator("button", { hasText: "Search" }).click();

    // Wait for search results
    const searchResultItem = page.locator(".search-result-item").first();
    await expect(searchResultItem).toBeVisible({ timeout: 10000 });

    // Click a result
    await searchResultItem.click();

    // Wait for loading to finish
    await expect(page.getByText("Analyzing impact...")).toBeHidden({ timeout: 15000 });

    // Verify results loaded — the summary card always appears when results load
    await expect(page.getByText("Direct callers")).toBeVisible({ timeout: 10000 });

    // Click "Change" to go back to step 1
    await page.locator("button", { hasText: "Change" }).click();

    // Verify guided intro reappears (back to step 1)
    await expect(
      page.getByText("If I change this function, what breaks?")
    ).toBeVisible();
  });
});
