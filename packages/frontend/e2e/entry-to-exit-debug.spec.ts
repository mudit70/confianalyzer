import { test, expect } from "@playwright/test";

const API_BASE = process.env.VITE_API_URL || "http://localhost:3006/api";

// ─── API-level tests ───

test.describe("Entry-to-Exit API tests", () => {
  test("projectRoutes has entry-to-exit paths", async ({ request }) => {
    // Search for projectRoutes
    const searchRes = await request.get(`${API_BASE}/search/functions?q=projectRoutes`);
    expect(searchRes.ok()).toBeTruthy();
    const functions = await searchRes.json();
    expect(functions.length).toBeGreaterThan(0);

    const projectRoutes = functions.find((f: any) => f.name === "projectRoutes");
    expect(projectRoutes).toBeTruthy();
    console.log("projectRoutes ID:", projectRoutes.id, "category:", projectRoutes.category);

    // Call entry-to-exit
    const traceRes = await request.get(
      `${API_BASE}/graph/node/${projectRoutes.id}/entry-to-exit?maxDepth=15`
    );
    expect(traceRes.ok()).toBeTruthy();
    const trace = await traceRes.json();

    console.log("Response top-level keys:", Object.keys(trace));
    console.log("paths count:", trace.paths?.length);
    console.log("fileMap is at top level:", typeof trace.fileMap === "object");

    // Verify paths exist and are non-empty
    expect(trace.paths).toBeDefined();
    expect(trace.paths.length).toBeGreaterThan(0);

    // Check the response structure: fileMap is at top level, NOT inside paths
    expect(trace.fileMap).toBeDefined();
    expect(typeof trace.fileMap).toBe("object");

    // Check that individual paths do NOT have fileMap (the bug)
    const firstPath = trace.paths[0];
    console.log("Path[0] keys:", Object.keys(firstPath));
    console.log("Path[0].fileMap:", firstPath.fileMap);
    console.log("Path[0].nodes count:", firstPath.nodes?.length);
    console.log("Path[0].edges count:", firstPath.edges?.length);

    // THIS IS THE BUG: fileMap is at top level, but frontend expects it per-path
    expect(firstPath.fileMap).toBeUndefined();  // proves the mismatch
  });

  test("createAgentRuns (DB_CALL) has entry-to-exit paths", async ({ request }) => {
    const searchRes = await request.get(`${API_BASE}/search/functions?q=createAgentRuns`);
    const functions = await searchRes.json();
    const fn = functions.find((f: any) => f.name === "createAgentRuns");
    expect(fn).toBeTruthy();
    console.log("createAgentRuns ID:", fn.id, "category:", fn.category);

    const traceRes = await request.get(
      `${API_BASE}/graph/node/${fn.id}/entry-to-exit?maxDepth=15`
    );
    expect(traceRes.ok()).toBeTruthy();
    const trace = await traceRes.json();
    console.log("createAgentRuns paths:", trace.paths?.length, "fileMap keys:", Object.keys(trace.fileMap || {}).length);
    expect(trace.paths.length).toBeGreaterThan(0);
  });

  test("utility function may have no entry-to-exit paths", async ({ request }) => {
    const searchRes = await request.get(`${API_BASE}/search/functions?q=parse`);
    const functions = await searchRes.json();
    if (functions.length > 0) {
      const fn = functions[0];
      console.log("Testing utility function:", fn.name, "category:", fn.category);
      const traceRes = await request.get(
        `${API_BASE}/graph/node/${fn.id}/entry-to-exit?maxDepth=15`
      );
      const trace = await traceRes.json();
      console.log("Utility function paths:", trace.paths?.length);
    }
  });
});

// ─── UI-level tests ───

test.describe("Entry-to-Exit UI tests", () => {
  test("tracing entry-to-exit for projectRoutes shows results or crashes", async ({ page }) => {
    // Collect console errors
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });

    // Navigate to flow page
    await page.goto("/flow");
    await page.waitForLoadState("networkidle");

    // Take screenshot of initial state
    await page.screenshot({ path: "e2e/screenshots/flow-initial.png" });

    // Search for projectRoutes
    const searchInput = page.locator('input[placeholder*="Search for a function"]');
    await searchInput.fill("projectRoutes");
    await searchInput.press("Enter");

    // Wait for search results
    await page.waitForSelector(".search-result-item", { timeout: 10000 });
    await page.screenshot({ path: "e2e/screenshots/flow-search-results.png" });

    // Click on projectRoutes result
    const resultItem = page.locator(".search-result-item").filter({ hasText: "projectRoutes" }).first();
    await resultItem.click();

    // Wait for direction options to appear
    await page.waitForSelector('input[value="entry-to-exit"]', { timeout: 5000 });

    // Select "Entry to Exit" direction
    await page.locator('input[value="entry-to-exit"]').click();
    await page.screenshot({ path: "e2e/screenshots/flow-direction-selected.png" });

    // Click Trace
    await page.locator("button", { hasText: "Trace" }).click();

    // Wait for loading to finish
    await page.waitForFunction(() => {
      const btn = document.querySelector("button");
      return btn && !btn.textContent?.includes("Tracing...");
    }, { timeout: 15000 });

    // Wait a moment for rendering
    await page.waitForTimeout(1000);
    await page.screenshot({ path: "e2e/screenshots/flow-after-trace.png" });

    // Check for page errors (TypeError from path.fileMap being undefined)
    console.log("Console errors:", consoleErrors);
    console.log("Page errors:", pageErrors);

    // Check if flow diagram appeared or if we got empty state
    const flowDiagram = page.locator(".flow-diagram");
    const flowDiagramVisible = await flowDiagram.isVisible().catch(() => false);
    console.log("Flow diagram visible:", flowDiagramVisible);

    const emptyMessage = page.locator(".text-muted");
    const emptyMessageVisible = await emptyMessage.isVisible().catch(() => false);
    console.log("Empty message visible:", emptyMessageVisible);

    const errorMessage = page.locator(".error-message");
    const errorVisible = await errorMessage.isVisible().catch(() => false);
    console.log("Error message visible:", errorVisible);
    if (errorVisible) {
      const errorText = await errorMessage.textContent();
      console.log("Error text:", errorText);
    }

    // Check for the spine toggle (only appears when flows are rendered)
    const spineToggle = page.locator(".flow-tracer__toggles");
    const toggleVisible = await spineToggle.isVisible().catch(() => false);
    console.log("Spine toggle visible (means flows rendered):", toggleVisible);

    // Report findings
    if (pageErrors.length > 0) {
      console.log("BUG CONFIRMED: Page crashed with errors:", pageErrors.join("; "));
    }
    if (!flowDiagramVisible && !errorVisible && emptyMessageVisible) {
      console.log("BUG: API returns data but UI shows empty state (no flow diagram)");
    }
    if (flowDiagramVisible) {
      console.log("Flow diagram is visible - feature works");
      const flowPaths = page.locator(".flow-path");
      const pathCount = await flowPaths.count();
      console.log("Number of flow paths rendered:", pathCount);
    }
  });

  test("intercept API to confirm data arrives but UI fails", async ({ page }) => {
    let apiResponse: any = null;

    // Intercept the entry-to-exit API call
    await page.route("**/graph/node/*/entry-to-exit*", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      apiResponse = body;
      console.log("Intercepted API response - paths:", body.paths?.length, "fileMap keys:", Object.keys(body.fileMap || {}).length);
      await route.fulfill({ response });
    });

    // Collect page errors
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });

    await page.goto("/flow");
    await page.waitForLoadState("networkidle");

    // Search and select projectRoutes
    const searchInput = page.locator('input[placeholder*="Search for a function"]');
    await searchInput.fill("projectRoutes");
    await searchInput.press("Enter");
    await page.waitForSelector(".search-result-item", { timeout: 10000 });
    await page.locator(".search-result-item").filter({ hasText: "projectRoutes" }).first().click();

    // Select entry-to-exit and trace
    await page.waitForSelector('input[value="entry-to-exit"]', { timeout: 5000 });
    await page.locator('input[value="entry-to-exit"]').click();
    await page.locator("button", { hasText: "Trace" }).click();

    // Wait for API response
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "e2e/screenshots/flow-intercept-result.png" });

    // Final diagnosis
    console.log("API returned data:", apiResponse !== null);
    if (apiResponse) {
      console.log("API paths count:", apiResponse.paths?.length);
      console.log("API fileMap at top level:", !!apiResponse.fileMap);
      console.log("API path[0].fileMap:", apiResponse.paths?.[0]?.fileMap);
    }
    console.log("Page errors after trace:", pageErrors);

    const flowDiagramVisible = await page.locator(".flow-diagram").isVisible().catch(() => false);
    console.log("Flow diagram visible after trace:", flowDiagramVisible);

    // The definitive test: API returns data, but does the UI show it?
    if (apiResponse && apiResponse.paths?.length > 0 && !flowDiagramVisible) {
      console.log("DIAGNOSIS: FRONTEND BUG - API returns " + apiResponse.paths.length + " paths but UI shows nothing");
      console.log("ROOT CAUSE: fileMap is at response top level but frontend code accesses path.fileMap[node.id] which throws TypeError");
    }
  });
});
