// @ts-check
const {defineConfig, devices} = require("@playwright/test");
const path = require("path");

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

module.exports = defineConfig({
    testDir: "./e2e",
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    reporter: [
        ["list"],
        ["html", {open: "never", outputFolder: "playwright-report"}],
        ["junit", {outputFile: path.join("..", "reports", "playwright-junit.xml")}],
    ],
    timeout: 60_000,
    expect: {
        timeout: 15_000,
        // Theme visual diffs: allow minor anti-alias / font variance
        toHaveScreenshot: {maxDiffPixelRatio: 0.04, animations: "disabled"},
    },
    outputDir: "test-results",
    use: {
        baseURL,
        trace: "on-first-retry",
        screenshot: "only-on-failure",
        video: process.env.CI ? "retain-on-failure" : "off",
    },
    projects: [{name: "chromium", use: {...devices["Desktop Chrome"]}}],
});
