/**
 * ORVA Store — Safe Client-side Image Storage using IndexedDB
 * 
 * Prevents bloating localStorage with raw image binaries while enabling
 * full offline drag-and-drop, preview, and reordering in Demo Mode.
 */

const DB_NAME = "orva_product_images_db";
const DB_VERSION = 1;
const STORE_NAME = "images";

function openDB(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.warn("[product-image-db] IndexedDB open error, falling back to memory");
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

export interface StoredProductImage {
  id: string;
  dataUrl: string;
  name: string;
  size: number;
  type: string;
  createdAt: number;
}

export async function storeProductImage(file: File): Promise<StoredProductImage> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const record: StoredProductImage = {
    id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    dataUrl,
    name: file.name,
    size: file.size,
    type: file.type,
    createdAt: Date.now(),
  };

  const db = await openDB();
  if (db) {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(record);
    } catch (e: any) {
      if (e && (e.name === "QuotaExceededError" || e.code === 22)) {
        throw new Error(
          "QUOTA_EXCEEDED: تم تجاوز الحد المسموح لتخزين الصور في المتصفح. يرجى حذف بعض الصور غير المستخدمة لتحرير المساحة."
        );
      }
      console.warn("[product-image-db] Failed to put image into IDB", e);
    }
  }

  return record;
}

export async function getProductImage(id: string): Promise<StoredProductImage | null> {
  const db = await openDB();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Safely deletes an image from IndexedDB only if no other product uses it.
 */
export async function deleteProductImageById(
  imageIdOrUrl: string,
  otherProducts?: Array<{ images: string[] }>
): Promise<{ deleted: boolean; reason?: string }> {
  // Check if any other product still references this image
  if (otherProducts && Array.isArray(otherProducts)) {
    const isShared = otherProducts.some((p) =>
      p.images.some((img) => img === imageIdOrUrl)
    );
    if (isShared) {
      return { deleted: false, reason: "SHARED_IMAGE" };
    }
  }

  const db = await openDB();
  if (!db) return { deleted: false, reason: "NO_DB" };

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(imageIdOrUrl);
      tx.oncomplete = () => resolve({ deleted: true });
      tx.onerror = () => resolve({ deleted: false, reason: "TX_ERROR" });
    } catch (err: any) {
      resolve({ deleted: false, reason: err.message });
    }
  });
}

/**
 * Scans IndexedDB and deletes images that are not referenced by any active product.
 */
export async function cleanupOrphanImages(
  activeImageReferences: string[]
): Promise<number> {
  const db = await openDB();
  if (!db) return 0;

  const activeSet = new Set(activeImageReferences);
  let cleanedCount = 0;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.openCursor();

      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const img = cursor.value as StoredProductImage;
          if (!activeSet.has(img.id) && !activeSet.has(img.dataUrl)) {
            cursor.delete();
            cleanedCount++;
          }
          cursor.continue();
        } else {
          resolve(cleanedCount);
        }
      };

      req.onerror = () => resolve(cleanedCount);
    } catch {
      resolve(0);
    }
  });
}

