/**
 * 感知哈希算法（pHash / dHash）
 * 用于图片相似度比较、视频帧去重等场景
 * 基于 canvas 像素采样实现，纯前端计算
 */

/**
 * dHash（差异哈希）- 快速感知哈希
 * 原理：缩小到 9x8，比较每行相邻像素差异
 * 返回 64 位二进制字符串
 */
export function dHash(imageData: ImageData): string {
  const { width: w, height: h } = imageData;
  // 转灰度
  const gray: number[] = [];
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }

  // 比较每行相邻像素差值 (w-1) * h 位
  let hash = '';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w - 1; x++) {
      const left = gray[y * w + x];
      const right = gray[y * w + x + 1];
      hash += left > right ? '1' : '0';
    }
  }
  return hash;
}

/**
 * aHash（平均哈希）
 * 原理：缩小到 8x8，与平均值比较
 */
export function aHash(imageData: ImageData): string {
  const { width: w, height: h } = imageData;
  const data = imageData.data;
  const pixels: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    pixels.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  const avg = pixels.reduce((s, v) => s + v, 0) / pixels.length;
  let hash = '';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      hash += pixels[y * w + x] >= avg ? '1' : '0';
    }
  }
  return hash;
}

/**
 * pHash（感知哈希）- 基于 DCT 的简化版本
 * 缩小到 32x32 -> 灰度 -> DCT -> 取左上角 8x8 -> 计算均值哈希
 *
 * 注：为了性能和代码量，这里使用简化版——先缩放到 16x16，
 * 然后用近似 DCT（低通滤波 + 8x8 子采样 + 均值比较）。
 * 实际项目中可接入 dct 库获得更准确结果。
 */
export function pHash(imageData: ImageData): string {
  const { width: w, height: h } = imageData;
  const data = imageData.data;

  // 转灰度
  const gray = new Float32Array(w * h);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  // 简化：用 8x8 均值块近似 DCT 低频
  const blockW = w / 8;
  const blockH = h / 8;
  const lowFreq: number[] = [];

  for (let by = 0; by < 8; by++) {
    for (let bx = 0; bx < 8; bx++) {
      let sum = 0;
      let count = 0;
      const startX = Math.floor(bx * blockW);
      const endX = Math.floor((bx + 1) * blockW);
      const startY = Math.floor(by * blockH);
      const endY = Math.floor((by + 1) * blockH);
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          sum += gray[y * w + x];
          count++;
        }
      }
      lowFreq.push(count > 0 ? sum / count : 0);
    }
  }

  // 去掉 DC 分量后求均值（排除第一块对整体亮度影响）
  const dc = lowFreq[0];
  let avg = 0;
  for (let i = 1; i < 64; i++) avg += lowFreq[i];
  avg /= 63;

  // 与均值比较生成哈希（忽略 DC 分量的绝对大小影响）
  let hash = '';
  for (let i = 0; i < 64; i++) {
    hash += lowFreq[i] - dc * 0.5 > avg ? '1' : '0';
  }
  return hash;
}

/**
 * 计算汉明距离（两个等长二进制字符串的差异位数）
 */
export function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) return Math.abs(hash1.length - hash2.length);
  let dist = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) dist++;
  }
  return dist;
}

/**
 * 从 canvas 获取指定尺寸的灰度 ImageData（用于哈希计算）
 */
export function getSizedGrayData(
  canvas: HTMLCanvasElement,
  targetW: number,
  targetH: number
): ImageData {
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = targetW;
  tmpCanvas.height = targetH;
  const ctx = tmpCanvas.getContext('2d');
  if (!ctx) return new ImageData(targetW, targetH);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(canvas, 0, 0, targetW, targetH);
  return ctx.getImageData(0, 0, targetW, targetH);
}

/**
 * 便捷函数：计算图片 dHash（默认 9x8 = 64 位）
 */
export function computeDHashFromCanvas(canvas: HTMLCanvasElement): string {
  const imageData = getSizedGrayData(canvas, 9, 8);
  return dHash(imageData);
}

/**
 * 便捷函数：计算图片 pHash（近似版，64 位）
 */
export function computePHashFromCanvas(canvas: HTMLCanvasElement): string {
  const imageData = getSizedGrayData(canvas, 32, 32);
  return pHash(imageData);
}
