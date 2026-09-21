import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { userIdFromToken, canEdit } from "../src/auth.ts";

test("a valid token yields its userId", () => {
  const token = jwt.sign({ userId: "u-42" }, "s3cret");
  assert.equal(userIdFromToken(token, "s3cret"), "u-42");
});
test("a forged, expired or missing token yields null", () => {
  assert.equal(userIdFromToken(jwt.sign({ userId: "u-42" }, "other"), "s3cret"), null);
  assert.equal(userIdFromToken(jwt.sign({ userId: "u-42" }, "s3cret", { expiresIn: -1 }), "s3cret"), null);
  assert.equal(userIdFromToken("garbage", "s3cret"), null);
  assert.equal(userIdFromToken(undefined, "s3cret"), null);
  assert.equal(userIdFromToken(jwt.sign({}, "s3cret"), "s3cret"), null);
});
test("only moderators and admins may edit the catalogue", () => {
  assert.equal(canEdit("admin"), true);
  assert.equal(canEdit("moderator"), true);
  assert.equal(canEdit("user"), false);
});
