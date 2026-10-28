// Run against a running build; sends no cookies and never signs in or writes data.
import assert from "node:assert/strict";
const origin = process.argv[2] || "http://localhost:3001";
const paths = ["/", "/users", "/media", "/votes", ...[
  "prompt-chains", "prompt-chain-steps", "prompt-chain-mix", "terms",
  "generation-requests", "generation-examples", "llm-models", "llm-providers",
  "llm-responses", "signup-domains", "whitelisted-emails", "images",
].map(key => `/manage/${key}`)];
for (const path of paths) {
  const response = await fetch(new URL(path, origin), { redirect: "manual" });
  assert.equal(response.status, 307, `${path} must redirect anonymous visitors`);
  assert.equal(new URL(response.headers.get("location"), origin).pathname, "/login", path);
}
const response = await fetch(new URL("/login", origin));
assert.equal(response.status, 200);
assert.match(await response.text(), /Continue with Google/);
console.log(`${paths.length} protected routes redirect to /login; Google login page returns HTTP 200.`);
