import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { env } from "./env";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code = "REQUEST_FAILED") {
    super(message);
  }
}

export function apiError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Check the highlighted fields.", issues: error.issues } }, { status: 400 });
  }
  console.error(error);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } }, { status: 500 });
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const allowed = new URL(env().NEXT_PUBLIC_APP_URL).origin;
  if (origin !== allowed) throw new ApiError(403, "Invalid request origin.", "INVALID_ORIGIN");
}

export function clientFingerprint(request: Request): string {
  const ip = env().TRUSTED_PROXY === "true"
    ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    : request.headers.get("x-real-ip");
  return createHash("sha256").update(`${ip ?? "unknown"}|${request.headers.get("user-agent") ?? "unknown"}`).digest("hex").slice(0, 32);
}
