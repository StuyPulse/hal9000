"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const credentialsSchema = z.object({ email: z.string().email().toLowerCase().refine((email) => email.endsWith("@stuypulse.com"), "Use your @stuypulse.com email."), password: z.string().min(8).max(128) });
const signupSchema = credentialsSchema.extend({ firstName: z.string().trim().min(1).max(40), lastName: z.string().trim().min(1).max(60) });
export type AuthState = { error?: string; message?: string };

async function existingAccountMessage(email: string) {
  try {
    const { data } = await createAdminClient().auth.admin.listUsers({ page: 1, perPage: 1000 });
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
    const providers = new Set(user?.identities?.map((identity) => identity.provider));
    if (providers.has("google")) return "This email is already linked to Google. Use Continue with Google to sign in, or use Forgot password if you also set a password.";
    if (user) return "An account already exists for this email. Sign in instead, or use Forgot password.";
  } catch { /* Preserve Supabase's safe generic response if the admin client is unavailable. */ }
  return "That account may already exist. Check your email for a confirmation link, or sign in instead.";
}

export async function signIn(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "Use your @stuypulse.com email and an 8+ character password." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "We couldn't sign you in with those details." };
  redirect("/scout/match");
}

export async function signUp(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signupSchema.safeParse({ email: formData.get("email"), password: formData.get("password"), firstName: formData.get("firstName"), lastName: formData.get("lastName") });
  if (!parsed.success) return { error: "Enter your first and last name, @stuypulse.com email, and an 8+ character password." };
  const supabase = await createClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data, error } = await supabase.auth.signUp({ email: parsed.data.email, password: parsed.data.password, options: { emailRedirectTo: `${origin}/auth/callback`, data: { first_name: parsed.data.firstName, last_name: parsed.data.lastName, display_name: `${parsed.data.firstName} ${parsed.data.lastName}` } } });
  if (error) return { error: "We couldn't create that account. Try a different email." };
  if (data.user?.identities?.length === 0) return { message: await existingAccountMessage(parsed.data.email) };
  return { message: "Check your @stuypulse.com inbox to confirm your account, then sign in." };
}

export async function requestPasswordReset(_: AuthState, formData: FormData): Promise<AuthState> {
  const email = z.string().email().toLowerCase().refine((value) => value.endsWith("@stuypulse.com")).safeParse(formData.get("email"));
  if (!email.success) return { error: "Enter your @stuypulse.com email first." };
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: `${origin}/auth/callback?next=/auth/reset-password` });
  if (error) return { error: "We couldn't start password recovery. Please try again." };
  return { message: "If an account exists for that email, a password-reset link is on its way." };
}
