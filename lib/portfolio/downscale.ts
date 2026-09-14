/**
 * Shrink a photo in the browser before it is uploaded.
 *
 * A phone camera produces 3-6 MB at 4000px wide. A gallery never shows more
 * than about 1600px, and the shop pays for every byte it stores and serves —
 * so the resizing happens here, on the customer's own device, rather than
 * turning into a storage bill and a slow gallery.
 *
 * Browser-only: it needs createImageBitmap and a canvas. Import it from a
 * client component.
 */
import { MAX_IMAGE_EDGE } from './validation';

export async function downscaleImage(
  file: File,
  maxEdge = MAX_IMAGE_EDGE,
): Promise<{ blob: Blob; contentType: string }> {
  // Anything the canvas cannot repaint faithfully is better left alone.
  if (!file.type.startsWith('image/') || file.type === 'image/gif') {
    return { blob: file, contentType: file.type };
  }

  let bitmap: ImageBitmap;
  try {
    // imageOrientation: EXIF rotation is otherwise lost when drawing to a
    // canvas, and a portrait photo would arrive sideways.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return { blob: file, contentType: file.type }; // let the server size cap decide
  }

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= 1_000_000) {
    bitmap.close();
    return { blob: file, contentType: file.type };
  }

  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    return { blob: file, contentType: file.type };
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const contentType = 'image/webp';
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, contentType, 0.82),
  );

  // A browser that will not produce webp gets to upload the original.
  if (!blob) return { blob: file, contentType: file.type };
  return { blob, contentType };
}
