import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { seal, open, isSealed, parseKey } from "../src/secretbox.ts";

const key = randomBytes(32);

test("seal/open round-trips, and two seals of the same text differ", () => {
  const a = seal("oauth-refresh-token", key), b = seal("oauth-refresh-token", key);
  assert.notEqual(a, b);
  assert.ok(isSealed(a));
  assert.equal(open(a, key), "oauth-refresh-token");
  assert.equal(open(b, key), "oauth-refresh-token");
});

test("legacy plaintext opens as-is, null stays null, a wrong key is refused", () => {
  assert.equal(open("plain-old-token", key), "plain-old-token");
  assert.equal(open(null, key), null);
  assert.throws(() => open(seal("x", key), randomBytes(32)));
});

test("parseKey accepts 32 bytes as hex or base64, nothing else", () => {
  assert.equal(parseKey(key.toString("hex"))?.length, 32);
  assert.equal(parseKey(key.toString("base64"))?.length, 32);
  assert.equal(parseKey("short"), null);
  assert.equal(parseKey(undefined), null);
});
