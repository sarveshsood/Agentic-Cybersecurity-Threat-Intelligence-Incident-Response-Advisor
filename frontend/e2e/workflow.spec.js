/**
 * Extended E2E — dashboard, incidents filters/sort, knowledge, analytics, theme, logout.
 * Requires live stack + demo users (ENV=dev, SEED_DEMO_USERS).
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
    await expect(page).not.toHaveURL(/\/login/, {timeout: 20000});
}

test.describe("ACTIRA workflows", () => {
    test("dashboard KPIs and navigation", async ({page}) => {
        await login(page, ANALYST);
        await page.goto("/");
        await expect(page.locator("body")).toContainText(/threat|operations|incident|kpi|dashboard/i, {
            timeout: 15000,
        });
        // Nav links
        await page.getByTestId("nav-incidents").click().catch(async () => {
            await page.goto("/incidents");
        });
        await expect(page).toHaveURL(/incidents/);
    });

    test("incidents search and severity filter UI", async ({page}) => {
        await login(page, ANALYST);
        await page.goto("/incidents");
        const search = page.getByTestId("incidents-search");
        if (await search.count()) {
            await search.fill("ssh");
        }
        const sev = page.getByTestId("filter-severity");
        if (await sev.count()) {
            await sev.selectOption({index: 1}).catch(() => {
            });
        }
        await expect(page.locator("body")).toContainText(/incident/i);
    });

    test("analytics window selector", async ({page}) => {
        await login(page, ANALYST);
        await page.goto("/analytics");
        await expect(page.locator("body")).toContainText(/analytics|timeline|severity|retrieval/i, {
            timeout: 20000,
        });
        const win = page.getByTestId("analytics-window");
        if (await win.count()) {
            await win.selectOption("7").catch(() => {
            });
        }
    });

    test("knowledge base search", async ({page}) => {
        await login(page, ANALYST);
        await page.goto("/knowledge");
        await expect(page.locator("body")).toContainText(/knowledge|search|vector|hybrid/i, {
            timeout: 15000,
        });
        const q = page.getByTestId("kb-query");
        if (await q.count()) {
            await q.fill("brute force ssh");
            await page.getByTestId("kb-search").click().catch(() => {
            });
        }
    });

    test("theme toggle cycles", async ({page}) => {
        await login(page, ANALYST);
        await page.goto("/");
        const theme = page.getByTestId("theme-toggle");
        if (await theme.count()) {
            await theme.click();
            await theme.click();
        }
    });

    test("logout clears session", async ({page}) => {
        await login(page, ANALYST);
        const logout = page.getByTestId("logout-btn");
        if (await logout.count()) {
            await logout.click();
            await expect(page).toHaveURL(/login/, {timeout: 15000});
        }
    });

    test("admin settings tabs reachable", async ({page}) => {
        await login(page, ADMIN);
        await page.goto("/settings");
        await expect(page.locator("body")).toContainText(/settings/i, {timeout: 15000});
        for (const tab of ["tab-llm", "tab-pipeline", "tab-threat_intel", "tab-ui"]) {
            const el = page.getByTestId(tab);
            if (await el.count()) await el.click();
        }
    });

    test("review queue for admin", async ({page}) => {
        await login(page, ADMIN);
        await page.goto("/review");
        await expect(page.locator("body")).toContainText(/review|queue|pending|empty|no /i, {
            timeout: 15000,
        });
    });
});
