import assert from "node:assert/strict";
import test from "node:test";
import { AsyncTtlLruCache } from "../lib/rooms/cache.ts";

test("coalesces concurrent misses for the same key", async () => {
  const cache = new AsyncTtlLruCache({ maxEntries: 4, ttlMs: 1_000 });
  let loads = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const loader = async () => {
    loads += 1;
    await gate;
    return { title: "Deluxe" };
  };

  const reads = [
    cache.read("rooms", loader),
    cache.read("rooms", loader),
    cache.read("rooms", loader)
  ];
  assert.equal(loads, 1);
  assert.equal(cache.pendingSize, 1);
  release();
  const values = await Promise.all(reads);

  assert.equal(values.every((value) => value.title === "Deluxe"), true);
  assert.equal(cache.pendingSize, 0);
  assert.equal(cache.size, 1);
});

test("expires stale entries and does not cache null values", async () => {
  let now = 1_000;
  const cache = new AsyncTtlLruCache({ maxEntries: 2, ttlMs: 100, now: () => now });
  let loads = 0;
  const loadValue = async () => `value-${++loads}`;

  assert.equal(await cache.read("room", loadValue), "value-1");
  assert.equal(await cache.read("room", loadValue), "value-1");
  now += 101;
  assert.equal(await cache.read("room", loadValue), "value-2");

  let nullLoads = 0;
  assert.equal(await cache.read("missing", async () => (++nullLoads, null)), null);
  assert.equal(await cache.read("missing", async () => (++nullLoads, null)), null);
  assert.equal(nullLoads, 2);
});

test("evicts the least-recently-used entry at capacity", async () => {
  const cache = new AsyncTtlLruCache({ maxEntries: 2, ttlMs: 1_000 });
  let bLoads = 0;

  await cache.read("a", async () => "a");
  await cache.read("b", async () => `b-${++bLoads}`);
  await cache.read("a", async () => "unexpected");
  await cache.read("c", async () => "c");

  assert.equal(cache.size, 2);
  assert.equal(await cache.read("b", async () => `b-${++bLoads}`), "b-2");
});

test("clears rejected in-flight loads so a later request can retry", async () => {
  const cache = new AsyncTtlLruCache({ maxEntries: 2, ttlMs: 1_000 });
  await assert.rejects(cache.read("rooms", async () => {
    throw new Error("temporary Neon failure");
  }), /temporary Neon failure/);

  assert.equal(cache.pendingSize, 0);
  assert.equal(await cache.read("rooms", async () => "recovered"), "recovered");
});
