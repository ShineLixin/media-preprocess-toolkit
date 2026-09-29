import type { IAnnotationImage, AnnotationFormat } from '@/types/annotation';
import type { ISplitConfig, ISplitResult } from '@/types/annotation-stats';

/**
 * 数据集切分工具
 * 支持按比例切分 + 分层采样（按类别分布）
 */

/** 简易 seeded random（mulberry32 算法），保证同种子结果一致 */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates 洗牌 */
function shuffle<T>(arr: T[], randFn: () => number): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(randFn() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * 获取图片的主类别（用于分层采样，取标注框最多的类别）
 */
function getDominantClass(image: IAnnotationImage): string {
  if (image.boxes.length === 0) return '__noclass__';
  const counts = new Map<string, number>();
  for (const box of image.boxes) {
    counts.set(box.label, (counts.get(box.label) ?? 0) + 1);
  }
  let maxLabel = '';
  let maxCount = -1;
  for (const [label, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      maxLabel = label;
    }
  }
  return maxLabel;
}

/**
 * 按类别分组
 */
function groupByClass(images: IAnnotationImage[]): Map<string, IAnnotationImage[]> {
  const groups = new Map<string, IAnnotationImage[]>();
  for (const img of images) {
    const cls = getDominantClass(img);
    if (!groups.has(cls)) {
      groups.set(cls, []);
    }
    groups.get(cls)!.push(img);
  }
  return groups;
}

/**
 * 切分数据集
 */
export function splitDataset(
  images: IAnnotationImage[],
  config: ISplitConfig
): ISplitResult {
  const { trainRatio, valRatio, testRatio, seed, stratified } = config;

  // 校验比例
  const total = trainRatio + valRatio + testRatio;
  if (Math.abs(total - 1) > 0.001) {
    // 归一化
    const norm = total;
    return splitDataset(images, {
      ...config,
      trainRatio: trainRatio / norm,
      valRatio: valRatio / norm,
      testRatio: testRatio / norm,
    });
  }

  const randFn = mulberry32(seed);

  const train: IAnnotationImage[] = [];
  const val: IAnnotationImage[] = [];
  const test: IAnnotationImage[] = [];

  if (stratified) {
    // 分层采样：按主类别分组，每组内按比例切分
    const groups = groupByClass(images);
    groups.forEach((groupImages) => {
      const shuffled = shuffle(groupImages, randFn);
      const n = shuffled.length;
      const trainEnd = Math.round(n * trainRatio);
      const valEnd = trainEnd + Math.round(n * valRatio);
      for (let i = 0; i < trainEnd; i++) train.push(shuffled[i]);
      for (let i = trainEnd; i < valEnd; i++) val.push(shuffled[i]);
      for (let i = valEnd; i < n; i++) test.push(shuffled[i]);
    });
  } else {
    // 普通随机切分
    const shuffled = shuffle(images, randFn);
    const n = shuffled.length;
    const trainEnd = Math.round(n * trainRatio);
    const valEnd = trainEnd + Math.round(n * valRatio);
    for (let i = 0; i < trainEnd; i++) train.push(shuffled[i]);
    for (let i = trainEnd; i < valEnd; i++) val.push(shuffled[i]);
    for (let i = valEnd; i < n; i++) test.push(shuffled[i]);
  }

  // 统计
  const countStats = (list: IAnnotationImage[]) => ({
    imageCount: list.length,
    boxCount: list.reduce((s, img) => s + img.boxes.length, 0),
  });

  return {
    train,
    val,
    test,
    trainStats: countStats(train),
    valStats: countStats(val),
    testStats: countStats(test),
  };
}

/**
 * 生成 YOLO 格式的 data.yaml 内容
 */
export function generateDataYaml(
  categories: string[],
  trainDir = 'images/train',
  valDir = 'images/val',
  testDir = 'images/test'
): string {
  const namesYaml = categories.map((c, i) => `  ${i}: ${c}`).join('\n');
  return `# YOLO dataset configuration
path: ./dataset
train: ${trainDir}
val: ${valDir}
test: ${testDir}

names:
${namesYaml}
`;
}

/**
 * 生成 COCO 格式的切分 JSON（单个文件，用 split 字段区分）
 */
export function generateSplitCocoJson(
  splitResult: ISplitResult,
  categories: string[]
): string {
  const catList = categories.map((name, i) => ({ id: i + 1, name }));
  const catIdMap = new Map(categories.map((n, i) => [n, i + 1]));

  let imgId = 1;
  let annId = 1;
  const allImages: Array<{
    id: number;
    file_name: string;
    width: number;
    height: number;
    split: 'train' | 'val' | 'test';
  }> = [];
  const allAnnotations: Array<{
    id: number;
    image_id: number;
    category_id: number;
    bbox: [number, number, number, number];
    iscrowd: number;
    split: 'train' | 'val' | 'test';
  }> = [];

  const processSplit = (
    images: IAnnotationImage[],
    split: 'train' | 'val' | 'test'
  ) => {
    images.forEach((img) => {
      allImages.push({
        id: imgId,
        file_name: img.name,
        width: img.width,
        height: img.height,
        split,
      });
      img.boxes.forEach((b) => {
        const catId = catIdMap.get(b.label) ?? 1;
        allAnnotations.push({
          id: annId++,
          image_id: imgId,
          category_id: catId,
          bbox: [b.x, b.y, b.width, b.height],
          iscrowd: 0,
          split,
        });
      });
      imgId++;
    });
  };

  processSplit(splitResult.train, 'train');
  processSplit(splitResult.val, 'val');
  processSplit(splitResult.test, 'test');

  return JSON.stringify(
    {
      images: allImages,
      annotations: allAnnotations,
      categories: catList,
    },
    null,
    2
  );
}

/** 默认切分配置 */
export function getDefaultSplitConfig(): ISplitConfig {
  return {
    trainRatio: 0.7,
    valRatio: 0.2,
    testRatio: 0.1,
    seed: 42,
    stratified: true,
    outputFormat: 'yolo',
  };
}
