import assert from "node:assert/strict";
import test from "node:test";
import cspModule from "../lib/security/csp.cjs";

const { buildStorefrontContentSecurityPolicy } = cspModule;

function directive(policy, name) {
  return policy.split(";").map((entry) => entry.trim()).find((entry) => entry.startsWith(`${name} `)) ?? "";
}

test("storefront production CSP defaults to same-origin and blocks unsafe embedding", () => {
  const policy = buildStorefrontContentSecurityPolicy();

  assert.equal(directive(policy, "default-src"), "default-src 'self'");
  assert.equal(directive(policy, "frame-ancestors"), "frame-ancestors 'none'");
  assert.equal(directive(policy, "object-src"), "object-src 'none'");
  assert.equal(directive(policy, "base-uri"), "base-uri 'self'");
  assert.equal(directive(policy, "form-action"), "form-action 'self'");
  assert.match(policy, /(?:^|; )upgrade-insecure-requests;/);
  assert.doesNotMatch(policy, /[\r\n]/);
});

test("storefront CSP admits Turnstile scripts, frames, and verification connections", () => {
  const policy = buildStorefrontContentSecurityPolicy();

  assert.match(directive(policy, "script-src"), /https:\/\/challenges\.cloudflare\.com/);
  assert.match(directive(policy, "connect-src"), /https:\/\/challenges\.cloudflare\.com/);
  assert.equal(directive(policy, "frame-src"), "frame-src https://challenges.cloudflare.com");
});

test("storefront production CSP excludes general unsafe-eval", () => {
  const scripts = directive(buildStorefrontContentSecurityPolicy(), "script-src");
  assert.doesNotMatch(scripts, /(?:^| )'unsafe-eval'(?: |$)/);
});

test("storefront development CSP permits Next hot reload without weakening production", () => {
  const policy = buildStorefrontContentSecurityPolicy({ isDevelopment: true });

  assert.match(directive(policy, "script-src"), /(?:^| )'unsafe-eval'(?: |$)/);
  assert.match(directive(policy, "connect-src"), / ws: wss:$/);
  assert.doesNotMatch(policy, /upgrade-insecure-requests/);
});

test("storefront image policy allows current media hosts and rejects hostname injection", () => {
  const valid = buildStorefrontContentSecurityPolicy({ r2PublicHostname: "media.example.com" });
  const injected = buildStorefrontContentSecurityPolicy({
    r2PublicHostname: "media.example.com; script-src https://evil.example"
  });
  const images = directive(valid, "img-src");

  assert.match(images, /https:\/\/images\.unsplash\.com/);
  assert.match(images, /https:\/\/\*\.r2\.dev/);
  assert.match(images, /https:\/\/media\.example\.com/);
  assert.doesNotMatch(injected, /evil\.example/);
});
