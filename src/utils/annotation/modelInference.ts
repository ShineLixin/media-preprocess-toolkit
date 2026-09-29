/**
 * 浏览器端模型推理工具
 *
 * 设计原则：
 * - 优先尝试加载轻量目标检测模型（预留 ONNX Runtime Web / Transformers.js 接入点）
 * - 当前版本使用「占位实现 + 边缘检测回退」保证可用性
 * - 模型加载状态通过 Promise 暴露，首次使用后缓存到 scopedStorage 标记
 * - 后续可替换为真实模型（如 YOLOv8n ONNX、MobileNet SSD 等），外部 API 不变
 */

import { scopedStorage } from '@lark-apaas/client-toolkit-lite';
import type { IModelDetection, IModelInferenceConfig, ModelLoadState } from '@/types/annotation';
import { cannyEdgeDetect, extractCandidateBoxes } from './edgeDetection';
import { getColorForLabel } from './formats';

const MODEL_CACHE_KEY = 'model_inference_cache_v1';

interface ModelCacheMeta {
  modelName: string;
  cachedAt: number;
  sizeBytes: number;
}

/**
 * 模型推理引擎
 *
 * 当前实现：占位检测模型
 * - 模拟加载延迟
 * - 使用边缘检测结果生成候选框（作为"模型输出"的占位/回退）
 * - 真实模型接入时仅需替换 load() 和 runInference() 内部
 */
export class ModelInferenceEngine {
  private state: ModelLoadState = 'idle';
  private config: IModelInferenceConfig;
  private loadPromise: Promise<void> | null = null;
  private failReason: string = '';

  constructor(config: Partial<IModelInferenceConfig> = {}) {
    this.config = {
      modelName: config.modelName ?? 'yolov8n-placeholder',
      confidenceThreshold: config.confidenceThreshold ?? 0.5,
      iouThreshold: config.iouThreshold ?? 0.45,
      maxDetections: config.maxDetections ?? 50,
    };
  }

  getState(): ModelLoadState {
    return this.state;
  }

  getFailReason(): string {
    return this.failReason;
  }

  getConfig(): IModelInferenceConfig {
    return { ...this.config };
  }

  setConfig(patch: Partial<IModelInferenceConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  /**
   * 加载模型。当前为占位实现，模拟下载 + 初始化过程。
   * 真实接入时在此处下载权重、初始化推理会话。
   */
  async load(): Promise<void> {
    if (this.state === 'ready') return;
    if (this.state === 'loading' && this.loadPromise) return this.loadPromise;

    this.state = 'loading';
    this.loadPromise = this.doLoad();
    try {
      await this.loadPromise;
      this.state = 'ready';
      this.saveCacheMeta();
    } catch (err) {
      this.state = 'failed';
      this.failReason = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      this.loadPromise = null;
    }
  }

  private async doLoad(): Promise<void> {
    // TODO: 真实模型接入点
    //
    // 示例（onnxruntime-web）：
    //   import ort from 'onnxruntime-web';
    //   const session = await ort.InferenceSession.create(modelUrl);
    //   this.session = session;
    //
    // 示例（@xenova/transformers）：
    //   import { pipeline } from '@xenova/transformers';
    //   this.detector = await pipeline('object-detection', 'Xenova/detr-resnet-50');

    // 占位：模拟模型下载 + 初始化
    await new Promise((r) => setTimeout(r, 800));

    // 模拟 10% 概率失败，方便测试回退路径（真实实现去掉）
    // if (Math.random() < 0.1) throw new Error('模型权重下载失败');
  }

  /** 检查本地是否有缓存（占位，真实实现检查 IndexedDB） */
  hasLocalCache(): boolean {
    try {
      const raw = scopedStorage.getItem(MODEL_CACHE_KEY);
      if (!raw) return false;
      const meta = JSON.parse(raw) as ModelCacheMeta;
      return meta.modelName === this.config.modelName && Date.now() - meta.cachedAt < 7 * 24 * 3600 * 1000;
    } catch {
      return false;
    }
  }

  private saveCacheMeta(): void {
    try {
      const meta: ModelCacheMeta = {
        modelName: this.config.modelName,
        cachedAt: Date.now(),
        sizeBytes: 0, // 占位
      };
      scopedStorage.setItem(MODEL_CACHE_KEY, JSON.stringify(meta));
    } catch {
      /* ignore */
    }
  }

  /**
   * 对单张图片执行推理。
   * 模型未加载时先加载；加载失败抛错，由调用方决定是否回退到边缘检测。
   */
  async detect(imageData: ImageData): Promise<{ detections: IModelDetection[]; usedModel: boolean }> {
    if (this.state === 'idle') {
      await this.load();
    }
    if (this.state === 'loading' && this.loadPromise) {
      await this.loadPromise;
    }
    if (this.state !== 'ready') {
      throw new Error(this.failReason || '模型未就绪');
    }

    // TODO: 真实模型推理接入点
    // const outputs = await this.session.run({ images: preprocessedTensor });
    // return postProcess(outputs, this.config);

    // 占位：返回空结果（让调用方回退到边缘检测）
    // 真实实现时这里返回模型输出
    return { detections: [], usedModel: true };
  }

  /** 释放资源 */
  dispose(): void {
    // TODO: 释放 ONNX session / Transformers pipeline
    this.state = 'idle';
    this.loadPromise = null;
  }
}

/**
 * 模型推理 + 边缘检测回退的统一入口
 *
 * 优先使用模型，失败时自动回退到边缘检测方案，并返回回退原因。
 */
export async function runDetectionWithFallback(
  engine: ModelInferenceEngine,
  imageData: ImageData,
  defaultLabel: string = 'object'
): Promise<{
  detections: IModelDetection[];
  usedModel: boolean;
  fallbackReason?: string;
}> {
  try {
    const result = await engine.detect(imageData);
    // 如果模型有真实输出，直接返回
    if (result.detections.length > 0) {
      return result;
    }
    // 模型返回空结果（占位模型的典型状态），回退到边缘检测
    const edges = cannyEdgeDetect(imageData, 50, 100);
    const boxes = extractCandidateBoxes(
      edges,
      Math.max(100, imageData.width * imageData.height * 0.001),
      20
    );
    const detections: IModelDetection[] = boxes.map((b) => ({
      label: defaultLabel,
      confidence: 0.0, // 边缘检测无置信度
      bbox: [b.x, b.y, b.width, b.height],
    }));
    return {
      detections,
      usedModel: false,
      fallbackReason: '模型未产出结果，已回退到边缘检测预标注',
    };
  } catch (err) {
    // 模型加载/推理失败，回退到边缘检测
    const edges = cannyEdgeDetect(imageData, 50, 100);
    const boxes = extractCandidateBoxes(
      edges,
      Math.max(100, imageData.width * imageData.height * 0.001),
      20
    );
    const detections: IModelDetection[] = boxes.map((b) => ({
      label: defaultLabel,
      confidence: 0.0,
      bbox: [b.x, b.y, b.width, b.height],
    }));
    return {
      detections,
      usedModel: false,
      fallbackReason: err instanceof Error ? `模型推理失败：${err.message}，已回退到边缘检测` : '已回退到边缘检测',
    };
  }
}

/**
 * 从检测结果生成带颜色的标注框（用于导入画布）
 */
export function detectionsToBoxes(
  detections: IModelDetection[],
  colorMap: (label: string) => string = getColorForLabel
): Array<{
  label: string;
  shapeType: 'rectangle';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  confidence: number;
}> {
  return detections.map((d) => ({
    label: d.label,
    shapeType: 'rectangle' as const,
    x: d.bbox[0],
    y: d.bbox[1],
    width: d.bbox[2],
    height: d.bbox[3],
    color: colorMap(d.label),
    confidence: d.confidence,
  }));
}
