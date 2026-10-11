import assert from "node:assert/strict";
import test from "node:test";
import { isAuthorizedEmail } from "./allowed-email";

test("allows the requested external account regardless of case or surrounding spaces", () => {
  assert.equal(isAuthorizedEmail("dommasiello27@gmail.com"), true);
  assert.equal(isAuthorizedEmail(" DOMMASIELLO27@GMAIL.COM "), true);
});

test("preserves existing access while rejecting other external accounts", () => {
  assert.equal(isAuthorizedEmail("scout@stuypulse.com"), true);
  assert.equal(isAuthorizedEmail("seb@sebastianw.tech"), true);
  assert.equal(isAuthorizedEmail("other@gmail.com"), false);
  assert.equal(isAuthorizedEmail("dommasiello27+other@gmail.com"), false);
  assert.equal(isAuthorizedEmail("dommasiello27@gmail.com.example.com"), false);
});
