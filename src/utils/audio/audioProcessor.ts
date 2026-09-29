// 音频处理工具集 - 基于 Web Audio API，纯浏览器本地执行

import type {
  IAudioTrimConfig,
  INormalizeConfig,
  INoiseReductionConfig,
  IAudioFormatConfig,
} from '@/types/media';

/** 解码音频文件为 AudioBuffer */
export async function decodeAudioFile(
  file: File,
  audioContext: AudioContext
): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  return audioContext.decodeAudioData(arrayBuffer.slice(0));
}

/** 计算峰值 dBFS */
export function computePeakDb(buffer: AudioBuffer): number {
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }
  }
  if (peak === 0) return -Infinity;
  return 20 * Math.log10(peak);
}

/** 计算 RMS dBFS */
export function computeRmsDb(buffer: AudioBuffer): number {
  let sum = 0;
  let total = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * data[i];
      total++;
    }
  }
  if (total === 0) return -Infinity;
  const rms = Math.sqrt(sum / total);
  if (rms === 0) return -Infinity;
  return 20 * Math.log10(rms);
}

/** 裁剪音频 */
export function trimAudio(
  buffer: AudioBuffer,
  config: IAudioTrimConfig,
  audioContext: AudioContext
): AudioBuffer {
  if (!config.enabled) return buffer;
  const sr = buffer.sampleRate;
  const startSample = Math.max(0, Math.floor(config.startTime * sr));
  const endSample = Math.min(buffer.length, Math.floor(config.endTime * sr));
  const newLength = Math.max(1, endSample - startSample);

  const newBuffer = audioContext.createBuffer(
    buffer.numberOfChannels,
    newLength,
    sr
  );
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = newBuffer.getChannelData(ch);
    for (let i = 0; i < newLength; i++) {
      dst[i] = src[startSample + i];
    }
  }
  return newBuffer;
}

/** 音量归一化（peak / rms） */
export function normalizeAudio(
  buffer: AudioBuffer,
  config: INormalizeConfig,
  audioContext: AudioContext
): AudioBuffer {
  if (!config.enabled) return buffer;

  const targetLinear = Math.pow(10, config.targetDb / 20);
  let gain = 1;

  if (config.mode === 'peak') {
    let peak = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const abs = Math.abs(data[i]);
        if (abs > peak) peak = abs;
      }
    }
    if (peak === 0) return buffer;
    gain = targetLinear / peak;
  } else {
    // RMS
    let sum = 0;
    let total = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        sum += data[i] * data[i];
        total++;
      }
    }
    if (total === 0) return buffer;
    const rms = Math.sqrt(sum / total);
    if (rms === 0) return buffer;
    gain = targetLinear / rms;
  }

  // 限制最大增益防止削波
  if (config.mode === 'rms') {
    gain = Math.min(gain, 10);
  }

  const newBuffer = audioContext.createBuffer(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  );
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = newBuffer.getChannelData(ch);
    for (let i = 0; i < src.length; i++) {
      const v = src[i] * gain;
      // 软限幅
      dst[i] = v > 1 ? 1 : v < -1 ? -1 : v;
    }
  }
  return newBuffer;
}

/** 简易降噪（高通 + 低通 + 频谱门限） */
export function reduceNoise(
  buffer: AudioBuffer,
  config: INoiseReductionConfig,
  audioContext: AudioContext
): AudioBuffer {
  if (!config.enabled) return buffer;

  const sr = buffer.sampleRate;
  let result: AudioBuffer = buffer;

  // 高通滤波（单极点 IIR，简化实现）
  if (config.highPassFreq > 0) {
    result = applyHighPass(result, config.highPassFreq, audioContext);
  }

  // 低通滤波
  if (config.lowPassFreq > 0 && config.lowPassFreq < sr / 2) {
    result = applyLowPass(result, config.lowPassFreq, audioContext);
  }

  // 频谱门限降噪（基于短时能量的简易实现）
  if (config.noiseGateThreshold > -100) {
    result = applyNoiseGate(result, config.noiseGateThreshold, audioContext);
  }

  return result;
}

/** 单极点高通滤波 */
function applyHighPass(
  buffer: AudioBuffer,
  cutoffHz: number,
  audioContext: AudioContext
): AudioBuffer {
  const sr = buffer.sampleRate;
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const alpha = rc / (rc + 1 / sr);
  const out = audioContext.createBuffer(
    buffer.numberOfChannels,
    buffer.length,
    sr
  );
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    let prevIn = 0;
    let prevOut = 0;
    for (let i = 0; i < src.length; i++) {
      dst[i] = alpha * (prevOut + src[i] - prevIn);
      prevIn = src[i];
      prevOut = dst[i];
    }
  }
  return out;
}

/** 单极点低通滤波 */
function applyLowPass(
  buffer: AudioBuffer,
  cutoffHz: number,
  audioContext: AudioContext
): AudioBuffer {
  const sr = buffer.sampleRate;
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const alpha = (1 / sr) / (rc + 1 / sr);
  const out = audioContext.createBuffer(
    buffer.numberOfChannels,
    buffer.length,
    sr
  );
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    let prev = 0;
    for (let i = 0; i < src.length; i++) {
      dst[i] = prev + alpha * (src[i] - prev);
      prev = dst[i];
    }
  }
  return out;
}

/** 简易噪声门（按帧判断能量，低于阈值则衰减） */
function applyNoiseGate(
  buffer: AudioBuffer,
  thresholdDb: number,
  audioContext: AudioContext
): AudioBuffer {
  const sr = buffer.sampleRate;
  const frameSize = 512;
  const thresholdLinear = Math.pow(10, thresholdDb / 20);
  const out = audioContext.createBuffer(
    buffer.numberOfChannels,
    buffer.length,
    sr
  );
  const reduction = 0.1; // 衰减到 10%

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    let prevGain = 1;

    for (let f = 0; f < src.length; f += frameSize) {
      const frameEnd = Math.min(f + frameSize, src.length);
      // 计算帧 RMS
      let sum = 0;
      for (let i = f; i < frameEnd; i++) sum += src[i] * src[i];
      const rms = Math.sqrt(sum / (frameEnd - f));
      const targetGain = rms < thresholdLinear ? reduction : 1;
      // 平滑增益过渡
      for (let i = f; i < frameEnd; i++) {
        const t = (i - f) / (frameEnd - f);
        const gain = prevGain + (targetGain - prevGain) * t;
        dst[i] = src[i] * gain;
      }
      prevGain = targetGain;
    }
  }
  return out;
}

/** AudioBuffer 转 WAV Blob */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = buffer.length * blockAlign;
  const bufferSize = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  // WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleave channels + convert to 16-bit PCM
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/** AudioBuffer 转 OGG（简化：浏览器支持 MediaRecorder 时用 MediaRecorder 录制，否则 fallback 为 WAV） */
export async function audioBufferToOgg(
  buffer: AudioBuffer,
  audioContext: AudioContext
): Promise<Blob> {
  // 尝试用 MediaRecorder 录制为 ogg
  const dest = audioContext.createMediaStreamDestination();
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(dest);

  const mimeType = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
    ? 'audio/ogg;codecs=opus'
    : MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : '';

  if (!mimeType) {
    // fallback 到 wav
    return audioBufferToWav(buffer);
  }

  return new Promise<Blob>((resolve, reject) => {
    try {
      const recorder = new MediaRecorder(dest.stream, { mimeType });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        resolve(blob);
      };
      recorder.onerror = () => reject(new Error('录制失败'));
      source.start();
      recorder.start();
      source.onended = () => recorder.stop();
    } catch (e) {
      reject(e);
    }
  });
}

/** 检测浏览器支持的音频输出格式 */
export function getSupportedAudioFormats(): ('wav' | 'mp3' | 'ogg' | 'm4a')[] {
  const formats: ('wav' | 'mp3' | 'ogg' | 'm4a')[] = ['wav'];
  try {
    if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') ||
        MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      formats.push('ogg');
    }
  } catch { /* ignore */ }
  // MP3 和 M4A 浏览器端编码支持有限，暂不启用
  return formats;
}

/** 按配置处理单段音频（完整处理链） */
export async function processAudio(
  buffer: AudioBuffer,
  config: {
    trim: IAudioTrimConfig;
    normalize: INormalizeConfig;
    noiseReduction: INoiseReductionConfig;
    format: IAudioFormatConfig;
  },
  audioContext: AudioContext
): Promise<{ buffer: AudioBuffer; blob: Blob }> {
  let result = buffer;

  // 1. 裁剪
  result = trimAudio(result, config.trim, audioContext);

  // 2. 降噪
  result = reduceNoise(result, config.noiseReduction, audioContext);

  // 3. 归一化（放在降噪后，这样最终响度可控）
  result = normalizeAudio(result, config.normalize, audioContext);

  // 4. 格式转换
  let blob: Blob;
  if (!config.format.enabled || config.format.format === 'wav') {
    blob = audioBufferToWav(result);
  } else if (config.format.format === 'ogg') {
    blob = await audioBufferToOgg(result, audioContext);
  } else {
    // mp3/m4a fallback 到 wav
    blob = audioBufferToWav(result);
  }

  return { buffer: result, blob };
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
