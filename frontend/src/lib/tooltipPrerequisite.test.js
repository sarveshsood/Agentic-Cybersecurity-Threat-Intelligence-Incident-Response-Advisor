/**
 * Lightweight Node-runnable tests for tooltip prerequisite policy.
 * Run: node --test frontend/src/lib/tooltipPrerequisite.test.js
 * (or any runner that loads ESM / CJS — this file uses plain asserts via node:test)
 */
const {describe, it, beforeEach} = require("node:test");
const assert = require("node:assert/strict");

// Load as CJS via dynamic path — policy module is ESM-free (no import.meta required for logic).
// We re-implement import by reading through a small require bridge.
async function loadPolicy() {
    // Use dynamic import for ESM
    return import("./tooltipPrerequisite.js");
}

describe("tooltipPrerequisite", () => {
    beforeEach(async () => {
        const m = await loadPolicy();
        m._resetTooltipWarnings();
        process.env.NODE_ENV = "development";
    });

    it("hasTipContent detects tip node and structured fields", async () => {
        const {hasTipContent} = await loadPolicy();
        assert.equal(hasTipContent({tip: true}), true);
        assert.equal(hasTipContent({tipTitle: "X"}), true);
        assert.equal(hasTipContent({tipBody: "Y"}), true);
        assert.equal(hasTipContent({tooltip: "Go"}), true);
        assert.equal(hasTipContent({}), false);
        assert.equal(hasTipContent({tipTitle: "  "}), false);
    });

    it("helpTipPropsFrom builds HelpTip props", async () => {
        const {helpTipPropsFrom} = await loadPolicy();
        const p = helpTipPropsFrom({
            tipTitle: "Threat",
            tipBody: "0–100 composite",
            how: "pipeline",
            tipTestId: "tip-threat",
        });
        assert.equal(p.title, "Threat");
        assert.equal(p.body, "0–100 composite");
        assert.equal(p.how, "pipeline");
        assert.equal(p.testid, "tip-threat");
        assert.equal(helpTipPropsFrom({}), null);
    });

    it("defaultTipCopy covers page/kpi/action", async () => {
        const {defaultTipCopy} = await loadPolicy();
        assert.ok(defaultTipCopy("Incidents", "page").tipBody);
        assert.ok(defaultTipCopy("Threat", "kpi").tipTitle);
        assert.equal(defaultTipCopy("Refresh", "action").tooltip, "Refresh");
    });
});
