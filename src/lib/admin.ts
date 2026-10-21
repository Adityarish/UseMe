import type { currentIdentity } from "./auth";
import { env } from "./env";
import { ApiError } from "./http";

type Identity = NonNullable<Awaited<ReturnType<typeof currentIdentity>>>;

function configuredAdminEmails(): Set<string> {
  return new Set(env().ADMIN_EMAILS.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
}

export function isAdmin(identity: Awaited<ReturnType<typeof currentIdentity>>): identity is Identity {
  return Boolean(identity?.email && configuredAdminEmails().has(identity.email.toLowerCase()));
}

export function requireAdmin(identity: Awaited<ReturnType<typeof currentIdentity>>): Identity {
  if (!identity) throw new ApiError(401, "Sign in to access moderation.", "AUTH_REQUIRED");
  if (!isAdmin(identity)) throw new ApiError(403, "Administrator access is required.", "ADMIN_REQUIRED");
  return identity;
}
