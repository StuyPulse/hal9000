import assert from "node:assert/strict";
import test from "node:test";
import { isAuthorizedEmail } from "./allowed-email";

const lookup = async (email: string) => new Set(["seb@sebastianw.tech", "dommasiello27@gmail.com", "new@example.com"]).has(email);

test("looks up normalized external emails, including newly added accounts", async () => {
  for (const email of ["dommasiello27@gmail.com", " DOMMASIELLO27@GMAIL.COM ", "seb@sebastianw.tech", "NEW@example.com"]) {
    assert.equal(await isAuthorizedEmail(email, lookup), true);
  }
});

test("StuyPulse accounts do not need an exception lookup", async () => {
  assert.equal(await isAuthorizedEmail("scout@stuypulse.com", async () => { throw new Error("Unexpected lookup"); }), true);
});

test("rejects unauthorized addresses and invalid or misleading domains", async () => {
  for (const email of ["other@gmail.com", "dommasiello27+other@gmail.com", "dommasiello27@gmail.com.example.com", "a@fake-stuypulse.com", "a@@stuypulse.com", "not an email"]) {
    assert.equal(await isAuthorizedEmail(email, lookup), false);
  }
});
