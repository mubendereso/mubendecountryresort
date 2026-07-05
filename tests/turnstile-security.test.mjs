import assert from "node:assert/strict";
import test from "node:test";
import { verifyTurnstileToken } from "../lib/turnstile-core.ts";

test("fails closed without a Turnstile secret", async () => {
  let fetchCalls = 0;
  const verified = await verifyTurnstileToken({
    secret: "  ",
    token: "attacker-controlled-token",
    remoteIp: "203.0.113.10",
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("fetch should not run");
    }
  });

  assert.equal(verified, false);
  assert.equal(fetchCalls, 0);
});

test("rejects missing and oversized tokens before verification", async () => {
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    return { ok: true, json: async () => ({ success: true }) };
  };

  assert.equal(await verifyTurnstileToken({
    secret: "secret",
    token: "",
    remoteIp: "unknown",
    fetchImpl
  }), false);
  assert.equal(await verifyTurnstileToken({
    secret: "secret",
    token: "x".repeat(2049),
    remoteIp: "unknown",
    fetchImpl
  }), false);
  assert.equal(fetchCalls, 0);
});

test("accepts only an explicit successful Siteverify response", async () => {
  let request;
  const verified = await verifyTurnstileToken({
    secret: " server-secret ",
    token: " valid-token ",
    remoteIp: "203.0.113.10",
    createIdempotencyKey: () => "test-idempotency-key",
    fetchImpl: async (url, init) => {
      request = { url, init };
      return { ok: true, json: async () => ({ success: true }) };
    }
  });

  assert.equal(verified, true);
  assert.equal(request.url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
  assert.deepEqual(JSON.parse(request.init.body), {
    secret: "server-secret",
    response: "valid-token",
    remoteip: "203.0.113.10",
    idempotency_key: "test-idempotency-key"
  });
});

test("rejects unsuccessful and malformed Siteverify responses", async () => {
  assert.equal(await verifyTurnstileToken({
    secret: "secret",
    token: "token",
    remoteIp: "unknown",
    fetchImpl: async () => ({ ok: false, json: async () => ({ success: true }) })
  }), false);

  assert.equal(await verifyTurnstileToken({
    secret: "secret",
    token: "token",
    remoteIp: "unknown",
    fetchImpl: async () => ({ ok: true, json: async () => ({ success: false }) })
  }), false);

  assert.equal(await verifyTurnstileToken({
    secret: "secret",
    token: "token",
    remoteIp: "unknown",
    fetchImpl: async () => ({ ok: true, json: async () => ({}) })
  }), false);
});

test("fails closed when Siteverify cannot be reached", async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    assert.equal(await verifyTurnstileToken({
      secret: "secret",
      token: "token",
      remoteIp: "unknown",
      fetchImpl: async () => {
        throw new Error("network unavailable");
      }
    }), false);
  } finally {
    console.error = originalConsoleError;
  }
});
