/**
 * Lightweight pure-TypeScript binary image verifier and header dimension parser.
 * Validates magic bytes (never trusts file extensions alone) and extracts
 * pixel dimensions without imposing any width/height restrictions.
 */

export type SupportedImageMime =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif"
  | "image/avif";

export interface InspectedImageMetadata {
  mimeType: SupportedImageMime;
  ext: "jpg" | "png" | "webp" | "gif" | "avif";
  width: number | null;
  height: number | null;
}

const MIME_TO_EXT: Record<SupportedImageMime, InspectedImageMetadata["ext"]> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export function detectImageMimeFromBytes(buf: Buffer): SupportedImageMime | null {
  if (buf.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "image/png";
  }

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  // GIF: "GIF87a" or "GIF89a"
  const gifHeader = buf.toString("ascii", 0, 6);
  if (gifHeader === "GIF87a" || gifHeader === "GIF89a") {
    return "image/gif";
  }

  // AVIF / ISOBMFF: .... "ftypavif" or "ftypavis"
  if (buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12);
    if (brand === "avif" || brand === "avis") {
      return "image/avif";
    }
  }

  return null;
}

function parsePngDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (width > 0 && height > 0) return { width, height };
  return null;
}

function parseGifDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 10) return null;
  const width = buf.readUInt16LE(6);
  const height = buf.readUInt16LE(8);
  if (width > 0 && height > 0) return { width, height };
  return null;
}

function parseJpegDimensions(buf: Buffer): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 4 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buf[offset + 1];
    // Standalone markers without length
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }
    if (marker === 0xda) break; // Start of Scan
    if (offset + 4 > buf.length) break;
    const segmentLength = buf.readUInt16BE(offset + 2);
    if (segmentLength < 2) break;

    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof && offset + 9 <= buf.length) {
      const height = buf.readUInt16BE(offset + 5);
      const width = buf.readUInt16BE(offset + 7);
      if (width > 0 && height > 0) return { width, height };
      break;
    }
    offset += 2 + segmentLength;
  }
  return null;
}

function parseWebpDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 30) return null;
  const chunk = buf.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    const w = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
    const h = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
    return w > 0 && h > 0 ? { width: w, height: h } : null;
  }
  if (chunk === "VP8L") {
    const b0 = buf[21];
    const b1 = buf[22];
    const b2 = buf[23];
    const b3 = buf[24];
    const w = 1 + (((b1 & 0x3f) << 8) | b0);
    const h = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    return w > 0 && h > 0 ? { width: w, height: h } : null;
  }
  if (chunk === "VP8 ") {
    if (buf[23] === 0x9d && buf[24] === 0x01 && buf[25] === 0x2a) {
      const w = buf.readUInt16LE(26) & 0x3fff;
      const h = buf.readUInt16LE(28) & 0x3fff;
      return w > 0 && h > 0 ? { width: w, height: h } : null;
    }
  }
  return null;
}

export function extractImageDimensions(
  buf: Buffer,
  mimeType: SupportedImageMime
): { width: number; height: number } | null {
  try {
    if (mimeType === "image/png") return parsePngDimensions(buf);
    if (mimeType === "image/gif") return parseGifDimensions(buf);
    if (mimeType === "image/jpeg") return parseJpegDimensions(buf);
    if (mimeType === "image/webp") return parseWebpDimensions(buf);
  } catch {
    return null;
  }
  return null;
}

export function inspectImageBuffer(
  buf: Buffer,
  claimedMime?: string | null
): InspectedImageMetadata {
  const detected = detectImageMimeFromBytes(buf);
  if (!detected) {
    throw new Error("صيغة الملف غير مدعومة أو الملف تالف. المسموح: JPG, PNG, WebP, GIF, AVIF فقط.");
  }

  if (claimedMime) {
    const normalizedClaim = claimedMime.trim().toLowerCase().replace("image/jpg", "image/jpeg");
    if (normalizedClaim.startsWith("image/") && normalizedClaim !== detected) {
      throw new Error(`نوع الصورة الفعلي (${detected}) لا يطابق الصيغة المصرّح بها (${normalizedClaim}).`);
    }
  }

  const dims = extractImageDimensions(buf, detected);
  return {
    mimeType: detected,
    ext: MIME_TO_EXT[detected],
    width: dims?.width ?? null,
    height: dims?.height ?? null,
  };
}
