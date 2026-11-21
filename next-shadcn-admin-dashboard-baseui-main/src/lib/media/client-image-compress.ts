"use client";

/**
 * Browser-side optional WebP compression that preserves original pixel dimensions
 * (unconstrained width & height). Used across both the Media Library and Product Form.
 */

export interface PreparedClientImage {
  file: File;
  previewUrl: string;
  compressed: boolean;
  originalBytes: number;
  finalBytes: number;
  width: number | null;
  height: number | null;
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("تعذر قراءة الصورة."));
    reader.readAsDataURL(blob);
  });
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("تعذر فك ترميز الصورة في المتصفح."));
    img.src = src;
  });
}

export async function prepareImageForUpload(
  file: File,
  options: { webpEnabled?: boolean; quality?: number } = {}
): Promise<PreparedClientImage> {
  const originalBytes = file.size;
  const webpEnabled = options.webpEnabled !== false;
  const quality = Math.min(0.95, Math.max(0.5, Number(options.quality ?? 0.85)));

  const objectUrl = URL.createObjectURL(file);
  let width: number | null = null;
  let height: number | null = null;

  try {
    const img = await loadHtmlImage(objectUrl);
    width = img.naturalWidth || null;
    height = img.naturalHeight || null;

    // Skip GIFs to preserve animation, or when admin disabled WebP conversion
    if (!webpEnabled || file.type === "image/gif" || !width || !height) {
      const previewUrl = await readAsDataUrl(file);
      return {
        file,
        previewUrl,
        compressed: false,
        originalBytes,
        finalBytes: file.size,
        width,
        height,
      };
    }

    const canvas = document.createElement("canvas");
    // Unconstrained dimensions: preserve exact original pixel resolution
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      const previewUrl = await readAsDataUrl(file);
      return {
        file,
        previewUrl,
        compressed: false,
        originalBytes,
        finalBytes: file.size,
        width,
        height,
      };
    }

    ctx.drawImage(img, 0, 0, width, height);
    const webpBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/webp", quality)
    );

    if (!webpBlob || webpBlob.size === 0 || webpBlob.size >= originalBytes) {
      const previewUrl = await readAsDataUrl(file);
      return {
        file,
        previewUrl,
        compressed: false,
        originalBytes,
        finalBytes: file.size,
        width,
        height,
      };
    }

    const stem = file.name.replace(/\.[a-z0-9]+$/i, "") || "image";
    const compressedFile = new File([webpBlob], `${stem}.webp`, { type: "image/webp" });
    const previewUrl = await readAsDataUrl(compressedFile);

    return {
      file: compressedFile,
      previewUrl,
      compressed: true,
      originalBytes,
      finalBytes: compressedFile.size,
      width,
      height,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
