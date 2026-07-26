/**
 * Minimal ACTIRA API client example (Node 18+).
 *
 *   set ACTIRA_BASE=http://127.0.0.1:8001
 *   node examples/javascript/quickstart_client.mjs
 */
const BASE = (process.env.ACTIRA_BASE || "http://127.0.0.1:8001").replace(/\/$/, "");
const EMAIL = process.env.ACTIRA_EMAIL || "analyst@soc.example.com";
const PASSWORD = process.env.ACTIRA_PASSWORD || "Analyst123!";

async function main() {
    const health = await fetch(`${BASE}/api/health`);
    console.log("health:", await health.json());

    const loginRes = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({email: EMAIL, password: PASSWORD}),
    });
    if (!loginRes.ok) throw new Error(`login ${loginRes.status}`);
    const login = await loginRes.json();
    const token = login.access_token;
    if (!token) throw new Error("no access_token (cookie-only?)");

    const incRes = await fetch(`${BASE}/api/incidents`, {
        headers: {Authorization: `Bearer ${token}`},
    });
    if (!incRes.ok) throw new Error(`incidents ${incRes.status}`);
    const body = await incRes.json();
    const items = Array.isArray(body) ? body : body.items || body.incidents || body;
    console.log("incidents:", Array.isArray(items) ? items.length : "?");
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
