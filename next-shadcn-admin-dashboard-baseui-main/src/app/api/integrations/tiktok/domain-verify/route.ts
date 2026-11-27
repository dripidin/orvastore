/**
 * ORVA Store — TikTok URL-Prefix Signature Verification Endpoint
 * Endpoint: /api/integrations/tiktok/domain-verify/
 *
 * - GET ?file=tiktokXXXX.txt  -> Public plain-text responder invoked via Middleware rewrite
 *                                for TikTok's domain ownership verification bot.
 * - GET ?action=list          -> Admin-authenticated listing of active verification files.
 * - POST { fileName, content } -> Admin-authenticated upsert of a signature `.txt` file.
 * - DELETE ?file=...          -> Admin-authenticated removal of a signature `.txt` file.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteTikTokVerificationFile,
  listTikTokVerificationFiles,
  resolveTikTokVerificationFileContent,
  upsertTikTokVerificationFile,
} from "@/lib/integrations/tiktok/domain-verification";
import {
  NO_STORE_HEADERS,
  jsonNoStore,
  parseValidatedJsonBody,
  requireAdminRouteSession,
  resolveCanonicalAppOrigin,
} from "../_lib/route-helpers";

export const dynamic = "force-dynamic";

const upsertSchema = z
  .object({
    fileName: z.string().min(1).max(140),
    content: z.string().min(1).max(600),
  })
  .strict();

const deleteBodySchema = z
  .object({
    fileName: z.string().min(1).max(140),
  })
  .strict();

function serializeEntriesWithUrls(
  request: NextRequest,
  files: Awaited<ReturnType<typeof listTikTokVerificationFiles>>,
) {
  const origin = resolveCanonicalAppOrigin(request);
  return files.map((f) => ({
    ...f,
    publicUrl: `${origin}/${f.fileName}`,
  }));
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = (searchParams.get("action") || "").trim().toLowerCase();

  if (action === "list") {
    const auth = await requireAdminRouteSession(request);
    if (!auth.ok) return auth.response;

    const files = await listTikTokVerificationFiles();
    return jsonNoStore({
      success: true,
      files: serializeEntriesWithUrls(request, files),
    });
  }

  const requestedFile = (searchParams.get("file") || "").trim();
  if (!requestedFile) {
    return new NextResponse("Not Found", {
      status: 404,
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const content = await resolveTikTokVerificationFileContent(requestedFile);
  if (!content) {
    return new NextResponse("Not Found", {
      status: 404,
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  return new NextResponse(request.method === "HEAD" ? null : content, {
    status: 200,
    headers: {
      ...NO_STORE_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function HEAD(request: NextRequest) {
  return GET(request);
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminRouteSession(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseValidatedJsonBody(request, upsertSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const files = await upsertTikTokVerificationFile(parsed.data);
    return jsonNoStore({
      success: true,
      files: serializeEntriesWithUrls(request, files),
    });
  } catch (err) {
    return jsonNoStore(
      {
        success: false,
        error: err instanceof Error ? err.message : "تعذر حفظ ملف التوثيق.",
        code: "INVALID_VERIFICATION_FILE",
      },
      400,
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdminRouteSession(request);
  if (!auth.ok) return auth.response;

  let fileName = (request.nextUrl.searchParams.get("file") || "").trim();
  if (!fileName) {
    const parsed = await parseValidatedJsonBody(request, deleteBodySchema);
    if (!parsed.ok) return parsed.response;
    fileName = parsed.data.fileName;
  }

  const files = await deleteTikTokVerificationFile(fileName);
  return jsonNoStore({
    success: true,
    files: serializeEntriesWithUrls(request, files),
  });
}
