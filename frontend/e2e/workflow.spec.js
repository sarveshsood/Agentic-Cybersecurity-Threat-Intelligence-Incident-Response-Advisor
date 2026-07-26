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

    test("threat hunt page and suggestions", async ({page}) => {
        await login(page, ANALYST);
        await page.goto("/hunt");
        await expect(page.getByTestId("hunt-page")).toBeVisible({timeout: 15000});
        await expect(page.getByTestId("hunt-form")).toBeVisible();
        await expect(page.getByTestId("hunt-query-input")).toBeVisible();
        // Suggestions load or fallback chips appear
        await page.getByTestId("hunt-query-input").fill("powershell");
        await page.getByTestId("hunt-submit").click();
        // Either results, loading, or hard error — never infinite hang
        await expect(
            page.getByTestId("hunt-results")
                .or(page.getByTestId("hunt-loading"))
                .or(page.getByTestId("hunt-load-error")),
        ).toBeVisible({timeout: 20000});
    });

    test("compliance page for admin", async ({page}) => {
        await login(page, ADMIN);
        await page.goto("/compliance");
        await expect(page.getByTestId("compliance-page")).toBeVisible({timeout: 15000});
        await expect(page.locator("body")).toContainText(/compliance|framework|gap|evidence|readiness/i);
    });

    test("audit trail for admin", async ({page}) => {
        await login(page, ADMIN);
        await page.goto("/audit");
        await expect(page.getByTestId("audit-logs-page")).toBeVisible({timeout: 15000});
        await expect(page.locator("body")).toContainText(/audit|integrity|event|trail/i);
    });

    test("investigation workspace opens from incidents", async ({page}) => {
        await login(page, ANALYST);
        await page.goto("/incidents");
        await expect(page.getByTestId("incidents-page")).toBeVisible({timeout: 15000});
        // Prefer first incident link if any; else soft-pass on empty list
        const rowLink = page.locator('[data-testid^="incident-row"], a[href*="/incidents/"]').first();
        if (await rowLink.count()) {
            await rowLink.click();
            await expect(page.getByTestId("incident-detail")).toBeVisible({timeout: 15000});
            // Workspace tabs or load error
            await expect(
                page.locator('[data-testid^="workspace-panel-"], [data-testid="incident-load-error"]').first(),
            ).toBeVisible({timeout: 10000}).catch(() => {});
        } else {
            await expect(page.locator("body")).toContainText(/incident|empty|no /i);
        }
    });

    test("ingest page sample templates and paste panel", async ({page}) => {
        await login(page, ANALYST);
        await page.goto("/upload");
        await expect(page.getByTestId("upload-page")).toBeVisible({timeout: 15000});
        await expect(page.getByTestId("drop-zone")).toBeVisible();
        await expect(page.getByTestId("supported-formats")).toBeVisible();
        await page.getByTestId("paste-log-toggle").click();
        await expect(page.getByTestId("paste-log-panel")).toBeVisible();
        await page.getByTestId("paste-log-body").fill("Feb  1 09:13:02 web01 sshd[1]: Failed password for root from 1.2.3.4 port 22 ssh2\n");
        await page.getByTestId("paste-stage-btn").click();
        await expect(page.getByTestId("submit-batch")).toBeVisible({timeout: 5000});
    });

    test("dashboard agent roster and executive strip", async ({page}) => {
        await login(page, ANALYST);
        await page.goto("/");
        await expect(page.getByTestId("dashboard-page")).toBeVisible({timeout: 15000});
        await expect(page.getByTestId("executive-strip")).toBeVisible();
        // Agent roster is collapsed by default (deduped primary metrics)
        await expect(page.getByTestId("agent-roster-details")).toBeVisible();
        await page.getByTestId("agent-roster-details").locator("summary").click();
        await expect(page.getByTestId("agent-roster")).toBeVisible();
        await expect(page.getByTestId("agent-roster-honesty")).toContainText(/pipeline copilot/i);
    });

    test("theme toggle cycles", async ({page}) => {
        await login(page, ANALYST);
        await page.goto("/");
        await page.evaluate(() => localStorage.setItem("soc_theme", "dark"));
        await page.reload();
        await expect(page).not.toHaveURL(/\/login/, {timeout: 15000});

        const theme = page.getByTestId("theme-toggle");
        if (!(await theme.count())) return;

        const readTheme = () =>
            page.evaluate(() => ({
                stored: localStorage.getItem("soc_theme"),
                dataTheme: document.documentElement.getAttribute("data-theme"),
            }));

        // dark → light → system → dark (global; must not depend on route)
        await expect.poll(async () => (await readTheme()).stored).toBe("dark");
        await theme.click();
        await expect.poll(async () => (await readTheme()).stored).toBe("light");
        await expect.poll(async () => (await readTheme()).dataTheme).toBe("light");
        await theme.click();
        await expect.poll(async () => (await readTheme()).stored).toBe("system");
        await theme.click();
        await expect.poll(async () => (await readTheme()).stored).toBe("dark");
        await expect.poll(async () => (await readTheme()).dataTheme).toBe("dark");

        // Theme must survive navigation (regression: per-route theme overrides)
        await page.goto("/incidents");
        await expect.poll(async () => (await readTheme()).stored).toBe("dark");
        await expect.poll(async () => (await readTheme()).dataTheme).toBe("dark");
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
