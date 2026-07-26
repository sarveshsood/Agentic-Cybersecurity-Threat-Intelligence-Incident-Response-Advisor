/**
 * Theme visual regression — light / dark shell screenshots.
 *
 * Snapshots land under e2e/theme-visual.spec.js-snapshots/ (or platform-specific).
 * Update: npx playwright test e2e/theme-visual.spec.js --update-snapshots
 *
 * Requires backend + frontend running (same as smoke).
 */

const {test, expect} = require("@playwright/test");

const ADMIN = {
    email: process.env.SMOKE_ADMIN_EMAIL || "admin@soc.example.com",
    password: process.env.SMOKE_ADMIN_PASSWORD || "Admin123!",
};

/** Routes exercised in both themes (authenticated shell). */
const AUTH_PAGES = [
    {path: "/", testid: "dashboard-page", name: "dashboard"},
    {path: "/incidents", testid: "incidents-page", name: "incidents"},
    {path: "/analytics", testid: "analytics-page", name: "analytics"},
    {path: "/upload", testid: "upload-page", name: "upload"},
    {path: "/knowledge", testid: "knowledge-page", name: "knowledge"},
    {path: "/roadmap", testid: "roadmap-page", name: "roadmap"},
    {path: "/settings", testid: "settings-page", name: "settings"},
    {path: "/benchmark", testid: "golden-benchmark-page", name: "benchmark"},
];

async function login(page, creds) {
    await page.goto("/login");
    await page.locator('input[type="email"], input[name="email"]').first().fill(creds.email);
    await page.locator('input[type="password"]').first().fill(creds.password);
    await page.getByRole("button", {name: /sign in|log in|login/i}).first().click();
    await expect(page).not.toHaveURL(/\/login/, {timeout: 15000});
}

async function forceTheme(page, mode) {
    await page.evaluate((m) => {
        localStorage.setItem("soc_theme", m);
    }, mode);
    await page.reload();
    await page.waitForTimeout(350);
    const resolved = await page.evaluate(() =>
        document.documentElement.getAttribute("data-theme") ||
        (document.documentElement.classList.contains("dark") ? "dark" : "light"),
    );
    expect(resolved).toBe(mode);
}

test.describe("Theme visual regression", () => {
    test.beforeEach(async ({page}) => {
        await page.setViewportSize({width: 1280, height: 800});
    });

    test("login page light and dark", async ({page}) => {
        await page.goto("/login");
        await forceTheme(page, "light");
        await expect(page.getByTestId("auth-form")).toBeVisible({timeout: 10000});
        await expect(page).toHaveScreenshot("login-light.png", {
            fullPage: true,
            maxDiffPixelRatio: 0.03,
        });

        await forceTheme(page, "dark");
        await expect(page.getByTestId("auth-form")).toBeVisible({timeout: 10000});
        await expect(page).toHaveScreenshot("login-dark.png", {
            fullPage: true,
            maxDiffPixelRatio: 0.03,
        });
    });

    test("dashboard shell light and dark + collapsed sidebar", async ({page}) => {
        await page.evaluate(() => {
            localStorage.setItem("soc_theme", "dark");
            localStorage.setItem("actira_sidebar_collapsed", "0");
        });
        await login(page, ADMIN);
        await page.goto("/");
        await expect(page.getByTestId("dashboard-page")).toBeVisible({timeout: 15000});
        await expect(page.getByTestId("app-sidebar")).toBeVisible();

        await expect(page).toHaveScreenshot("dashboard-dark-expanded.png", {
            fullPage: false,
            maxDiffPixelRatio: 0.04,
        });

        await forceTheme(page, "light");
        await page.goto("/");
        await expect(page.getByTestId("dashboard-page")).toBeVisible({timeout: 15000});
        await expect(page).toHaveScreenshot("dashboard-light-expanded.png", {
            fullPage: false,
            maxDiffPixelRatio: 0.04,
        });

        await page.getByTestId("sidebar-toggle").click();
        await expect(page.locator('[data-sidebar="collapsed"]')).toBeVisible({timeout: 3000});
        await expect(page).toHaveScreenshot("dashboard-light-collapsed.png", {
            fullPage: false,
            maxDiffPixelRatio: 0.04,
        });
    });

    for (const theme of ["light", "dark"]) {
        test(`authenticated pages — ${theme}`, async ({page}) => {
            await page.evaluate((m) => {
                localStorage.setItem("soc_theme", m);
                localStorage.setItem("actira_sidebar_collapsed", "0");
            }, theme);
            await login(page, ADMIN);
            await forceTheme(page, theme);

            for (const route of AUTH_PAGES) {
                await page.goto(route.path);
                const root = page.getByTestId(route.testid);
                // Some pages use alternate wrappers; fall back to main content
                const visible = await root.isVisible().catch(() => false);
                if (visible) {
                    await expect(root).toBeVisible({timeout: 15000});
                } else {
                    await expect(page.locator("main, [data-testid='app-shell'], body")).toBeVisible();
                }
                // Settling charts / KPI fetch
                await page.waitForTimeout(400);
                await expect(page).toHaveScreenshot(`${route.name}-${theme}.png`, {
                    fullPage: false,
                    maxDiffPixelRatio: 0.05,
                });
            }
        });
    }

    test("incidents table chrome light and dark", async ({page}) => {
        await page.evaluate(() => {
            localStorage.setItem("soc_theme", "light");
            localStorage.setItem("actira_sidebar_collapsed", "0");
        });
        await login(page, ADMIN);
        await forceTheme(page, "light");
        await page.goto("/incidents");
        await expect(page.getByTestId("incidents-page")).toBeVisible({timeout: 15000});
        const table = page.getByTestId("incidents-table");
        if (await table.isVisible().catch(() => false)) {
            await expect(table).toHaveScreenshot("incidents-table-light.png", {
                maxDiffPixelRatio: 0.05,
            });
        }
        await forceTheme(page, "dark");
        await page.goto("/incidents");
        await expect(page.getByTestId("incidents-page")).toBeVisible({timeout: 15000});
        if (await page.getByTestId("incidents-table").isVisible().catch(() => false)) {
            await expect(page.getByTestId("incidents-table")).toHaveScreenshot("incidents-table-dark.png", {
                maxDiffPixelRatio: 0.05,
            });
        }
    });
});
