// 标注数据通用类型定义

/** 标注形状类型 */
export type AnnotationShapeType = 'rectangle' | 'polygon';

/** 单个标注对象（像素坐标，左上角为原点） */
export interface IAnnotationBox {
  id: string;
  label: string;
  /** 形状类型：矩形或多边形 */
  shapeType: AnnotationShapeType;
  /** 左上角 x（像素坐标），矩形必填，多边形为外接矩形 */
  x: number;
  /** 左上角 y（像素坐标），矩形必填，多边形为外接矩形 */
  y: number;
  width: number;
  height: number;
  /** 多边形顶点（相对图片像素坐标），仅 shapeType='polygon' 时有 */
  points?: [number, number][];
  color?: string;
}

/** 单张图片的标注数据 */
export interface IAnnotationImage {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  boxes: IAnnotationBox[];
  format: AnnotationFormat;
}

/** 支持的标注格式 */
export type AnnotationFormat = 'voc' | 'coco' | 'yolo' | 'labelme';

/** 标注草稿（用于 localStorage 持久化） */
export interface IAnnotationDraft {
  images: IAnnotationImage[];
  currentImageId: string | null;
  categories: string[];
}

/* ── VOC XML 结构 ── */
export interface VocAnnotation {
  filename: string;
  width: number;
  height: number;
  depth: number;
  objects: VocObject[];
}

export interface VocObject {
  name: string;
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

/* ── COCO JSON 结构 ── */
export interface CocoAnnotation {
  images: CocoImage[];
  annotations: CocoAnnotationItem[];
  categories: CocoCategory[];
}

export interface CocoImage {
  id: number;
  file_name: string;
  width: number;
  height: number;
}

export interface CocoAnnotationItem {
  id: number;
  image_id: number;
  category_id: number;
  bbox: [number, number, number, number]; // [x, y, width, height]
  iscrowd: number;
  /** 多边形分割，每个元素是一组 [x1,y1,x2,y2,...] */
  segmentation?: number[][];
  area?: number;
}

export interface CocoCategory {
  id: number;
  name: string;
}

/* ── YOLO txt 结构 ── */
export interface YoloLine {
  classIndex: number;
  cx: number; // 中心点 x 归一化 (0-1)
  cy: number; // 中心点 y 归一化 (0-1)
  w: number;  // 宽度归一化 (0-1)
  h: number;  // 高度归一化 (0-1)
}

/* ── LabelMe JSON 结构 ── */
export interface LabelMeAnnotation {
  version: string;
  flags: Record<string, unknown>;
  shapes: LabelMeShape[];
  imagePath: string;
  imageData: string | null;
  imageHeight: number;
  imageWidth: number;
}

export interface LabelMeShape {
  label: string;
  points: [number, number][];
  shape_type: 'rectangle' | 'polygon' | 'circle' | 'line' | 'point';
  flags: Record<string, unknown>;
}

/* ── 视频标注（帧间插值） ── */

/** 视频帧标注数据 */
export interface IVideoFrameAnnotation {
  frameIndex: number;      // 帧序号
  timestamp: number;       // 时间戳（秒）
  width: number;
  height: number;
  boxes: IAnnotationBox[]; // 该帧所有标注
}

/** 同一目标的关键帧对（用于插值） */
export interface ITrackKeyframe {
  trackId: string;       // 目标跟踪 ID
  label: string;
  shapeType: AnnotationShapeType;
  startFrame: number;
  endFrame: number;
  startBox: IAnnotationBox;
  endBox: IAnnotationBox;
}

/** 视频标注工程 */
export interface IVideoAnnotationProject {
  id: string;
  name: string;
  videoUrl: string;
  videoName: string;
  duration: number;
  fps: number;
  width: number;
  height: number;
  totalFrames: number;
  frames: IVideoFrameAnnotation[];  // 已标注的帧
  tracks: ITrackKeyframe[];         // 跟踪目标关键帧对
  categories: string[];
}

/** 帧时间戳映射 */
export interface IFrameTimestampMap {
  frameIndex: number;
  timestamp: number;
}

/* ── 数据集版本管理 ── */

/** 数据增强参数快照 */
export interface IAugmentSnapshot {
  enabled: boolean;
  flipHorizontal: boolean;
  flipVertical: boolean;
  rotateRange: number;  // 0-180
  brightnessRange: number; // 0-100
  contrastRange: number;   // 0-100
}

/** 数据集切分参数快照 */
export interface ISplitSnapshot {
  trainRatio: number;
  valRatio: number;
  testRatio: number;
  seed: number;
}

/** 数据集版本快照 */
export interface IDatasetVersion {
  id: string;
  version: string;       // 版本号，如 v1.0.0
  name: string;          // 版本名称/备注
  createdAt: number;     // 保存时间戳
  imageCount: number;    // 图片总数
  boxCount: number;      // 标注框总数
  categoryCount: number; // 类别数
  categories: { name: string; count: number }[];  // 各类别统计
  format: AnnotationFormat;  // 使用的标注格式
  // pipeline 参数（可复现）
  augmentConfig: IAugmentSnapshot | null;
  splitConfig: ISplitSnapshot | null;
  // 数据摘要（用于版本对比，不存完整图片数据）
  imageNames: string[];  // 图片名列表
  boxCountPerImage: Record<string, number>; // 每张图的标注框数
}

/** 版本对比结果 */
export interface IVersionDiff {
  addedImages: string[];     // 新增图片名
  removedImages: string[];   // 删除图片名
  boxCountDiff: number;      // 标注框数量变化
  categoryDiff: { name: string; oldCount: number; newCount: number }[];
  imageCountDiff: number;
}

/* ── 语义检索 ── */

/** 语义检索条件 */
export interface ISemanticSearchFilters {
  keyword: string;              // 文件名关键词
  categories: string[];        // 包含的类别名（多选，命中任一即可）
  categoryMatch: 'any' | 'all'; // 类别匹配模式
  minBoxCount: number;         // 最少标注框数
  maxBoxCount: number;         // 最多标注框数，0 表示不限
  minBoxArea: number;          // 最小标注框面积（像素）
  maxBoxArea: number;          // 最大标注框面积，0 表示不限
  minAspectRatio: number;      // 最小宽高比
  maxAspectRatio: number;      // 最大宽高比，0 表示不限
}

/* ── 质检相关 ── */
export type QualityIssueType =
  | 'missing_annotation'   // 漏标（图片无标注框）
  | 'box_too_small'        // 标注框过小
  | 'box_too_large'        // 标注框过大
  | 'aspect_ratio_abnormal'// 宽高比异常
  | 'unknown_category'     // 未知类别
  | 'corrupted_image'      // 图片损坏
  | 'missing_file';        // 标注文件缺失

export interface IQualityIssue {
  imageName: string;
  type: QualityIssueType;
  description: string;
  boxId?: string;
}

export interface IQualityReport {
  totalImages: number;
  totalBoxes: number;
  issueImages: number;
  issueCount: number;
  issuesByType: Record<QualityIssueType, number>;
  issues: IQualityIssue[];
  categories: string[];
  passRate: number;
}

/** 质检配置 */
export interface IQualityConfig {
  minBoxArea: number;     // 最小框面积（像素²）
  maxBoxAreaRatio: number; // 最大框占图片比例 (0-1)
  maxAspectRatio: number;  // 最大宽高比（如 10 表示宽/高或高/宽 ≤10）
  knownCategories: string[]; // 预设类别列表
}

/* ── 模型推理相关 ── */

/** 模型加载状态 */
export type ModelLoadState = 'idle' | 'loading' | 'ready' | 'failed';

/** 模型推理结果（单个检测框） */
export interface IModelDetection {
  label: string;
  confidence: number;
  bbox: [number, number, number, number]; // [x, y, width, height]
  /** 多边形分割点（如果是实例分割模型） */
  points?: [number, number][];
}

/** 模型推理配置 */
export interface IModelInferenceConfig {
  modelName: string;       // 模型名称标识
  confidenceThreshold: number; // 置信度阈值 0-1
  iouThreshold: number;    // NMS IoU 阈值
  maxDetections: number;   // 最大检测数
}
