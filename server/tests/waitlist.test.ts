import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanEmail } from "../src/waitlist.ts";

test("emails are trimmed, lowercased and shaped like emails", () => {
  assert.equal(cleanEmail("  Max@Example.COM "), "max@example.com");
  assert.equal(cleanEmail("nope"), null);
  assert.equal(cleanEmail("a@b"), null);
  assert.equal(cleanEmail("x".repeat(200) + "@example.com"), null);
  assert.equal(cleanEmail(42), null);
});
