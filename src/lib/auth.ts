import { cache } from "react";
import { createClient } from "./supabase/server";

export function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export type Identity = { userId: string; displayName: string | null; email: string | null };

function toIdentity(userId: unknown, email: unknown, userMetadata: unknown): Identity | null {
  if (typeof userId !== "string") return null;
  const metadata = userMetadata && typeof userMetadata === "object"
    ? userMetadata as Record<string, unknown>
    : {};
  return {
    userId,
    displayName: typeof metadata.full_name === "string"
      ? metadata.full_name
      : typeof metadata.name === "string" ? metadata.name : null,
    email: typeof email === "string" ? email : null,
  };
}

// Claims are signature-verified and can be checked locally when the project
// uses asymmetric signing keys, avoiding a network call to Supabase Auth.
export const currentIdentity = cache(async (): Promise<Identity | null> => {
  if (!supabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  const { claims } = data;
  return toIdentity(claims.sub, claims.email, claims.user_metadata);
});

// Keep privileged admin checks fresh against Supabase Auth instead of relying
// on claims that may remain valid until the access token expires.
export const currentIdentityFresh = cache(async (): Promise<Identity | null> => {
  if (!supabaseConfigured()) return null;
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return toIdentity(user.id, user.email, user.user_metadata);
});
