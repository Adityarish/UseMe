import { cookies } from "next/headers";
import { Creator } from "@/components/creator";
import { Gone } from "@/components/gone";
import { Viewer } from "@/components/viewer";
import { currentIdentity } from "@/lib/auth";
import { publicClip, slugAvailability } from "@/lib/clip-service";
import { validateSlug } from "@/lib/domain";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ slug: string }> };

export default async function ClipPage({ params }: Context) {
  const route = await params;
  let slug: string;
  try {
    slug = validateSlug(route.slug);
  } catch {
    return <Gone />;
  }
  const availability = await slugAvailability(slug);
  if (availability.available) {
    const config = env();
    return <Creator initialSlug={availability.slug} maxClipBytes={config.MAX_CLIP_BYTES} maxFiles={config.MAX_FILES_PER_CLIP} />;
  }
  let result: Awaited<ReturnType<typeof publicClip>>;
  try {
    result = await publicClip(availability.slug, await cookies(), await currentIdentity());
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 410)) return <Gone />;
    throw error;
  }
  const expiresAt = "expiresAt" in result.clip
    ? result.clip.expiresAt?.toISOString() ?? null
    : undefined;
  const serialized = { ...result.clip, expiresAt };
  return <Viewer key={serialized.slug} access={result.access} clip={serialized} />;
}
