/**
 * 图片水印工具
 * 支持文字水印与图片水印，基于 Canvas 2D 实现，纯浏览器本地处理。
 */

/** 水印位置 */
export type WatermarkPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'tile';

/** 文字水印参数 */
export interface ITextWatermarkConfig {
  type: 'text';
  text: string;
  fontSize: number;       // px
  fontFamily: string;
  color: string;          // CSS color
  opacity: number;        // 0-1
  position: WatermarkPosition;
  rotation: number;       // 度，正数顺时针
  margin: number;         // 边距 px（tile 模式下为间距）
}

/** 图片水印参数 */
export interface IImageWatermarkConfig {
  type: 'image';
  image: HTMLImageElement | HTMLCanvasElement;
  opacity: number;        // 0-1
  position: WatermarkPosition;
  scale: number;          // 缩放比例，相对原图 0-1
  margin: number;         // 边距 px（tile 模式下为间距）
  rotation: number;       // 度
}

export type WatermarkConfig = ITextWatermarkConfig | IImageWatermarkConfig;

/** 计算水印在目标画布上的起始坐标 */
function getWatermarkPosition(
  pos: WatermarkPosition,
  canvasW: number,
  canvasH: number,
  wmW: number,
  wmH: number,
  margin: number
): { x: number; y: number } {
  switch (pos) {
    case 'top-left':     return { x: margin, y: margin };
    case 'top-center':   return { x: (canvasW - wmW) / 2, y: margin };
    case 'top-right':    return { x: canvasW - wmW - margin, y: margin };
    case 'center-left':  return { x: margin, y: (canvasH - wmH) / 2 };
    case 'center':       return { x: (canvasW - wmW) / 2, y: (canvasH - wmH) / 2 };
    case 'center-right': return { x: canvasW - wmW - margin, y: (canvasH - wmH) / 2 };
    case 'bottom-left':  return { x: margin, y: canvasH - wmH - margin };
    case 'bottom-center':return { x: (canvasW - wmW) / 2, y: canvasH - wmH - margin };
    case 'bottom-right': return { x: canvasW - wmW - margin, y: canvasH - wmH - margin };
    case 'tile':         return { x: 0, y: 0 };
    default:             return { x: margin, y: margin };
  }
}

/** 绘制文字水印到 ctx */
export function applyTextWatermark(ctx: CanvasRenderingContext2D, cfg: ITextWatermarkConfig): void {
  const canvas = ctx.canvas;
  const w = canvas.width, h = canvas.height;

  ctx.save();
  ctx.globalAlpha = cfg.opacity;
  ctx.font = `${cfg.fontSize}px ${cfg.fontFamily}`;
  ctx.fillStyle = cfg.color;
  ctx.textBaseline = 'top';

  const textMetrics = ctx.measureText(cfg.text);
  const textW = textMetrics.width;
  const textH = cfg.fontSize * 1.2;

  if (cfg.position === 'tile') {
    // 平铺：计算行列
    const stepX = textW + cfg.margin;
    const stepY = textH + cfg.margin;
    const diag = Math.sqrt(w * w + h * h);
    ctx.translate(w / 2, h / 2);
    ctx.rotate((cfg.rotation * Math.PI) / 180);
    ctx.translate(-diag / 2, -diag / 2);
    for (let y = 0; y < diag; y += stepY) {
      for (let x = 0; x < diag; x += stepX) {
        ctx.fillText(cfg.text, x, y);
      }
    }
  } else {
    const { x, y } = getWatermarkPosition(cfg.position, w, h, textW, textH, cfg.margin);
    if (cfg.rotation !== 0) {
      ctx.translate(x + textW / 2, y + textH / 2);
      ctx.rotate((cfg.rotation * Math.PI) / 180);
      ctx.translate(-textW / 2, -textH / 2);
      ctx.fillText(cfg.text, 0, 0);
    } else {
      ctx.fillText(cfg.text, x, y);
    }
  }
  ctx.restore();
}

/** 绘制图片水印到 ctx */
export function applyImageWatermark(ctx: CanvasRenderingContext2D, cfg: IImageWatermarkConfig): void {
  const canvas = ctx.canvas;
  const w = canvas.width, h = canvas.height;

  const imgW = cfg.image instanceof HTMLImageElement ? cfg.image.naturalWidth : cfg.image.width;
  const imgH = cfg.image instanceof HTMLImageElement ? cfg.image.naturalHeight : cfg.image.height;
  if (imgW === 0 || imgH === 0) return;

  // 按 scale 计算水印尺寸（scale 为相对画布宽度的比例）
  const targetW = w * cfg.scale;
  const targetH = targetW * (imgH / imgW);
  if (targetW < 1 || targetH < 1) return;

  ctx.save();
  ctx.globalAlpha = cfg.opacity;

  if (cfg.position === 'tile') {
    const stepX = targetW + cfg.margin;
    const stepY = targetH + cfg.margin;
    const diag = Math.sqrt(w * w + h * h);
    ctx.translate(w / 2, h / 2);
    ctx.rotate((cfg.rotation * Math.PI) / 180);
    ctx.translate(-diag / 2, -diag / 2);
    for (let y = 0; y < diag; y += stepY) {
      for (let x = 0; x < diag; x += stepX) {
        ctx.drawImage(cfg.image, x, y, targetW, targetH);
      }
    }
  } else {
    const { x, y } = getWatermarkPosition(cfg.position, w, h, targetW, targetH, cfg.margin);
    if (cfg.rotation !== 0) {
      ctx.translate(x + targetW / 2, y + targetH / 2);
      ctx.rotate((cfg.rotation * Math.PI) / 180);
      ctx.drawImage(cfg.image, -targetW / 2, -targetH / 2, targetW, targetH);
    } else {
      ctx.drawImage(cfg.image, x, y, targetW, targetH);
    }
  }
  ctx.restore();
}

/**
 * 对单张图片应用水印
 * @param source 源图片
 * @param configs 水印配置数组（可叠加多个水印）
 * @returns 处理后的 canvas
 */
export function applyWatermarks(
  source: HTMLImageElement | HTMLCanvasElement,
  configs: WatermarkConfig[]
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const w = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const h = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.drawImage(source, 0, 0, w, h);

  for (const cfg of configs) {
    if (cfg.type === 'text') {
      applyTextWatermark(ctx, cfg);
    } else {
      applyImageWatermark(ctx, cfg);
    }
  }
  return canvas;
}
