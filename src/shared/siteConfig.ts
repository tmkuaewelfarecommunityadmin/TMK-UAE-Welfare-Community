export interface LandingHighlight {
  id: string;
  titleEn: string;
  titleTa: string;
  bodyEn: string;
  bodyTa: string;
}

export interface LandingSlidePhoto {
  id: string;
  imageDataUrl: string;
  captionEn: string;
  captionTa: string;
}

export interface SiteConfig {
  id: string;
  appTitleEn: string;
  appTitleTa: string;
  logoDataUrl: string | null;
  heroBadgeEn: string | null;
  heroBadgeTa: string | null;
  heroSubtitleEn: string;
  heroSubtitleTa: string;
  highlights: LandingHighlight[];
  sliderPhotos: LandingSlidePhoto[];
}

const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read image file.'));
    reader.readAsDataURL(file);
  });
}

export async function resizeImageToDataUrl(
  file: File,
  options: { maxDim: number; maxBytes: number; preservePng?: boolean }
): Promise<string> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Please choose a PNG, JPG, or WEBP image.');
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Selected file could not be loaded as an image.'));
    img.src = rawDataUrl;
  });

  const scale = Math.min(1, options.maxDim / Math.max(img.width || 1, img.height || 1));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Image processing is not supported in this browser.');
  }
  ctx.drawImage(img, 0, 0, width, height);

  const preferPng = options.preservePng !== false && file.type === 'image/png';
  let result = canvas.toDataURL(preferPng ? 'image/png' : 'image/jpeg', 0.85);

  if (result.length > options.maxBytes * 1.33) {
    result = canvas.toDataURL('image/jpeg', 0.82);
  }
  if (result.length > options.maxBytes * 1.33) {
    result = canvas.toDataURL('image/jpeg', 0.65);
  }

  return result;
}
