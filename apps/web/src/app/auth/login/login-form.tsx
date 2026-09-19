"use client";

import { useActionState, useState } from "react";
import { requestPasswordReset, signIn, signUp, type AuthState } from "./actions";
import { createClient } from "@/lib/supabase/client";
import { BrandLogo } from "@/components/brand-logo";

const initial: AuthState = {};

export function LoginForm() {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [loginState, loginAction, pendingLogin] = useActionState(signIn, initial);
  const [signupState, signupAction, pendingSignup] = useActionState(signUp, initial);
  const [resetState, resetAction, pendingReset] = useActionState(requestPasswordReset, initial);
  const [googleError, setGoogleError] = useState<string>();
  const [callbackError] = useState<string | undefined>(() => typeof window === "undefined" ? undefined : new URLSearchParams(window.location.search).get("error") ?? undefined);
  const isSignUp = mode === "sign-up";
  const pending = pendingLogin || pendingSignup || pendingReset;
  const state = isSignUp ? signupState : loginState.error || loginState.message ? loginState : resetState;

  async function signInWithGoogle() {
    setGoogleError(undefined);
    const { error } = await createClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback` } });
    if (error) setGoogleError(error.message === "provider is not enabled" ? "Google sign-in is not configured for this project yet." : "Google sign-in could not start. Please try again.");
  }

  return <form className="auth-form">
    <div className="brand"><BrandLogo/><span>HAL9000<small>STUYPULSE · 694</small></span></div>
    <h1>{isSignUp ? "Create your account." : "Welcome back."}</h1>
    <p>{isSignUp ? "Use an authorized account to join the competition workspace." : <>Only <strong>authorized accounts</strong> can access this competition workspace.</>}</p>
    <button type="button" className="button secondary auth-google" onClick={signInWithGoogle} disabled={pending}><GoogleMark/>Continue with Google</button>
    {googleError && <p className="error">{googleError}</p>}
    <div className="auth-divider"><span>or continue with email</span></div>
    {isSignUp && <div className="form-grid"><div className="field"><label htmlFor="firstName">First name</label><input id="firstName" name="firstName" autoComplete="given-name" placeholder="Ada" required /></div><div className="field"><label htmlFor="lastName">Last name</label><input id="lastName" name="lastName" autoComplete="family-name" placeholder="Lovelace" required /></div></div>}
    <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" placeholder="you@stuypulse.com" required /></div>
    <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete={isSignUp ? "new-password" : "current-password"} placeholder="••••••••" required minLength={8}/></div>
    {callbackError && <p className="error">{callbackError}</p>}{state.error && <p className="error">{state.error}</p>}{state.message && <p className="trend">{state.message}</p>}
    <button className="button" formAction={isSignUp ? signupAction : loginAction} disabled={pending}>{isSignUp ? pendingSignup ? "Creating account…" : "Create account" : pendingLogin ? "Signing in…" : "Sign in"}</button>
    {!isSignUp && <button className="link auth-reset" formAction={resetAction} formNoValidate disabled={pending}>{pendingReset ? "Sending reset link…" : "Forgot password?"}</button>}
    <p className="auth-switch">{isSignUp ? "Already have an account?" : "New to HAL9000?"} <button type="button" onClick={() => setMode(isSignUp ? "sign-in" : "sign-up")}>{isSignUp ? "Sign in" : "Create an account"}</button></p>
    <p className="muted auth-legal"><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p>
  </form>;
}

function GoogleMark() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path fill="#4285F4" d="M21.8 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.5a4.7 4.7 0 0 1-2 3.1v2.5h3.2c1.9-1.8 3.1-4.4 3.1-7.4Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.2-2.5c-.9.6-2 .9-3.5.9-2.7 0-5-1.8-5.9-4.3H2.8v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.1 13.7a6 6 0 0 1 0-3.4V7.7H2.8a10 10 0 0 0 0 8.6l3.3-2.6Z"/><path fill="#EA4335" d="M12 6c1.6 0 3 .6 4.1 1.6l3-3A10 10 0 0 0 2.8 7.7l3.3 2.6C7 7.8 9.3 6 12 6Z"/></svg>;
}
