import { createClient } from "./supabase/server";

export function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export async function currentIdentity(): Promise<{ userId: string; displayName: string | null; email: string | null } | null> {
  if (!supabaseConfigured()) return null;
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const metadata = user.user_metadata as Record<string, unknown>;
  return {
    userId: user.id,
    displayName: typeof metadata.full_name === "string"
      ? metadata.full_name
      : typeof metadata.name === "string" ? metadata.name : null,
    email: user.email ?? null,
  };
}
