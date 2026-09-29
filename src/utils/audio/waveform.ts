// 波形可视化工具 - 基于 Canvas 绘制音频波形图

/** 从 AudioBuffer 生成波形峰值数据（用于绘制）
 *  @param samplesPerPixel 每像素对应的采样数（控制精度）
 */
export function generateWaveformPeaks(
  buffer: AudioBuffer,
  targetWidth: number
): { min: Float32Array; max: Float32Array; avg: Float32Array } {
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  const samplesPerPixel = Math.max(1, Math.floor(length / targetWidth));
  const totalPixels = Math.ceil(length / samplesPerPixel);

  const min = new Float32Array(totalPixels);
  const max = new Float32Array(totalPixels);
  const avg = new Float32Array(totalPixels);

  // 混合所有声道
  const mixed = new Float32Array(length);
  for (let ch = 0; ch < channels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mixed[i] += data[i] / channels;
    }
  }

  for (let p = 0; p < totalPixels; p++) {
    const start = p * samplesPerPixel;
    const end = Math.min(start + samplesPerPixel, length);
    let pMin = 1;
    let pMax = -1;
    let absSum = 0;
    for (let i = start; i < end; i++) {
      const v = mixed[i];
      if (v < pMin) pMin = v;
      if (v > pMax) pMax = v;
      absSum += Math.abs(v);
    }
    min[p] = pMin;
    max[p] = pMax;
    avg[p] = absSum / (end - start);
  }

  return { min, max, avg };
}

/** 绘制波形图到 canvas
 *  @param showCursor 是否显示播放头
 *  @param cursorPos 播放头位置（0-1 比例）
 *  @param selection 选区 [startRatio, endRatio]
 */
export interface WaveformDrawOptions {
  width: number;
  height: number;
  waveColor?: string;
  progressColor?: string;
  cursorColor?: string;
  selectionColor?: string;
  bgColor?: string;
  showCursor?: boolean;
  cursorPos?: number;
  selection?: [number, number] | null;
}

export function drawWaveform(
  canvas: HTMLCanvasElement,
  peaks: { min: Float32Array; max: Float32Array; avg: Float32Array },
  options: WaveformDrawOptions
) {
  const {
    width,
    height,
    waveColor = '#cbd5e1',
    progressColor = 'hsl(28 90% 50%)',
    cursorColor = '#ef4444',
    selectionColor = 'rgba(28, 90%, 50%, 0.15)',
    bgColor = 'transparent',
    showCursor = false,
    cursorPos = 0,
    selection = null,
  } = options;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = width * window.devicePixelRatio;
  canvas.height = height * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  // 背景
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  const midY = height / 2;
  const totalPixels = peaks.min.length;
  const barWidth = width / totalPixels;
  const progressX = cursorPos * width;

  // 选区
  if (selection && selection[0] < selection[1]) {
    const selStart = selection[0] * width;
    const selEnd = selection[1] * width;
    ctx.fillStyle = selectionColor;
    ctx.fillRect(selStart, 0, selEnd - selStart, height);
  }

  // 波形
  for (let i = 0; i < totalPixels; i++) {
    const x = i * barWidth;
    const isProgress = showCursor && x <= progressX;
    const color = isProgress ? progressColor : waveColor;

    const top = midY - peaks.max[i] * midY * 0.9;
    const bottom = midY - peaks.min[i] * midY * 0.9;

    ctx.fillStyle = color;
    ctx.fillRect(x, top, Math.max(1, barWidth - 0.5), bottom - top);

    // 中心线
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.3;
    ctx.fillRect(x, midY - 0.5, Math.max(1, barWidth - 0.5), 1);
    ctx.globalAlpha = 1;
  }

  // 播放头
  if (showCursor) {
    ctx.fillStyle = cursorColor;
    ctx.fillRect(progressX - 1, 0, 2, height);
  }
}

/** 根据点击位置获取对应的时间比例（0-1） */
export function getRatioFromClick(
  e: React.MouseEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement
): number {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  return Math.max(0, Math.min(1, x / rect.width));
}
