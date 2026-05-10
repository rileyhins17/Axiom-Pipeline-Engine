import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/session";
import { getPrisma } from "@/lib/prisma";

const MAX_IMAGE_BYTES = 200_000;

export async function PATCH(request: Request) {
  const authResult = await requireApiSession(request);
  if ("response" in authResult) return authResult.response;

  const { session } = authResult;
  const body = await request.json();
  const { name, image } = body as { name?: string; image?: string | null };

  const data: Record<string, unknown> = {};

  if (name !== undefined) {
    const trimmed = (name ?? "").trim();
    if (trimmed.length < 1 || trimmed.length > 50) {
      return NextResponse.json(
        { error: "Name must be 1–50 characters" },
        { status: 400 }
      );
    }
    data.name = trimmed;
  }

  if (image !== undefined) {
    if (image === null) {
      data.image = null;
    } else if (typeof image === "string") {
      if (!image.startsWith("data:image/")) {
        return NextResponse.json(
          { error: "Image must be a data URI (data:image/...)" },
          { status: 400 }
        );
      }
      const base64Part = image.split(",")[1];
      if (!base64Part) {
        return NextResponse.json(
          { error: "Invalid data URI format" },
          { status: 400 }
        );
      }
      const sizeBytes = Math.ceil((base64Part.length * 3) / 4);
      if (sizeBytes > MAX_IMAGE_BYTES) {
        return NextResponse.json(
          { error: `Image must be under ${MAX_IMAGE_BYTES / 1000}KB` },
          { status: 400 }
        );
      }
      data.image = image;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  const updated = await getPrisma().user.update({
    where: { id: session.user.id },
    data,
  });

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    image: updated.image,
    role: updated.role,
  });
}
