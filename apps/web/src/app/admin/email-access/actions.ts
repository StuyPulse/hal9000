"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { canManageEmailAccess } from "@/lib/auth/email-access";
import type { ActionState } from "@/lib/admin/shared";

export async function addAuthorizedEmail(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!await canManageEmailAccess()) return { error: "You do not have access to manage authorized emails." };
  const parsed = z.string().trim().email().max(254).toLowerCase().safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Enter a valid email address." };
  if (parsed.data.endsWith("@stuypulse.com")) return { success: "StuyPulse email addresses already have access." };
  const supabase = await createClient();
  const { error } = await supabase.from("authorized_emails").insert({ email: parsed.data });
  if (error?.code === "23505") return { success: "That email already has access." };
  if (error) return { error: "Couldn’t add that email. Please try again." };
  revalidatePath("/admin/email-access");
  return { success: `${parsed.data} can now sign in. No invitation was sent.` };
}
