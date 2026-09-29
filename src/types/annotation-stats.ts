// 数据集统计相关类型定义

import type { IAnnotationImage } from './annotation';

/** 数据集统计概览 */
export interface IDatasetStatsOverview {
  totalImages: number;        // 图片总数
  totalBoxes: number;         // 标注框总数
  categoryCount: number;      // 类别数
  avgBoxesPerImage: number;   // 平均每图目标数
  annotatedRatio: number;     // 带标注图片占比 (0-1)
  minBoxesPerImage: number;   // 最少每图目标数
  maxBoxesPerImage: number;   // 最多每图目标数
}

/** 类别统计项 */
export interface ICategoryStat {
  label: string;
  imageCount: number;   // 含该类别的图片数
  boxCount: number;     // 该类别的标注框总数
  color: string;
}

/** 尺寸分布区间 */
export interface ISizeBin {
  label: string;     // 区间标签，如 "0-1k"
  min: number;       // 最小面积
  max: number;       // 最大面积
  count: number;     // 框数量
}

/** 宽高比分布区间 */
export interface IAspectRatioBin {
  label: string;
  min: number;
  max: number;
  count: number;
}

/** 每图目标数分布区间 */
export interface IPerImageBin {
  label: string;
  min: number;
  max: number;
  count: number;
}

/** 完整的数据集统计结果 */
export interface IDatasetStats {
  overview: IDatasetStatsOverview;
  categoryStats: ICategoryStat[];                    // 按类别统计
  areaDistribution: ISizeBin[];                      // 标注框面积分布
  aspectRatioDistribution: IAspectRatioBin[];        // 宽高比分布
  perImageDistribution: IPerImageBin[];              // 每图目标数分布
  images: IAnnotationImage[];                        // 原始数据引用
}

/* ── 数据增强相关 ── */

/** 水平翻转 */
export interface IFlipAugment {
  enabled: boolean;
  horizontal: boolean;
  vertical: boolean;
}

/** 旋转变换 */
export interface IRotateAugment {
  enabled: boolean;
  angles: number[];  // 预设旋转角度列表（如 [90, 180, 270]）
  angleRange?: { min: number; max: number }; // 随机角度范围
}

/** 颜色抖动 */
export interface IColorAugment {
  enabled: boolean;
  brightnessRange: [number, number]; // [-50, 50]
  contrastRange: [number, number];
  saturationRange: [number, number];
}

/** 模糊 */
export interface IBlurAugment {
  enabled: boolean;
  minSigma: number;
  maxSigma: number;
}

/** 噪声 */
export interface INoiseAugment {
  enabled: boolean;
  intensity: number; // 0-100
}

/** 数据增强配置 */
export interface IAugmentConfig {
  numAugments: number;       // 每张原图生成的增强数量
  keepOriginal: boolean;     // 是否保留原图
  visibilityThreshold: number; // 增强后标注框可见度阈值 (0-1)，低于则裁剪或删除
  borderPolicy: 'crop' | 'filter'; // 越出边界处理方式：裁剪 or 过滤
  flip: IFlipAugment;
  rotate: IRotateAugment;
  color: IColorAugment;
  blur: IBlurAugment;
  noise: INoiseAugment;
}

/** 单张增强结果 */
export interface IAugmentedImage {
  id: string;
  sourceName: string;
  augmentType: string;  // 如 "hflip" / "rotate_90" / "color_jitter"
  url: string;          // objectURL
  width: number;
  height: number;
  boxes: import('./annotation').IAnnotationBox[];
  blob?: Blob;
}

/* ── 数据集切分相关 ── */

/** 数据集切分配置 */
export interface ISplitConfig {
  trainRatio: number;    // 0-1
  valRatio: number;      // 0-1
  testRatio: number;     // 0-1
  seed: number;          // 随机种子
  stratified: boolean;   // 是否按类别分层采样
  outputFormat: 'yolo' | 'coco'; // 导出格式
}

/** 切分结果 */
export interface ISplitResult {
  train: IAnnotationImage[];
  val: IAnnotationImage[];
  test: IAnnotationImage[];
  trainStats: { imageCount: number; boxCount: number };
  valStats: { imageCount: number; boxCount: number };
  testStats: { imageCount: number; boxCount: number };
}

/* ── OCR 批量识别相关 ── */

/** 单张图片的批量 OCR 结果 */
export interface IBatchOcrResult {
  imageId: string;
  imageName: string;
  fields: Array<{
    fieldId: string;
    fieldName: string;
    text: string;
    confidence: number;
  }>;
}
