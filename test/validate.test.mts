// Run with: npm test  (Node's built-in test runner; Node 24 strips the types itself)
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSearch, toSearchQuery } from "../src/lib/validate.ts";

test("a blank search term is rejected", () => {
  for (const q of ["", "   ", null, undefined]) {
    const r = validateSearch({ q });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.errors.q ?? "", /Enter something/);
  }
});

test("a negative or invalid maximum price is rejected", () => {
  for (const maxPrice of ["-5", "-0.01", "abc", "12.345", "1e3", "$-3", "Infinity", "NaN", "5,000"]) {
    const r = validateSearch({ q: "hoodie", maxPrice });
    assert.equal(r.ok, false, `expected "${maxPrice}" to be rejected`);
    if (!r.ok) assert.ok(r.errors.maxPrice, `expected a maxPrice error for "${maxPrice}"`);
  }
});

test("valid input is normalised", () => {
  const r = validateSearch({ q: "  Chrome Hearts hoodie ", brand: " Chrome Hearts ", maxPrice: "$300", size: "M" });
  assert.deepEqual(r, {
    ok: true,
    params: { q: "Chrome Hearts hoodie", brand: "Chrome Hearts", size: "M", maxPrice: 300 },
  });
});

test("optional filters are really optional", () => {
  const r = validateSearch({ q: "hoodie", brand: "", maxPrice: "", size: "" });
  assert.deepEqual(r, { ok: true, params: { q: "hoodie" } });
});

test("zero and decimals are valid prices", () => {
  assert.deepEqual(validateSearch({ q: "tee", maxPrice: "0" }), { ok: true, params: { q: "tee", maxPrice: 0 } });
  assert.deepEqual(validateSearch({ q: "tee", maxPrice: "49.99" }), { ok: true, params: { q: "tee", maxPrice: 49.99 } });
});

test("query string round-trips through the validator", () => {
  const params = { q: "vintage jacket", brand: "Levi's", size: "L", maxPrice: 120 };
  const sp = new URLSearchParams(toSearchQuery(params));
  const r = validateSearch({ q: sp.get("q"), brand: sp.get("brand"), size: sp.get("size"), maxPrice: sp.get("maxPrice") });
  assert.deepEqual(r, { ok: true, params });
});

test("sort is optional and only accepts the known orders", () => {
  assert.deepEqual(validateSearch({ q: "tee", sort: "" }), { ok: true, params: { q: "tee" } });
  assert.deepEqual(validateSearch({ q: "tee", sort: "price-desc" }), { ok: true, params: { q: "tee", sort: "price-desc" } });
  const bad = validateSearch({ q: "tee", sort: "cheapest" });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.match(bad.errors.sort ?? "", /price-asc, price-desc/);
  assert.equal(new URLSearchParams(toSearchQuery({ q: "tee", sort: "price-desc" })).get("sort"), "price-desc");
});
