/**
 * A-F5: Playwright smoke — login, upload page, review, settings (admin).
 *
 * Prerequisites:
 *   - Backend on REACT_APP_BACKEND_URL (default http://localhost:8001)
 *   - Frontend on PLAYWRIGHT_BASE_URL (default http://localhost:3000)
 *   - Demo users seeded (ENV=dev)
 *
 * Run:
 *   cd frontend
 *   npx playwright install chromium
 *   yarn e2e
 *   # or: npx playwright test
 */

const {test, expect} = require("@playwright/test");

const ADMIN = {
    email: process.env.SMOKE_ADMIN_EMAIL || "admin@soc.example.com",
    password: process.env.SMOKE_ADMIN_PASSWORD || "Admin123!",
};
const ANALYST = {
    email: process.env.SMOKE_ANALYST_EMAIL || "analyst@soc.example.com",
    password: process.env.SMOKE_ANALYST_PASSWORD || "Analyst123!",
};

async function login(page, creds) {
    await page.goto("/login");
    await page.locator('input[type="email"], input[name="email"]').first().fill(creds.email);
    await page.locator('input[type="password"]').first().fill(creds.password);
    await page.getByRole("button", {name: /sign in|log in|login/i}).first().click();
    // Land on dashboard
    await expect(page).not.toHaveURL(/\/login/, {timeout: 15000});
}

test.describe("ACTIRA smoke", () => {
    test("analyst can login and open upload + incidents", async ({page}) => {
        await login(page, ANALYST);
        await page.goto("/upload");
        await expect(page.getByText(/ingest|upload|pipeline/i).first()).toBeVisible({timeout: 10000});
        await page.goto("/incidents");
        await expect(page.locator("body")).toContainText(/incident/i);
    });

    test("analyst cannot open settings (403 or redirect)", async ({page}) => {
        await login(page, ANALYST);
        await page.goto("/settings");
        // Either blocked UI message or bounced to home/login
        const body = await page.locator("body").innerText();
        const blocked =
            /403|insufficient/i.test(body) ||
            !/llm_provider|anthropic|session timeout/i.test(body);
        expect(blocked).toBeTruthy();
    });

    test("admin can open settings and golden eval", async ({page}) => {
        await login(page, ADMIN);
        await page.goto("/settings");
        await expect(page.locator("body")).toContainText(/settings|llm|provider/i, {
            timeout: 10000,
        });
        await page.goto("/benchmark");
        await expect(page.locator("body")).toContainText(/golden|benchmark/i, {
            timeout: 10000,
        });
    });

    test("senior reviewer path: review queue reachable for admin", async ({page}) => {
        // Admin is superuser for review
        await login(page, ADMIN);
        await page.goto("/review");
        await expect(page.locator("body")).toContainText(/review|queue|pending|empty|no /i, {
            timeout: 10000,
        });
    });

    test("command palette opens and navigates to upload", async ({page}) => {
        await login(page, ANALYST);
        await page.goto("/");
        await expect(page.getByTestId("dashboard-page")).toBeVisible({timeout: 15000});
        // Ctrl+K opens palette
        await page.keyboard.press("Control+k");
        await expect(page.getByTestId("command-palette-input")).toBeVisible({timeout: 5000});
        await page.getByTestId("command-palette-input").fill("Ingest");
        await page.getByTestId("cmd-nav-upload").click();
        await expect(page).toHaveURL(/\/upload/, {timeout: 10000});
    });

    test("dashboard quick actions visible after login", async ({page}) => {
        await login(page, ANALYST);
        await page.goto("/");
        await expect(page.getByTestId("dashboard-quick-actions")).toBeVisible({timeout: 15000});
        await expect(page.getByTestId("quick-action-ingest")).toBeVisible();
    });
});
