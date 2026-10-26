import jsPDF from 'jspdf';
import { ImageSize, InitialValuesType, LoadedImage } from './types';
import { heicTo, isHeic } from 'heic-to';

const pxToMm = (px: number) => px * 0.264583;
const jpegSofMarkers = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
]);

function returnImageFormat(file: File): 'PNG' | 'JPEG' {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();

  if (type.includes('png') || name.endsWith('.png')) return 'PNG';

  if (
    type.includes('jpeg') ||
    type.includes('jpg') ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg')
  ) {
    return 'JPEG';
  }

  if (type.includes('webp') || name.endsWith('.webp')) return 'JPEG';

  if (type.includes('gif') || name.endsWith('.gif')) return 'JPEG';

  console.warn(`Unsupported format: ${file.type}, defaulting to JPEG`);
  return 'JPEG';
}

async function jpegNeedsNormalization(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return true;

  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return true;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;

    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xda || marker === 0xd9) return false;
    if (
      marker === 0xd8 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      continue;
    }
    if (offset + 1 >= bytes.length) return true;

    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (marker === 0xc4) return true;
    if (jpegSofMarkers.has(marker)) return false;
    if (segmentLength < 2) return true;
    offset += segmentLength;
  }

  return true;
}

async function loadImage(file: File): Promise<LoadedImage> {
  let processedFile = file;

  if (await isHeic(file)) {
    const convertedBlob = await heicTo({
      blob: file,
      type: 'image/jpeg'
    });

    processedFile = new File([convertedBlob], file.name + '.jpg', {
      type: 'image/jpeg'
    });
  }

  const image = new Image();
  const objectUrl = URL.createObjectURL(processedFile);
  image.src = objectUrl;
  await image.decode();
  const format = returnImageFormat(file);
  return {
    image,
    objectUrl,
    format,
    normalizeForPdf:
      format === 'JPEG' && (await jpegNeedsNormalization(processedFile)),
    filename: processedFile.name
  };
}

function normalizeJpeg(image: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not prepare image for PDF conversion');
  }

  context.drawImage(image, 0, 0);
  return canvas;
}

export async function buildPdf(
  files: File[],
  options: InitialValuesType
): Promise<{ pdfFile: File; imageSizes: ImageSize[] }> {
  if (!files.length) {
    throw new Error('No files selected');
  }

  const { pageType, orientation, scale } = options;

  let loadedImages: LoadedImage[] = [];
  const imageSizes: ImageSize[] = [];

  const results = await Promise.all(
    files.map((file) =>
      loadImage(file).catch((err) => {
        console.warn(`Skipping ${file.name}:`, err);
        return null;
      })
    )
  );

  loadedImages = results.filter((img): img is LoadedImage => img !== null);

  if (!loadedImages.length) {
    throw new Error('No images could be loaded');
  }

  const { image: firstImage, filename: firstImageFileName } = loadedImages[0];
  const firstImageWidthMm = pxToMm(firstImage.naturalWidth);
  const firstImageHeightMm = pxToMm(firstImage.naturalHeight);

  try {
    const pdf =
      pageType === 'full'
        ? new jsPDF({
            orientation:
              firstImageWidthMm > firstImageHeightMm ? 'landscape' : 'portrait',
            unit: 'mm',
            format: [firstImageWidthMm, firstImageHeightMm]
          })
        : new jsPDF({
            orientation,
            unit: 'mm',
            format: 'a4'
          });

    pdf.setDisplayMode('fullwidth');

    for (let index = 0; index < loadedImages.length; index += 1) {
      const { image, format, normalizeForPdf } = loadedImages[index];
      const imageWidthMm = pxToMm(image.naturalWidth);
      const imageHeightMm = pxToMm(image.naturalHeight);

      if (index > 0) {
        if (pageType === 'full') {
          pdf.addPage(
            [imageWidthMm, imageHeightMm],
            imageWidthMm > imageHeightMm ? 'landscape' : 'portrait'
          );
        } else {
          pdf.addPage('a4', orientation);
        }
      }

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const widthRatio = pageWidth / image.naturalWidth;
      const heightRatio = pageHeight / image.naturalHeight;
      const fitScale = Math.min(widthRatio, heightRatio);
      const pdfImage = normalizeForPdf ? normalizeJpeg(image) : image;

      const finalWidth =
        pageType === 'full'
          ? pageWidth
          : image.naturalWidth * fitScale * (scale / 100);

      const finalHeight =
        pageType === 'full'
          ? pageHeight
          : image.naturalHeight * fitScale * (scale / 100);

      const x = pageType === 'full' ? 0 : (pageWidth - finalWidth) / 2;
      const y = pageType === 'full' ? 0 : (pageHeight - finalHeight) / 2;

      pdf.addImage(pdfImage, format, x, y, finalWidth, finalHeight);
      imageSizes.push({
        widthMm: imageWidthMm,
        heightMm: imageHeightMm,
        widthPx: image.naturalWidth,
        heightPx: image.naturalHeight
      });
    }

    const blob = pdf.output('blob');
    const firstFileName = firstImageFileName.replace(/\.[^/.]+$/, '');
    const fileName =
      files.length === 1 ? `${firstFileName}.pdf` : 'merged-images.pdf';

    return {
      pdfFile: new File([blob], fileName, { type: 'application/pdf' }),
      imageSizes: imageSizes
    };
  } finally {
    loadedImages.forEach(({ objectUrl }) => URL.revokeObjectURL(objectUrl));
  }
}
