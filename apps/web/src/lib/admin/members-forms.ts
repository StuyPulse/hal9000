"use server";
import { z } from "zod";
import { isAuthorizedEmail } from "@/lib/auth/allowed-email";
import { DEFAULT_2026_FORM, formDefinitionSchema, organizationRoleSchema } from "@wildcard/shared";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { adminContext, type ActionState } from "@/lib/admin/shared";

export async function publishDefaultForm(_: ActionState): Promise<ActionState> { try { const {supabase,organizationId}=await adminContext(); const {data:latest}=await supabase.from("form_definitions").select("version").eq("organization_id",organizationId).eq("name",DEFAULT_2026_FORM.title).order("version",{ascending:false}).limit(1).maybeSingle();const {error}=await supabase.from("form_definitions").insert({organization_id:organizationId,name:DEFAULT_2026_FORM.title,version:(latest?.version??0)+1,schema_json:DEFAULT_2026_FORM,is_active:true});return error?{error:"Couldn’t publish the form."}:{success:"New form version published."}; }catch{return{error:"Admin access is required."};} }

export async function publishFormDefinition(_: ActionState, formData: FormData): Promise<ActionState> { try { const raw=String(formData.get("schema")??"");let json:unknown;try{json=JSON.parse(raw)}catch{return{error:"The form schema must be valid JSON."};}const form=formDefinitionSchema.safeParse(json);if(!form.success)return{error:"The schema needs a title, game year, and valid field definitions."};const {supabase,organizationId}=await adminContext();const {data:latest}=await supabase.from("form_definitions").select("version").eq("organization_id",organizationId).eq("name",form.data.title).order("version",{ascending:false}).limit(1).maybeSingle();const {error}=await supabase.from("form_definitions").insert({organization_id:organizationId,name:form.data.title,version:(latest?.version??0)+1,schema_json:form.data,is_active:true});return error?{error:"Couldn’t publish the form."}:{success:`Published ${form.data.title} v${(latest?.version??0)+1}.`};}catch{return{error:"Admin access is required."};} }

export async function inviteMember(_: ActionState, formData: FormData): Promise<ActionState> { try {const input=z.object({email:z.string().email().toLowerCase().refine(isAuthorizedEmail),role:organizationRoleSchema}).safeParse({email:formData.get("email"),role:formData.get("role")});if(!input.success)return{error:"Invitees must use an authorized email and a valid role."};const {supabase,organizationId}=await adminContext();const admin=createAdminClient();const origin=process.env.NEXT_PUBLIC_SITE_URL??"http://localhost:3000";const {data,error}=await admin.auth.admin.inviteUserByEmail(input.data.email,{redirectTo:`${origin}/auth/callback`});if(error||!data.user)return{error:"Couldn’t send the invitation."};const {error:membershipError}=await supabase.from("organization_members").upsert({organization_id:organizationId,user_id:data.user.id,role:input.data.role});return membershipError?{error:"Invitation sent, but the role assignment failed."}:{success:`Invitation sent to ${input.data.email}.`};}catch{return{error:"Admin access or server secret is required."};} }

export async function setMemberRole(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const input = z.object({ userId: z.string().uuid(), role: organizationRoleSchema }).safeParse({ userId: formData.get("userId"), role: formData.get("role") });
    if (!input.success) return { error: "Choose a valid team role." };
    const { supabase, organizationId } = await adminContext();
    const { data: updated, error } = await supabase.from("organization_members").update({ role: input.data.role }).eq("organization_id", organizationId).eq("user_id", input.data.userId).select("role").maybeSingle();
    if (error || !updated) return { error: "Couldn’t update that role. The final admin account cannot be demoted." };
    revalidatePath("/admin/users"); revalidatePath("/admin/assignments"); revalidatePath("/dashboard");
    return { success: `Role changed to ${updated.role}.` };
  } catch { return { error: "Admin access is required." }; }
}

