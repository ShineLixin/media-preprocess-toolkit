// 多媒体处理相关类型定义

/** 图片处理参数 */
export interface IImageProcessParams {
  brightness: number;  // 亮度 -100 ~ 100，默认 0
  contrast: number;    // 对比度 -100 ~ 100，默认 0
  saturation: number;  // 饱和度 -100 ~ 100，默认 0
  sharpen: number;     // 锐化 0 ~ 100，默认 0
  denoise: number;     // 降噪 0 ~ 100，默认 0
}

/** 裁剪参数 */
export interface ICropParams {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 缩放模式 */
export type ResizeMode = 'contain' | 'cover' | 'stretch';

/** 缩放参数 */
export interface IResizeParams {
  width: number;         // 目标宽度
  height: number;        // 目标高度
  mode: ResizeMode;      // 缩放模式
}

/** 格式转换参数 */
export interface IFormatParams {
  format: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';
  quality: number; // 0-1
}

/** 畸变校正参数 */
export interface IDistortionParams {
  k1: number; // 径向畸变系数 -1 ~ 1，正值桶形，负值枕形
  k2: number;
}

/** 图片项（带处理状态） */
export interface IImageItem {
  id: string;
  file: File;
  name: string;
  url: string;       // objectURL
  width: number;
  height: number;
  processedUrl?: string;
  processedBlob?: Blob;
}

/** 视频抽帧配置 */
export interface IVideoFrameConfig {
  interval: number;       // 抽帧间隔（秒）
  startTime: number;      // 起始时间（秒）
  endTime: number;        // 结束时间（秒），0 表示到末尾
  dedupEnabled: boolean;  // 是否启用去重
  dedupThreshold: number; // 去重阈值（汉明距离，越小越严格，推荐 5-10）
}

/** 抽帧结果 */
export interface IVideoFrame {
  index: number;
  timestamp: number;   // 时间戳（秒）
  url: string;         // objectURL
  blob: Blob;
  width: number;
  height: number;
  hash?: string;       // 感知哈希
  isDuplicate?: boolean;
}

/** OCR 字段模板 */
export interface IOcrFieldTemplate {
  id: string;
  name: string;       // 字段名
  x: number;          // 区域左上角 x（相对图片比例 0-1）
  y: number;          // 区域左上角 y（相对图片比例 0-1）
  width: number;      // 宽度比例 0-1
  height: number;     // 高度比例 0-1
}

/** OCR 识别结果 */
export interface IOcrResult {
  fieldId: string;
  fieldName: string;
  text: string;
  confidence: number;
}

/* ── 水印 ── */

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
  enabled: boolean;
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  opacity: number;  // 0-1
  position: WatermarkPosition;
  rotation: number; // 度
  margin: number;   // 边距 px
}

/** 图片水印参数 */
export interface IImageWatermarkConfig {
  enabled: boolean;
  file: File | null;
  opacity: number;  // 0-1
  position: WatermarkPosition;
  scale: number;    // 相对原图宽度比例 0-1
  margin: number;   // 边距 px
  rotation: number; // 度
}

/** 批量重命名规则 */
export interface IRenameRuleConfig {
  enabled: boolean;
  prefix: string;          // 前缀
  suffix: string;          // 后缀（不含扩展名）
  keepOriginalName: boolean; // 是否保留原文件名
  startIndex: number;      // 起始序号
  indexDigits: number;     // 序号位数（补零）
  indexPosition: 'before' | 'after' | 'replace'; // 序号位置
}

/* ── 视频扩展 ── */

/** 视频截取配置 */
export interface IVideoTrimConfig {
  startTime: number;  // 起始时间 秒
  endTime: number;    // 结束时间 秒
}

/** 视频转 GIF 配置 */
export interface IVideoGifConfig {
  startTime: number;  // 起始时间 秒
  endTime: number;    // 结束时间 秒
  fps: number;        // 帧率
  width: number;      // 输出宽度（高度按比例）
  quality: number;    // 质量 1-20（GIF 颜色数量相关，数字越小质量越高）
}

/** 视频播放速度 */
export type VideoPlaybackRate = 0.5 | 1 | 2;

/* ── OCR 表格识别 ── */

/** OCR 表格单元格 */
export interface IOcrTableCell {
  rowIndex: number;
  colIndex: number;
  text: string;
  confidence: number;
  bbox?: [number, number, number, number]; // x, y, w, h
}

/** OCR 表格识别结果 */
export interface IOcrTableResult {
  rows: number;
  cols: number;
  cells: IOcrTableCell[];
  headers: string[];
  data: string[][];
}

/* ── 音频工具 ── */

/** 音频项 */
export interface IAudioItem {
  id: string;
  file: File;
  name: string;
  url: string;         // objectURL
  duration: number;    // 时长（秒）
  sampleRate: number;  // 采样率
  channels: number;    // 声道数
  format: string;      // 原始格式（文件扩展名）
  audioBuffer: AudioBuffer | null; // 解码后的 buffer，懒加载
}

/** 音频裁剪配置 */
export interface IAudioTrimConfig {
  enabled: boolean;
  startTime: number;  // 起始时间 秒
  endTime: number;    // 结束时间 秒
}

/** 音量归一化模式 */
export type NormalizeMode = 'peak' | 'rms';

/** 音量归一化配置 */
export interface INormalizeConfig {
  enabled: boolean;
  mode: NormalizeMode;
  targetDb: number;  // 目标 dB，peak 模式推荐 -1，rms 模式推荐 -16
}

/** 降噪配置 */
export interface INoiseReductionConfig {
  enabled: boolean;
  highPassFreq: number;   // 高通滤波频率 Hz，0 表示禁用
  lowPassFreq: number;    // 低通滤波频率 Hz，0 表示禁用
  noiseGateThreshold: number; // 频谱门限降噪阈值 dB，-60 ~ -20
}

/** 音频格式输出选项 */
export type AudioOutputFormat = 'wav' | 'mp3' | 'ogg' | 'm4a';

/** 音频格式转换配置 */
export interface IAudioFormatConfig {
  enabled: boolean;
  format: AudioOutputFormat;
  quality: number;  // 0-1
}

/** 音频批量处理链配置 */
export interface IAudioProcessChain {
  trim: IAudioTrimConfig;
  normalize: INormalizeConfig;
  noiseReduction: INoiseReductionConfig;
  format: IAudioFormatConfig;
}

/** 音频处理结果 */
export interface IAudioProcessResult {
  itemId: string;
  name: string;
  blob: Blob;
  url: string;
  duration: number;
  peakDbBefore: number;
  peakDbAfter: number;
  rmsDbBefore: number;
  rmsDbAfter: number;
}
