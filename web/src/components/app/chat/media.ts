// Files for the web chat, prepared in the browser: photos (resized when they are big) and voice notes.
// The backend takes them as base64 and refuses anything over 5 MB.

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
/** Above this, or in a format the backend doesn't take, a photo is redrawn as a JPEG. */
const RESIZE_ABOVE = 1.5 * 1024 * 1024;
const MAX_SIDE = 2048;

export type PreparedImage = { data: string; type: string; previewUrl: string };

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

async function toJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  if (!blob) throw new Error("encode failed");
  return blob;
}

/** A photo ready to send, or the reason it can't be: "type" (not an image we can read) or "size". */
export async function prepareImage(file: File): Promise<PreparedImage | "type" | "size"> {
  let blob: Blob = file;
  if (!IMAGE_TYPES.has(file.type) || file.size > RESIZE_ABOVE) {
    if (!file.type.startsWith("image/")) return "type";
    try {
      blob = await toJpeg(file);
    } catch {
      // Can't redraw it: send it as it is if the backend takes it.
      if (!IMAGE_TYPES.has(file.type)) return "type";
    }
  }
  if (blob.size > MAX_FILE_BYTES) return "size";
  return { data: await blobToBase64(blob), type: blob.type || "image/jpeg", previewUrl: URL.createObjectURL(blob) };
}

/** The best format this browser can record a voice note in (Opus in WebM, or AAC in MP4 on Safari). */
export function recorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return undefined;
}

export function canRecord(): boolean {
  return typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}
