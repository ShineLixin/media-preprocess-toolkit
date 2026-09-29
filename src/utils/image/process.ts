import type { IImageProcessParams, ICropParams, IResizeParams, IFormatParams, IDistortionParams } from '@/types/media';

/**
 * 图片处理工具 - 基于 Canvas API 实现纯前端本地处理
 */

/** 加载图片到 Image 对象 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = src;
  });
}

/**
 * 对 ImageData 应用亮度/对比度/饱和度调整
 * 使用标准色彩空间转换公式
 */
export function applyBasicAdjustments(
  imageData: ImageData,
  params: Pick<IImageProcessParams, 'brightness' | 'contrast' | 'saturation'>
): ImageData {
  const { data } = imageData;
  const brightness = params.brightness / 100; // -1 ~ 1
  const contrast = (params.contrast + 100) / 100; // 0 ~ 2
  const saturation = (params.saturation + 100) / 100; // 0 ~ 2

  const bAdd = brightness * 255;
  const cFactor = contrast;
  const cOffset = (1 - contrast) * 128;
  const sFactor = saturation;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // 亮度
    r += bAdd;
    g += bAdd;
    b += bAdd;

    // 对比度
    r = r * cFactor + cOffset;
    g = g * cFactor + cOffset;
    b = b * cFactor + cOffset;

    // 饱和度（基于亮度分量）
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = gray + (r - gray) * sFactor;
    g = gray + (g - gray) * sFactor;
    b = gray + (b - gray) * sFactor;

    data[i] = Math.max(0, Math.min(255, r));
    data[i + 1] = Math.max(0, Math.min(255, g));
    data[i + 2] = Math.max(0, Math.min(255, b));
  }

  return imageData;
}

/**
 * 锐化（USM 简化版）：基于 3x3 拉普拉斯核
 */
export function applySharpen(imageData: ImageData, amount: number): ImageData {
  if (amount <= 0) return imageData;
  const { width: w, height: h, data } = imageData;
  const src = new Uint8ClampedArray(data);
  const factor = amount / 100; // 0 ~ 1

  // 拉普拉斯核 [0, -1, 0, -1, 5, -1, 0, -1, 0]
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  const kernelSum = 1;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      let r = 0, g = 0, b = 0;
      let k = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const sidx = ((y + dy) * w + (x + dx)) * 4;
          r += src[sidx] * kernel[k];
          g += src[sidx + 1] * kernel[k];
          b += src[sidx + 2] * kernel[k];
          k++;
        }
      }
      r = r / kernelSum;
      g = g / kernelSum;
      b = b / kernelSum;
      // 与原图混合，factor 控制锐化强度
      data[idx] = Math.max(0, Math.min(255, src[idx] * (1 - factor) + r * factor));
      data[idx + 1] = Math.max(0, Math.min(255, src[idx + 1] * (1 - factor) + g * factor));
      data[idx + 2] = Math.max(0, Math.min(255, src[idx + 2] * (1 - factor) + b * factor));
    }
  }
  return imageData;
}

/**
 * 降噪（简单均值模糊 3x3）
 * amount 0-100 控制强度
 */
export function applyDenoise(imageData: ImageData, amount: number): ImageData {
  if (amount <= 0) return imageData;
  const { width: w, height: h, data } = imageData;
  const src = new Uint8ClampedArray(data);
  const factor = amount / 100;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      let r = 0, g = 0, b = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const sidx = ((y + dy) * w + (x + dx)) * 4;
          r += src[sidx];
          g += src[sidx + 1];
          b += src[sidx + 2];
        }
      }
      r /= 9;
      g /= 9;
      b /= 9;
      data[idx] = src[idx] * (1 - factor) + r * factor;
      data[idx + 1] = src[idx + 1] * (1 - factor) + g * factor;
      data[idx + 2] = src[idx + 2] * (1 - factor) + b * factor;
    }
  }
  return imageData;
}

/**
 * 完整的图片增强处理（亮度/对比度/饱和度/锐化/降噪）
 * 返回处理后的 canvas
 */
export function processImageEnhance(
  img: HTMLImageElement,
  params: IImageProcessParams
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  applyBasicAdjustments(imageData, params);
  applySharpen(imageData, params.sharpen);
  applyDenoise(imageData, params.denoise);
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * 裁剪图片
 */
export function cropImage(img: HTMLImageElement, crop: ICropParams): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const cx = Math.max(0, Math.min(crop.x, img.naturalWidth));
  const cy = Math.max(0, Math.min(crop.y, img.naturalHeight));
  const cw = Math.max(1, Math.min(crop.width, img.naturalWidth - cx));
  const ch = Math.max(1, Math.min(crop.height, img.naturalHeight - cy));
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.drawImage(img, cx, cy, cw, ch, 0, 0, cw, ch);
  return canvas;
}

/**
 * 缩放图片 - 支持 contain / cover / stretch 三种模式
 * 第一个参数接受 HTMLImageElement 或 HTMLCanvasElement
 */
export function resizeImage(
  src: HTMLImageElement | HTMLCanvasElement,
  targetWidth: number,
  targetHeight: number,
  mode: 'contain' | 'cover' | 'stretch' = 'contain'
): HTMLCanvasElement {
  const srcW = (src as HTMLImageElement).naturalWidth ?? (src as HTMLCanvasElement).width;
  const srcH = (src as HTMLImageElement).naturalHeight ?? (src as HTMLCanvasElement).height;
  const tw = Math.max(1, targetWidth);
  const th = Math.max(1, targetHeight);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  let drawW = tw;
  let drawH = th;
  let offsetX = 0;
  let offsetY = 0;

  if (mode === 'stretch') {
    canvas.width = tw;
    canvas.height = th;
  } else {
    const srcRatio = srcW / srcH;
    const targetRatio = tw / th;

    if (mode === 'contain') {
      // 等比缩放，完整显示
      if (srcRatio > targetRatio) {
        drawW = tw;
        drawH = tw / srcRatio;
        offsetY = (th - drawH) / 2;
      } else {
        drawH = th;
        drawW = th * srcRatio;
        offsetX = (tw - drawW) / 2;
      }
      canvas.width = tw;
      canvas.height = th;
    } else {
      // cover: 等比缩放，填满画布，裁剪超出部分
      if (srcRatio > targetRatio) {
        drawH = th;
        drawW = th * srcRatio;
        offsetX = (tw - drawW) / 2;
      } else {
        drawW = tw;
        drawH = tw / srcRatio;
        offsetY = (th - drawH) / 2;
      }
      canvas.width = tw;
      canvas.height = th;
    }
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src as any, offsetX, offsetY, drawW, drawH);
  return canvas;
}

/**
 * canvas 导出为 Blob
 */
export function canvasToBlob(canvas: HTMLCanvasElement, format: IFormatParams): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas 导出失败'));
      },
      format.format,
      format.quality
    );
  });
}

/**
 * 畸变校正（桶形/枕形畸变）
 * 基于简单的径向畸变模型：r_corrected = r * (1 + k1*r^2 + k2*r^4)
 * 使用反向映射（从目标像素找源像素）+ 双线性插值
 */
export function correctDistortion(
  img: HTMLImageElement,
  params: IDistortionParams
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.drawImage(img, 0, 0);

  const { width: w, height: h } = canvas;
  const srcData = ctx.getImageData(0, 0, w, h);
  const dstData = ctx.createImageData(w, h);
  const src = srcData.data;
  const dst = dstData.data;

  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);
  const { k1, k2 } = params;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const didx = (y * w + x) * 4;

      // 归一化坐标（到中心）
      const nx = (x - cx) / maxR;
      const ny = (y - cy) / maxR;
      const r2 = nx * nx + ny * ny;
      const r4 = r2 * r2;
      const factor = 1 + k1 * r2 + k2 * r4;

      // 反向映射：目标点 (x,y) 对应源点
      const srcNx = nx / factor;
      const srcNy = ny / factor;
      const srcX = srcNx * maxR + cx;
      const srcY = srcNy * maxR + cy;

      if (srcX < 0 || srcX >= w - 1 || srcY < 0 || srcY >= h - 1) {
        dst[didx] = 0;
        dst[didx + 1] = 0;
        dst[didx + 2] = 0;
        dst[didx + 3] = 255;
        continue;
      }

      // 双线性插值
      const x0 = Math.floor(srcX);
      const y0 = Math.floor(srcY);
      const x1 = x0 + 1;
      const y1 = y0 + 1;
      const fx = srcX - x0;
      const fy = srcY - y0;

      for (let c = 0; c < 4; c++) {
        const a = src[(y0 * w + x0) * 4 + c];
        const b = src[(y0 * w + x1) * 4 + c];
        const cc = src[(y1 * w + x0) * 4 + c];
        const d = src[(y1 * w + x1) * 4 + c];
        const top = a * (1 - fx) + b * fx;
        const bottom = cc * (1 - fx) + d * fx;
        dst[didx + c] = top * (1 - fy) + bottom * fy;
      }
    }
  }

  ctx.putImageData(dstData, 0, 0);
  return canvas;
}
