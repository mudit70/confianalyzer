import { test, expect } from "@playwright/test";

/**
 * Tests for Graph Explorer label overlap fixes (Issue #36).
 *
 * Prerequisites:
 * - Frontend running at http://localhost:5176
 * - API running at http://localhost:3006
 * - veodiagram project data loaded with functions and files
 */

/** Helper: navigate to /graph, click Hotspots tab, click first hotspot, wait for SVG */
async function loadHotspotGraph(page: import("@playwright/test").Page) {
  await page.goto("/graph");
  // Sidebar should be open by default
  await expect(page.locator(".intelligence-sidebar")).toBeVisible({ timeout: 5000 });
  // Click the Hotspots tab
  await page.locator(".intelligence-tab", { hasText: "Hotspots" }).click();
  // Wait for hotspot items to load
  const hotspotItem = page.locator(".insight-item").first();
  await expect(hotspotItem).toBeVisible({ timeout: 5000 });
  // Click the first hotspot
  await hotspotItem.click();
  // Wait for the SVG graph to appear with nodes
  await expect(page.locator(".graph-svg")).toBeVisible({ timeout: 8000 });
  // Wait for nodes to render inside the SVG
  await expect(page.locator(".graph-svg .graph-node").first()).toBeVisible({ timeout: 5000 });
}

test.describe("Issue #36: Graph Explorer label overlap fixes", () => {
  test("Labels are visible and multiple nodes rendered for file neighborhood", async ({ page }) => {
    await loadHotspotGraph(page);

    // Verify that multiple text labels are visible in the SVG (at least 3)
    const labels = page.locator(".graph-svg .graph-node__label");
    const labelCount = await labels.count();
    expect(labelCount).toBeGreaterThanOrEqual(3);

    // Verify the labels have non-empty text content
    const texts: string[] = [];
    for (let i = 0; i < Math.min(labelCount, 10); i++) {
      const text = await labels.nth(i).textContent();
      if (text && text.trim().length > 0) {
        texts.push(text.trim());
      }
    }
    expect(texts.length).toBeGreaterThanOrEqual(3);

    // Verify the SVG has width and height attributes (dynamic sizing)
    const svg = page.locator(".graph-svg");
    const width = await svg.getAttribute("width");
    const height = await svg.getAttribute("height");
    expect(width).not.toBeNull();
    expect(height).not.toBeNull();
    expect(Number(width)).toBeGreaterThanOrEqual(800);
    expect(Number(height)).toBeGreaterThanOrEqual(500);
  });

  test("Labels are truncated to max 18 characters plus ellipsis", async ({ page }) => {
    await loadHotspotGraph(page);

    const labels = page.locator(".graph-svg .graph-node__label");
    const labelCount = await labels.count();
    expect(labelCount).toBeGreaterThan(0);

    for (let i = 0; i < labelCount; i++) {
      const text = await labels.nth(i).textContent();
      if (text) {
        // 18 chars + optional ellipsis char = max 19 visible chars
        expect(text.length).toBeLessThanOrEqual(19);
      }
    }
  });

  test("Node dragging changes node position", async ({ page }) => {
    await loadHotspotGraph(page);

    // Find a node circle (not the center node to avoid re-centering)
    const nodes = page.locator(".graph-svg .graph-node");
    const nodeCount = await nodes.count();
    expect(nodeCount).toBeGreaterThanOrEqual(2);

    // Pick the second node (index 1) to avoid the center node
    const targetNode = nodes.nth(Math.min(1, nodeCount - 1));
    const circle = targetNode.locator("circle").first();

    // Get initial transform of the <g> element
    const initialTransform = await targetNode.getAttribute("transform");
    expect(initialTransform).not.toBeNull();

    // Get the bounding box of the node for mouse coordinates
    const box = await circle.boundingBox();
    expect(box).not.toBeNull();

    // Perform drag: mousedown, mousemove 60px right and 40px down, mouseup
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    // Move in small steps to trigger the moved threshold (>3px)
    await page.mouse.move(box!.x + box!.width / 2 + 30, box!.y + box!.height / 2 + 20, { steps: 5 });
    await page.mouse.move(box!.x + box!.width / 2 + 60, box!.y + box!.height / 2 + 40, { steps: 5 });
    await page.mouse.up();

    // Give React a moment to update
    await page.waitForTimeout(300);

    // The transform should have changed
    const newTransform = await targetNode.getAttribute("transform");
    expect(newTransform).not.toBeNull();
    expect(newTransform).not.toEqual(initialTransform);
  });

  test("Dynamic canvas sizing — SVG width is at least 800", async ({ page }) => {
    await loadHotspotGraph(page);

    const svg = page.locator(".graph-svg");
    const widthAttr = await svg.getAttribute("width");
    expect(widthAttr).not.toBeNull();
    expect(Number(widthAttr)).toBeGreaterThanOrEqual(800);

    // Also verify the canvas container allows scrolling (overflow: auto)
    const container = page.locator(".graph-explorer__canvas");
    const overflow = await container.evaluate((el) => getComputedStyle(el).overflow);
    expect(overflow).toContain("auto");
  });

  test("Radial label positioning — text-anchor varies across nodes", async ({ page }) => {
    await loadHotspotGraph(page);

    const labels = page.locator(".graph-svg .graph-node__label");
    const labelCount = await labels.count();
    expect(labelCount).toBeGreaterThanOrEqual(3);

    // Collect all text-anchor attribute values
    const anchors = new Set<string>();
    for (let i = 0; i < labelCount; i++) {
      const anchor = await labels.nth(i).getAttribute("text-anchor");
      if (anchor) anchors.add(anchor);
    }

    // In a neighborhood view with concentric layout, we expect at least 2 different
    // text-anchor values (e.g., "start" for right-side nodes, "end" for left-side,
    // and "middle" for the center node)
    expect(anchors.size).toBeGreaterThanOrEqual(2);
  });
});
