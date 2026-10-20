import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { slugAvailability } from "@/lib/clip-service";

export async function GET(request: Request) {
  try {
    const slug = new URL(request.url).searchParams.get("slug") ?? "";
    return NextResponse.json(await slugAvailability(slug));
  } catch (error) {
    return apiError(error);
  }
}
