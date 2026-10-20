import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";
import { env } from "./env";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 3, parallelism: 1 });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

type AccessScope = "view" | "edit";

export function signAccessToken(clipId: string, scope: AccessScope, expiresAt: Date): string {
  const payload = Buffer.from(JSON.stringify({ clipId, scope, exp: Math.floor(expiresAt.getTime() / 1000) })).toString("base64url");
  const signature = createHmac("sha256", env().APP_SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyAccessToken(token: string | undefined, clipId: string, scope: AccessScope): boolean {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = createHmac("sha256", env().APP_SECRET).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString()) as { clipId: string; scope: string; exp: number };
    return decoded.clipId === clipId && decoded.scope === scope && decoded.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function viewCookieName(clipId: string): string {
  return `useme_view_${clipId}`;
}

export function editCookieName(clipId: string): string {
  return `useme_edit_${clipId}`;
}

export function oneTimeCookieName(clipId: string): string {
  return `useme_once_${clipId}`;
}
