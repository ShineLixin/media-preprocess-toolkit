import type { IAnnotationBox, IAnnotationImage } from '@/types/annotation';
import type { IAugmentConfig, IAugmentedImage } from '@/types/annotation-stats';
import { getColorForLabel } from './formats';
import { applyBasicAdjustments } from '@/utils/image/process';

/**
 * 标注框与图像同步的数据增强工具
 * 所有变换同步更新标注框坐标
 */

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** 从 URL 加载图片 */
function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = url;
  });
}

/** 随机数（含 min，不含 max） */
function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** 从数组中随机取一个 */
function pickOne<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* ──────────────────── 变换: 翻转 ──────────────────── */

/** 水平翻转标注框 */
function flipBoxesHorizontal(boxes: IAnnotationBox[], imgWidth: number): IAnnotationBox[] {
  return boxes.map((b) => ({
    ...b,
    x: imgWidth - b.x - b.width,
  }));
}

/** 垂直翻转标注框 */
function flipBoxesVertical(boxes: IAnnotationBox[], imgHeight: number): IAnnotationBox[] {
  return boxes.map((b) => ({
    ...b,
    y: imgHeight - b.y - b.height,
  }));
}

/** 水平翻转图像 + 框 */
function doHorizontalFlip(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  boxes: IAnnotationBox[]
): { boxes: IAnnotationBox[]; width: number; height: number } {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  ctx.canvas.width = w;
  ctx.canvas.height = h;
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
  return { boxes: flipBoxesHorizontal(boxes, w), width: w, height: h };
}

/** 垂直翻转图像 + 框 */
function doVerticalFlip(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  boxes: IAnnotationBox[]
): { boxes: IAnnotationBox[]; width: number; height: number } {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  ctx.canvas.width = w;
  ctx.canvas.height = h;
  ctx.save();
  ctx.translate(0, h);
  ctx.scale(1, -1);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
  return { boxes: flipBoxesVertical(boxes, h), width: w, height: h };
}

/* ──────────────────── 变换: 旋转 ──────────────────── */

/** 旋转标注框（90 / 180 / 270 度），返回旋转后的新框（始终用包围盒近似） */
function rotateBoxes90(
  boxes: IAnnotationBox[],
  imgWidth: number,
  imgHeight: number,
  angle: 90 | 180 | 270
): IAnnotationBox[] {
  return boxes.map((b) => {
    // 四角点
    const corners = [
      [b.x, b.y],
      [b.x + b.width, b.y],
      [b.x + b.width, b.y + b.height],
      [b.x, b.y + b.height],
    ];

    let newCorners: [number, number][];
    if (angle === 90) {
      newCorners = corners.map(([x, y]) => [imgHeight - y, x] as [number, number]);
    } else if (angle === 180) {
      newCorners = corners.map(([x, y]) => [imgWidth - x, imgHeight - y] as [number, number]);
    } else {
      newCorners = corners.map(([x, y]) => [y, imgWidth - x] as [number, number]);
    }

    const xs = newCorners.map((c) => c[0]);
    const ys = newCorners.map((c) => c[1]);
    const nx = Math.min(...xs);
    const ny = Math.min(...ys);
    const nw = Math.max(...xs) - nx;
    const nh = Math.max(...ys) - ny;

    return { ...b, x: nx, y: ny, width: nw, height: nh };
  });
}

/** 90/180/270 度旋转图像 + 框 */
function doRotate90(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  boxes: IAnnotationBox[],
  angle: 90 | 180 | 270
): { boxes: IAnnotationBox[]; width: number; height: number } {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const isSideways = angle === 90 || angle === 270;
  const newW = isSideways ? h : w;
  const newH = isSideways ? w : h;

  ctx.canvas.width = newW;
  ctx.canvas.height = newH;
  ctx.save();
  ctx.translate(newW / 2, newH / 2);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -h / 2);
  ctx.restore();

  const newBoxes = rotateBoxes90(boxes, w, h, angle);
  return { boxes: newBoxes, width: newW, height: newH };
}

/** 任意角度旋转（会有黑边，画布扩展到能容纳整张图的对角线） */
function doRotateArbitrary(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  boxes: IAnnotationBox[],
  angleDeg: number
): { boxes: IAnnotationBox[]; width: number; height: number } {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const rad = (angleDeg * Math.PI) / 180;
  // 新画布尺寸（容纳旋转后的图像）
  const cosA = Math.abs(Math.cos(rad));
  const sinA = Math.abs(Math.sin(rad));
  const newW = Math.round(w * cosA + h * sinA);
  const newH = Math.round(w * sinA + h * cosA);

  ctx.canvas.width = newW;
  ctx.canvas.height = newH;
  ctx.save();
  ctx.translate(newW / 2, newH / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -w / 2, -h / 2);
  ctx.restore();

  // 框坐标变换：原图坐标系 → 新图坐标系
  const newBoxes = boxes.map((b) => {
    const corners = [
      [b.x, b.y],
      [b.x + b.width, b.y],
      [b.x + b.width, b.y + b.height],
      [b.x, b.y + b.height],
    ].map(([x, y]) => {
      // 转到以图像中心为原点
      const lx = x - w / 2;
      const ly = y - h / 2;
      // 旋转
      const rx = lx * Math.cos(rad) - ly * Math.sin(rad);
      const ry = lx * Math.sin(rad) + ly * Math.cos(rad);
      // 转到新画布坐标
      return [rx + newW / 2, ry + newH / 2] as [number, number];
    });
    const xs = corners.map((c) => c[0]);
    const ys = corners.map((c) => c[1]);
    return {
      ...b,
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
  });

  return { boxes: newBoxes, width: newW, height: newH };
}

/* ──────────────────── 变换: 颜色增强 ──────────────────── */

/** 颜色抖动（亮度/对比度/饱和度）- 不改变标注框 */
function doColorJitter(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  boxes: IAnnotationBox[],
  brightness: number,
  contrast: number,
  saturation: number
): { boxes: IAnnotationBox[]; width: number; height: number } {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  ctx.canvas.width = w;
  ctx.canvas.height = h;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, w, h);
  applyBasicAdjustments(imageData, { brightness, contrast, saturation });
  ctx.putImageData(imageData, 0, 0);

  return { boxes: [...boxes], width: w, height: h };
}

/* ──────────────────── 变换: 高斯模糊 ──────────────────── */

/** 高斯模糊（近似，使用多次 box blur） */
function doGaussianBlur(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  boxes: IAnnotationBox[],
  sigma: number
): { boxes: IAnnotationBox[]; width: number; height: number } {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  ctx.canvas.width = w;
  ctx.canvas.height = h;
  // 用 canvas 的 filter 属性近似（比手写高斯快很多，且效果足够）
  ctx.filter = `blur(${sigma}px)`;
  ctx.drawImage(img, 0, 0);
  ctx.filter = 'none';
  return { boxes: [...boxes], width: w, height: h };
}

/* ──────────────────── 变换: 噪声 ──────────────────── */

/** 添加随机高斯噪声 */
function doAddNoise(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  boxes: IAnnotationBox[],
  intensity: number
): { boxes: IAnnotationBox[]; width: number; height: number } {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  ctx.canvas.width = w;
  ctx.canvas.height = h;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const factor = intensity / 100; // 0-1

  for (let i = 0; i < data.length; i += 4) {
    // 高斯噪声近似（Box-Muller 简化）
    const noise = (Math.random() + Math.random() + Math.random() - 1.5) * 255 * factor * 0.3;
    data[i] = Math.max(0, Math.min(255, data[i] + noise));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
  }
  ctx.putImageData(imageData, 0, 0);
  return { boxes: [...boxes], width: w, height: h };
}

/* ──────────────────── 边界处理: 裁剪 / 过滤 ──────────────────── */

/**
 * 将越出图像边界的标注框按策略处理
 * - crop: 裁剪到图像边界内
 * - filter: 可见度低于阈值的框删除，其余裁剪
 */
function clampBoxes(
  boxes: IAnnotationBox[],
  imgWidth: number,
  imgHeight: number,
  policy: 'crop' | 'filter',
  visibilityThreshold: number
): IAnnotationBox[] {
  const result: IAnnotationBox[] = [];
  for (const b of boxes) {
    const origArea = b.width * b.height;
    if (origArea <= 0) continue;

    const nx = Math.max(0, b.x);
    const ny = Math.max(0, b.y);
    const nw = Math.min(b.x + b.width, imgWidth) - nx;
    const nh = Math.min(b.y + b.height, imgHeight) - ny;

    if (nw <= 0 || nh <= 0) continue;

    const visibleArea = nw * nh;
    const visibility = visibleArea / origArea;

    if (policy === 'filter' && visibility < visibilityThreshold) {
      continue; // 过滤掉
    }

    result.push({
      ...b,
      x: nx,
      y: ny,
      width: nw,
      height: nh,
      color: b.color ?? getColorForLabel(b.label),
    });
  }
  return result;
}

/* ──────────────────── 主入口: 单张图增强 ──────────────────── */

/**
 * 对单张图片生成 N 份增强结果
 * 每次随机选取一个增强组合应用
 */
export async function augmentImage(
  image: IAnnotationImage,
  config: IAugmentConfig
): Promise<IAugmentedImage[]> {
  const results: IAugmentedImage[] = [];
  const img = await loadImageFromUrl(image.url);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return results;

  // 保留原图（如果配置了）
  if (config.keepOriginal) {
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png')
    );
    if (blob) {
      results.push({
        id: uid(),
        sourceName: image.name,
        augmentType: 'original',
        url: URL.createObjectURL(blob),
        width: img.naturalWidth,
        height: img.naturalHeight,
        boxes: image.boxes.map((b) => ({ ...b })),
        blob,
      });
    }
  }

  // 生成 numAugments 张增强图
  for (let i = 0; i < config.numAugments; i++) {
    let currentBoxes = [...image.boxes];
    let currentImg: HTMLImageElement | HTMLCanvasElement = img;
    const appliedTransforms: string[] = [];

    // ===== 几何变换（选 1-2 种） =====
    const geoTransforms: string[] = [];
    if (config.flip.enabled) geoTransforms.push('hflip', 'vflip');
    if (config.rotate.enabled) geoTransforms.push('rotate90');
    if (geoTransforms.length > 0) {
      const transform = pickOne(geoTransforms);
      if (transform === 'hflip') {
        const res = doHorizontalFlip(ctx, currentImg as HTMLImageElement, currentBoxes);
        currentBoxes = res.boxes;
        appliedTransforms.push('hflip');
      } else if (transform === 'vflip') {
        const res = doVerticalFlip(ctx, currentImg as HTMLImageElement, currentBoxes);
        currentBoxes = res.boxes;
        appliedTransforms.push('vflip');
      } else if (transform === 'rotate90') {
        const angles = config.rotate.angles;
        const angle = pickOne(angles) as 90 | 180 | 270;
        const res = doRotate90(ctx, currentImg as HTMLImageElement, currentBoxes, angle);
        currentBoxes = res.boxes;
        appliedTransforms.push(`rotate_${angle}`);
      }
      // 将 canvas 转为临时 img 供后续变换使用
      const newImg = new Image();
      newImg.src = canvas.toDataURL('image/png');
      await new Promise((r) => {
        newImg.onload = r;
      });
      currentImg = newImg;
    }

    // ===== 颜色 / 像素级变换（可叠加多种） =====
    if (config.color.enabled) {
      const brightness = rand(config.color.brightnessRange[0], config.color.brightnessRange[1]);
      const contrast = rand(config.color.contrastRange[0], config.color.contrastRange[1]);
      const saturation = rand(config.color.saturationRange[0], config.color.saturationRange[1]);
      const res = doColorJitter(ctx, currentImg as HTMLImageElement, currentBoxes, brightness, contrast, saturation);
      currentBoxes = res.boxes;
      appliedTransforms.push('color');
      const newImg = new Image();
      newImg.src = canvas.toDataURL('image/png');
      await new Promise((r) => {
        newImg.onload = r;
      });
      currentImg = newImg;
    }

    if (config.blur.enabled && Math.random() < 0.5) {
      const sigma = rand(config.blur.minSigma, config.blur.maxSigma);
      const res = doGaussianBlur(ctx, currentImg as HTMLImageElement, currentBoxes, sigma);
      currentBoxes = res.boxes;
      appliedTransforms.push('blur');
      const newImg = new Image();
      newImg.src = canvas.toDataURL('image/png');
      await new Promise((r) => {
        newImg.onload = r;
      });
      currentImg = newImg;
    }

    if (config.noise.enabled && Math.random() < 0.5) {
      const intensity = rand(config.noise.intensity * 0.3, config.noise.intensity);
      const res = doAddNoise(ctx, currentImg as HTMLImageElement, currentBoxes, intensity);
      currentBoxes = res.boxes;
      appliedTransforms.push('noise');
    }

    // 获取最终画布尺寸
    const finalW = canvas.width;
    const finalH = canvas.height;

    // 边界处理
    const clampedBoxes = clampBoxes(
      currentBoxes,
      finalW,
      finalH,
      config.borderPolicy,
      config.visibilityThreshold
    );

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png')
    );
    if (blob) {
      const augType = appliedTransforms.length > 0 ? appliedTransforms.join('_') : 'identity';
      results.push({
        id: uid(),
        sourceName: image.name,
        augmentType: augType,
        url: URL.createObjectURL(blob),
        width: finalW,
        height: finalH,
        boxes: clampedBoxes,
        blob,
      });
    }
  }

  return results;
}

/** 默认增强配置 */
export function getDefaultAugmentConfig(): IAugmentConfig {
  return {
    numAugments: 3,
    keepOriginal: true,
    visibilityThreshold: 0.3,
    borderPolicy: 'crop',
    flip: {
      enabled: true,
      horizontal: true,
      vertical: false,
    },
    rotate: {
      enabled: true,
      angles: [90, 180, 270],
    },
    color: {
      enabled: true,
      brightnessRange: [-20, 20],
      contrastRange: [-15, 15],
      saturationRange: [-20, 20],
    },
    blur: {
      enabled: false,
      minSigma: 0.5,
      maxSigma: 2,
    },
    noise: {
      enabled: false,
      intensity: 20,
    },
  };
}
