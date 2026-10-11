import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest, NextResponse } from "next/server";
import { authRedirect } from "./redirect-response";

test("auth redirect removes one-time codes and untrusted return destinations", () => {
  const request = new NextRequest("https://hal9000.stuypulse.com/auth/callback?code=private-code&next=https://example.com");
  assert.equal(authRedirect(request, "/scout/match").headers.get("location"), "https://hal9000.stuypulse.com/scout/match");
});
test("failure redirects preserve cleared cookies and only the error query", () => {
  const request = new NextRequest("https://hal9000.stuypulse.com/auth/callback?code=private-code");
  const source = NextResponse.next();
  source.cookies.set("session", "", { maxAge: 0, path: "/", secure: true, httpOnly: true, sameSite: "lax" });
  const result = authRedirect(request, "/auth/login", source, "Sign-in failed");
  assert.equal(new URL(result.headers.get("location")!).searchParams.get("code"), null);
  assert.equal(new URL(result.headers.get("location")!).searchParams.get("error"), "Sign-in failed");
  assert.equal(result.cookies.get("session")?.maxAge, 0);
  assert.equal(result.cookies.get("session")?.httpOnly, true);
});
