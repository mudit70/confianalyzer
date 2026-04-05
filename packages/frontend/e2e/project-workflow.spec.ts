import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

const API_BASE = "http://localhost:3006/api";
const NEO4J_HTTP = "http://localhost:7475";
const NEO4J_AUTH = "neo4j:confianalyzer";
const FRONTEND_FIXTURE = "/Users/mudittyagi/projects/confianalyzer/tests/fixtures/frontend";
const BACKEND_FIXTURE = "/Users/mudittyagi/projects/confianalyzer/tests/fixtures/backend";
const PROJECT_NAME = `pw-e2e-${Date.now()}`;

/**
 * Clean up test-specific data from Neo4j without destroying other projects.
 * Only deletes the test project and its related nodes.
 */
async function cleanupTestProject(request: APIRequestContext, projectName: string) {
  await request.post(`${NEO4J_HTTP}/db/neo4j/query/v2`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(NEO4J_AUTH).toString("base64")}`,
    },
    data: {
      statement: `MATCH (p:Project {name: $name})
                   OPTIONAL MATCH (r:Repository)-[:BELONGS_TO]->(p)
                   OPTIONAL MATCH (r)<-[:IN_REPO]-(f:File)
                   OPTIONAL MATCH (f)<-[:DEFINED_IN]-(fn:Function)
                   OPTIONAL MATCH (fn)-[:EXPOSES]->(ep:APIEndpoint)
                   OPTIONAL MATCH (fn)-[:READS|WRITES]->(dt:DBTable)
                   DETACH DELETE ep, dt, fn, f, r, p`,
      parameters: { name: projectName },
    },
  });
}

// ─── Independent tests (no shared state) ───

test.describe("Project workflow: welcome and navigation", () => {
  test("Test 1: Dashboard has a create project button or link", async ({ page, request }) => {
    await cleanupTestProject(request, PROJECT_NAME);
    await page.goto("/");
    // Dashboard should show either Welcome state with create button, or project list with New Project button
    const createBtn = page.getByRole("button", { name: /Create New Project|New Project/ });
    const newProjectLink = page.locator('.nav-link', { hasText: "new-project" });
    await expect(createBtn.or(newProjectLink).first()).toBeVisible({ timeout: 10000 });
  });

  test("Test 2: Navigate to project wizard", async ({ page, request }) => {
    await cleanupTestProject(request, PROJECT_NAME);
    await page.goto("/new-project");
    await expect(page.locator("#project-name")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Create New Project" })).toBeVisible();
  });
});

// ─── Serial tests: full wizard flow (each test depends on the previous) ───

test.describe.serial("Project workflow: create -> add repos -> analyze -> dashboard", () => {
  let sharedPage: Page;

  test.beforeAll(async ({ browser, request }) => {
    await cleanupTestProject(request, PROJECT_NAME);
    sharedPage = await browser.newPage();
  });

  test.afterAll(async ({ request }) => {
    await sharedPage?.close();
    await cleanupTestProject(request, PROJECT_NAME);
  });

  test("Test 3: Create a project", async () => {
    await sharedPage.goto("/new-project");
    await expect(sharedPage.locator("#project-name")).toBeVisible();

    await sharedPage.locator("#project-name").fill(PROJECT_NAME);
    await sharedPage.getByRole("button", { name: "Create Project" }).click();

    // Wait for wizard to advance to the repos step
    await expect(
      sharedPage.getByRole("heading", { name: "Add Repositories" }),
    ).toBeVisible({ timeout: 10000 });

    // Verify the project name is displayed
    await expect(
      sharedPage.getByRole("heading", { name: `Project: ${PROJECT_NAME}` }),
    ).toBeVisible();
  });

  test("Test 4: Add a repository (frontend)", async () => {
    // We should be on the repos step from the previous test
    await expect(
      sharedPage.getByRole("heading", { name: "Add Repositories" }),
    ).toBeVisible();

    // Fill in frontend repo details
    await sharedPage.locator('input[placeholder="Repository name"]').fill("frontend");
    await sharedPage.locator('input[placeholder*="Local path"]').fill(FRONTEND_FIXTURE);
    await sharedPage.getByRole("button", { name: "Add" }).click();

    // Wait for repo to appear in the list
    await expect(
      sharedPage.locator(".wizard__repo-name", { hasText: "frontend" }),
    ).toBeVisible({ timeout: 15000 });

    // Verify language was detected
    const repoItem = sharedPage.locator(".wizard__repo-item").first();
    await expect(repoItem.locator(".badge")).toBeVisible();
    const langText = await repoItem.locator(".badge").textContent();
    expect(langText?.toLowerCase()).toContain("typescript");

    // Verify the repo path is shown
    await expect(repoItem.locator(".wizard__repo-path")).toContainText("fixtures/frontend");
  });

  test("Test 5: Add a second repository (backend)", async () => {
    // Add backend repo
    await sharedPage.locator('input[placeholder="Repository name"]').fill("backend");
    await sharedPage.locator('input[placeholder*="Local path"]').fill(BACKEND_FIXTURE);
    await sharedPage.getByRole("button", { name: "Add" }).click();

    // Wait for both repos to appear
    await expect(sharedPage.locator(".wizard__repo-item")).toHaveCount(2, {
      timeout: 15000,
    });

    // Verify both repos are listed
    await expect(
      sharedPage.locator(".wizard__repo-name", { hasText: "frontend" }),
    ).toBeVisible();
    await expect(
      sharedPage.locator(".wizard__repo-name", { hasText: "backend" }),
    ).toBeVisible();

    // Verify the Analyze button shows correct count
    await expect(
      sharedPage.getByRole("button", { name: "Analyze 2 Repositories" }),
    ).toBeEnabled();
  });

  test("Test 6: Trigger analysis and wait for completion", async () => {
    test.setTimeout(90000);

    // Click Analyze
    await sharedPage.getByRole("button", { name: /Analyze \d+ Repositor/ }).click();

    // Verify the progress/analyzing view appears
    await expect(
      sharedPage.getByRole("heading", { name: /Analyzing/ }),
    ).toBeVisible({ timeout: 10000 });

    // The "Starting analysis..." loading text should appear initially
    // (may be very brief, so we don't assert it strictly)

    // Wait for analysis to complete. The backend/Python analyzer will fail
    // (no confianalyzer_python module installed) but the pipeline still
    // completes successfully with frontend/TypeScript results.
    await expect(
      sharedPage.getByRole("heading", { name: "Analysis Complete!" }),
    ).toBeVisible({ timeout: 60000 });

    // Verify the result summary shows function/file/endpoint counts
    const resultDiv = sharedPage.locator(".wizard__result");
    await expect(resultDiv).toBeVisible();
    const resultText = await resultDiv.textContent();
    expect(resultText).toMatch(/\d+ functions/);
    expect(resultText).toMatch(/\d+ files/);
    expect(resultText).toMatch(/\d+ endpoints/);

    // Verify "Explore Dashboard" button appears
    await expect(
      sharedPage.getByRole("button", { name: "Explore Dashboard" }),
    ).toBeVisible();
  });

  test("Test 7: Navigate to dashboard and see results", async () => {
    // Click Explore Dashboard
    await sharedPage.getByRole("button", { name: "Explore Dashboard" }).click();
    await expect(sharedPage).toHaveURL(/\/$/);

    // Dashboard should show the project card
    const projectCard = sharedPage
      .locator(".project-card")
      .filter({ hasText: PROJECT_NAME })
      .first();
    await expect(projectCard).toBeVisible({ timeout: 10000 });

    // Project card shows repository count > 0
    await expect(
      projectCard.locator(".text-muted", { hasText: /\d+ repositories/ }),
    ).toBeVisible();

    // Click the project card to view summary
    await projectCard.click();

    // Wait for stat cards to load
    await expect(sharedPage.locator(".stat-cards")).toBeVisible({ timeout: 10000 });

    // Verify Repositories count > 0
    const repoStat = sharedPage.locator(".stat-card").filter({
      has: sharedPage.locator(".stat-card__label", { hasText: "Repositories" }),
    });
    await expect(repoStat).toBeVisible();
    const repoCount = await repoStat.locator(".stat-card__value").textContent();
    expect(Number(repoCount)).toBeGreaterThan(0);

    // Verify Functions count > 0
    const fnStat = sharedPage.locator(".stat-card").filter({
      has: sharedPage.locator(".stat-card__label", { hasText: "Functions" }),
    });
    const fnCount = await fnStat.locator(".stat-card__value").textContent();
    expect(Number(fnCount)).toBeGreaterThan(0);

    // Verify Files count > 0
    const fileStat = sharedPage.locator(".stat-card").filter({
      has: sharedPage.locator(".stat-card__label", { hasText: "Files" }),
    });
    const fileCount = await fileStat.locator(".stat-card__value").textContent();
    expect(Number(fileCount)).toBeGreaterThan(0);

    // Verify the frontend repo is listed in the repositories section
    await expect(
      sharedPage.locator(".repo-card__name", { hasText: "frontend" }),
    ).toBeVisible();
  });

  test("Test 8: Cleanup test data", async ({ request }) => {
    // Clean up only our test project, leaving other projects intact
    await cleanupTestProject(request, PROJECT_NAME);

    // Verify our test project was removed (other projects may still exist)
    const res = await request.get(`${API_BASE}/projects`);
    expect(res.ok()).toBeTruthy();
    const projects = (await res.json()) as Array<{ name: string }>;
    const testProject = projects.find((p) => p.name === PROJECT_NAME);
    expect(testProject).toBeUndefined();
  });
});
