import type { IAnnotationBox } from '@/types/annotation';
import { uid, getColorForLabel } from './formats';

/**
 * 基于 Canny 边缘检测 + 轮廓提取的简单预标注
 * 返回候选矩形框列表（可作为预标注占位，供用户复核采纳）
 *
 * 注意：MVP 版本使用简化的轮廓提取算法（非深度模型），
 * 适合边缘清晰、背景简单的场景，复杂场景需人工复核调整。
 */

/** 灰度化 */
function toGray(imageData: ImageData): Uint8ClampedArray {
  const gray = new Uint8ClampedArray(imageData.width * imageData.height);
  const data = imageData.data;
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return gray;
}

/** 高斯模糊（3x3 简化版） */
function gaussianBlur(gray: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h);
  const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
  const sum = 16;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let v = 0;
      let k = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          v += gray[(y + dy) * w + (x + dx)] * kernel[k++];
        }
      }
      out[y * w + x] = v / sum;
    }
  }
  return out;
}

/** Sobel 边缘检测 */
function sobelEdge(gray: Uint8ClampedArray, w: number, h: number): { mag: Uint8ClampedArray; angle: Float32Array } {
  const mag = new Uint8ClampedArray(w * h);
  const angle = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const gx =
        -gray[idx - w - 1] - 2 * gray[idx - 1] - gray[idx + w - 1] +
        gray[idx - w + 1] + 2 * gray[idx + 1] + gray[idx + w + 1];
      const gy =
        -gray[idx - w - 1] - 2 * gray[idx - w] - gray[idx - w + 1] +
        gray[idx + w - 1] + 2 * gray[idx + w] + gray[idx + w + 1];
      mag[idx] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
      angle[idx] = Math.atan2(gy, gx);
    }
  }
  return { mag, angle };
}

/** 非极大值抑制（简化版） */
function nonMaxSuppression(
  mag: Uint8ClampedArray,
  angle: Float32Array,
  w: number,
  h: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const m = mag[idx];
      let a = angle[idx] * (180 / Math.PI);
      if (a < 0) a += 180;
      let q = 255, r = 255;
      if ((a >= 0 && a < 22.5) || (a >= 157.5 && a <= 180)) {
        q = mag[idx + 1]; r = mag[idx - 1];
      } else if (a >= 22.5 && a < 67.5) {
        q = mag[idx - w + 1]; r = mag[idx + w - 1];
      } else if (a >= 67.5 && a < 112.5) {
        q = mag[idx - w]; r = mag[idx + w];
      } else if (a >= 112.5 && a < 157.5) {
        q = mag[idx - w - 1]; r = mag[idx + w + 1];
      }
      out[idx] = m >= q && m >= r ? m : 0;
    }
  }
  return out;
}

/** 双阈值 + 滞后边界跟踪（简化版） */
function doubleThreshold(
  nms: Uint8ClampedArray,
  w: number,
  h: number,
  low: number,
  high: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h);
  const strong = 255;
  const weak = 80;
  for (let i = 0; i < nms.length; i++) {
    if (nms[i] >= high) out[i] = strong;
    else if (nms[i] >= low) out[i] = weak;
  }
  // 滞后：弱边缘只有周围有强边缘时才保留
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      if (out[idx] === weak) {
        const neighbors = [
          out[idx - w - 1], out[idx - w], out[idx - w + 1],
          out[idx - 1], out[idx + 1],
          out[idx + w - 1], out[idx + w], out[idx + w + 1],
        ];
        out[idx] = neighbors.some((n) => n === strong) ? strong : 0;
      }
    }
  }
  return out;
}

/**
 * Canny 边缘检测（浏览器端纯计算）
 * @param imageData 原始图片像素
 * @param lowThreshold 低阈值 (0-255)
 * @param highThreshold 高阈值 (0-255)
 */
export function cannyEdgeDetect(
  imageData: ImageData,
  lowThreshold = 30,
  highThreshold = 80
): ImageData {
  const { width: w, height: h } = imageData;
  const gray = toGray(imageData);
  const blurred = gaussianBlur(gray, w, h);
  const { mag, angle } = sobelEdge(blurred, w, h);
  const nms = nonMaxSuppression(mag, angle, w, h);
  const edges = doubleThreshold(nms, w, h, lowThreshold, highThreshold);

  const out = new ImageData(w, h);
  for (let i = 0, j = 0; i < edges.length; i++, j += 4) {
    const v = edges[i];
    out.data[j] = v;
    out.data[j + 1] = v;
    out.data[j + 2] = v;
    out.data[j + 3] = 255;
  }
  return out;
}

/**
 * 从二值边缘图中提取轮廓并生成外接矩形候选框
 * 使用连通域分析 + 矩形拟合
 * @param edges 二值边缘图（255 = 边缘，0 = 背景）
 * @param minArea 最小面积（像素²）
 * @param maxCount 最多返回多少个候选框
 */
export function extractCandidateBoxes(
  edges: ImageData,
  minArea = 500,
  maxCount = 10
): { x: number; y: number; width: number; height: number }[] {
  const { width: w, height: h, data } = edges;
  const visited = new Uint8Array(w * h);
  const labels = new Int32Array(w * h);
  let label = 0;

  // BFS 连通域分析（只找边缘像素，生成边缘带外接矩形）
  const rects: { x: number; y: number; width: number; height: number; area: number }[] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (data[idx * 4] > 128 && !visited[idx]) {
        // BFS
        const stack: [number, number][] = [[x, y]];
        visited[idx] = 1;
        labels[idx] = label;
        let minX = x, maxX = x, minY = y, maxY = y, count = 0;

        while (stack.length > 0) {
          const [cx, cy] = stack.pop()!;
          count++;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = cx + dx;
              const ny = cy + dy;
              if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
              const nidx = ny * w + nx;
              if (data[nidx * 4] > 128 && !visited[nidx]) {
                visited[nidx] = 1;
                labels[nidx] = label;
                stack.push([nx, ny]);
              }
            }
          }
        }

        const bw = maxX - minX + 1;
        const bh = maxY - minY + 1;
        const area = bw * bh;
        if (area >= minArea && bw < w * 0.9 && bh < h * 0.9) {
          rects.push({ x: minX, y: minY, width: bw, height: bh, area });
        }
        label++;
      }
    }
  }

  // 按面积降序，取前 maxCount 个
  rects.sort((a, b) => b.area - a.area);
  return rects.slice(0, maxCount).map((r) => ({
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
  }));
}

/**
 * 从图片 canvas 生成预标注候选框
 * @param canvas 含有图片的 canvas
 * @param defaultLabel 默认类别名
 * @param lowThreshold Canny 低阈值
 * @param highThreshold Canny 高阈值
 * @param minArea 最小框面积
 * @param maxCount 最多候选框数
 */
export function generatePreAnnotations(
  canvas: HTMLCanvasElement,
  defaultLabel: string,
  lowThreshold = 30,
  highThreshold = 80,
  minArea = 500,
  maxCount = 10
): IAnnotationBox[] {
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const edges = cannyEdgeDetect(imageData, lowThreshold, highThreshold);
  const candidates = extractCandidateBoxes(edges, minArea, maxCount);

  return candidates.map((c) => ({
    id: uid(),
    label: defaultLabel,
    x: c.x,
    y: c.y,
    width: c.width,
    height: c.height,
    shapeType: 'rectangle',
    color: getColorForLabel(defaultLabel),
  }));
}

/**
 * 基于边缘检测轮廓生成多边形候选标注
 * 使用轮廓追踪 + 多边形近似（Douglas-Peucker 简化）
 *
 * @param canvas 含有图片的 canvas
 * @param defaultLabel 默认类别名
 * @param lowThreshold Canny 低阈值
 * @param highThreshold Canny 高阈值
 * @param minArea 最小多边形面积（像素²）
 * @param epsilon 多边形近似精度（越大顶点越少）
 */
export function generatePolygonCandidates(
  canvas: HTMLCanvasElement,
  defaultLabel: string,
  lowThreshold = 30,
  highThreshold = 80,
  minArea = 500,
  epsilon = 3
): IAnnotationBox[] {
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const edgeImageData = cannyEdgeDetect(imageData, lowThreshold, highThreshold);
  const contours = findContours(edgeImageData.data, canvas.width, canvas.height);

  const result: IAnnotationBox[] = [];
  for (const contour of contours) {
    if (contour.length < 8) continue; // 顶点太少跳过
    const area = contourArea(contour);
    if (area < minArea) continue;

    // 多边形近似简化顶点数
    const simplified = douglasPeucker(contour, epsilon);
    if (simplified.length < 3) continue; // 少于3个顶点不能构成多边形
    if (simplified.length > 20) continue; // 顶点太多可能是噪点轮廓

    // 计算 bbox
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of simplified) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const bw = maxX - minX;
    const bh = maxY - minY;
    // 过滤掉接近整图大小的轮廓
    if (bw > canvas.width * 0.9 || bh > canvas.height * 0.9) continue;

    result.push({
      id: uid(),
      label: defaultLabel,
      shapeType: 'polygon',
      x: minX,
      y: minY,
      width: bw,
      height: bh,
      points: simplified.map((p): [number, number] => [p.x, p.y]),
      color: getColorForLabel(defaultLabel),
    });
  }

  // 按面积降序，取前 10 个
  result.sort((a, b) => (b.width * b.height) - (a.width * a.height));
  return result.slice(0, 10);
}

/** 轮廓点类型 */
interface ContourPoint { x: number; y: number; }

/**
 * 在边缘二值图上寻找外轮廓（简化版 Moore-Neighbor 追踪）
 * 返回轮廓点数组列表
 * @param edges 边缘二值图（Uint8ClampedArray，255=边缘，0=非边缘）
 * @param w 宽度
 * @param h 高度
 */
export function findContours(edges: Uint8ClampedArray, w: number, h: number): ContourPoint[][] {
  const contours: ContourPoint[][] = [];
  const visited = new Uint8Array(edges.length);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (edges[idx] > 0 && !visited[idx]) {
        const contour = traceContour(edges, visited, w, h, x, y);
        if (contour.length >= 3) contours.push(contour);
      }
    }
  }
  return contours;
}

/** 单轮廓追踪（简化的 square-tracing 算法） */
function traceContour(
  edges: Uint8ClampedArray,
  visited: Uint8Array,
  w: number, h: number,
  sx: number, sy: number
): ContourPoint[] {
  const contour: ContourPoint[] = [];
  // 8 邻域方向：右、右下、下、左下、左、左上、上、右上
  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy = [0, 1, 1, 1, 0, -1, -1, -1];

  let x = sx, y = sy;
  let dir = 0; // 当前前进方向
  let maxIter = 5000;
  const startKey = `${sx},${sy}`;
  const seen = new Set<string>();

  while (maxIter-- > 0) {
    const idx = y * w + x;
    if (edges[idx] > 0) {
      visited[idx] = 1;
      const key = `${x},${y}`;
      // 起点闭环检测：至少积累一些点后再判断
      if (contour.length > 10 && key === startKey) break;
      if (seen.has(key)) break; // 避免死循环
      seen.add(key);
      contour.push({ x, y });
      // 左转
      dir = (dir + 6) % 8;
    } else {
      // 右转
      dir = (dir + 1) % 8;
    }
    x += dx[dir];
    y += dy[dir];
    if (x < 0 || x >= w || y < 0 || y >= h) break;
  }

  return contour;
}

/** 计算多边形面积（Shoelace 公式） */
function contourArea(contour: ContourPoint[]): number {
  let area = 0;
  const n = contour.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += contour[i].x * contour[j].y;
    area -= contour[j].x * contour[i].y;
  }
  return Math.abs(area) / 2;
}

/** Douglas-Peucker 多边形简化算法 */
function douglasPeucker(points: ContourPoint[], epsilon: number): ContourPoint[] {
  if (points.length <= 2) return [...points];

  // 找最远点
  let maxDist = 0;
  let maxIdx = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], start, end);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, maxIdx + 1), epsilon);
    const right = douglasPeucker(points.slice(maxIdx), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [start, end];
}

/** 点到直线的垂直距离 */
function perpendicularDistance(p: ContourPoint, a: ContourPoint, b: ContourPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) {
    return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
  }
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  return Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
}
