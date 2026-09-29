import type {
  IDatasetStats,
  IDatasetStatsOverview,
  ICategoryStat,
  ISizeBin,
  IAspectRatioBin,
  IPerImageBin,
} from '@/types/annotation-stats';
import type { IAnnotationImage } from '@/types/annotation';
import { getColorForLabel } from './formats';

/**
 * 数据集统计工具 - 计算各类分布指标
 */

/** 生成面积分布的区间（对数刻度更合理） */
function createAreaBins(maxArea: number): ISizeBin[] {
  // 使用对数刻度：0~100, 100~500, 500~1k, 1k~5k, 5k~10k, 10k~50k, 50k~100k, 100k+
  const edges = [0, 100, 500, 1000, 5000, 10000, 50000, 100000];
  const bins: ISizeBin[] = edges.map((min, i) => {
    const max = edges[i + 1] ?? Infinity;
    const label = formatBinLabel(min, max);
    return { label, min, max, count: 0 };
  });
  // 如果最大面积 < 100，简化区间
  if (maxArea < 100) {
    return [
      { label: '0-50', min: 0, max: 50, count: 0 },
      { label: '50-100', min: 50, max: 100, count: 0 },
      { label: '100+', min: 100, max: Infinity, count: 0 },
    ];
  }
  return bins;
}

function formatBinLabel(min: number, max: number): string {
  if (max === Infinity) {
    return `${formatNum(min)}+`;
  }
  return `${formatNum(min)}-${formatNum(max)}`;
}

function formatNum(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(0)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

/** 宽高比分布区间 */
function createAspectRatioBins(): IAspectRatioBin[] {
  // 对数刻度：1/8, 1/4, 1/2, 1/1, 2/1, 4/1, 8/1
  const ratios = [0.125, 0.25, 0.5, 1, 2, 4, 8];
  const bins: IAspectRatioBin[] = [];
  for (let i = 0; i <= ratios.length; i++) {
    const min = i === 0 ? 0 : ratios[i - 1];
    const max = i === ratios.length ? Infinity : ratios[i];
    const label = i === 0
      ? `<1:8`
      : i === ratios.length
        ? `>8:1`
        : `${ratios[i - 1] < 1 ? `1:${Math.round(1 / ratios[i - 1])}` : `${ratios[i - 1]}:1`}~${ratios[i] < 1 ? `1:${Math.round(1 / ratios[i])}` : `${ratios[i]}:1`}`;
    bins.push({ label, min, max, count: 0 });
  }
  return bins;
}

/** 每图目标数分布 */
function createPerImageBins(maxCount: number): IPerImageBin[] {
  if (maxCount <= 5) {
    const bins: IPerImageBin[] = [];
    for (let i = 0; i <= maxCount; i++) {
      bins.push({ label: `${i}`, min: i, max: i, count: 0 });
    }
    return bins;
  }
  if (maxCount <= 20) {
    return [
      { label: '0', min: 0, max: 0, count: 0 },
      { label: '1-3', min: 1, max: 3, count: 0 },
      { label: '4-6', min: 4, max: 6, count: 0 },
      { label: '7-10', min: 7, max: 10, count: 0 },
      { label: '10+', min: 11, max: Infinity, count: 0 },
    ];
  }
  return [
    { label: '0', min: 0, max: 0, count: 0 },
    { label: '1-5', min: 1, max: 5, count: 0 },
    { label: '6-10', min: 6, max: 10, count: 0 },
    { label: '11-20', min: 11, max: 20, count: 0 },
    { label: '21-50', min: 21, max: 50, count: 0 },
    { label: '50+', min: 51, max: Infinity, count: 0 },
  ];
}

/**
 * 计算数据集完整统计
 * @param images 图片标注数据列表
 * @param filterCategories 可选的类别筛选，仅统计指定类别（空=全部）
 */
export function computeDatasetStats(
  images: IAnnotationImage[],
  filterCategories: string[] = []
): IDatasetStats {
  // 过滤（类别筛选时，保留图片但只统计选中类别的框）
  const categorySet = new Set(filterCategories);
  const hasFilter = filterCategories.length > 0;

  // 概览
  let totalBoxes = 0;
  let annotatedImages = 0;
  let minBoxes = Infinity;
  let maxBoxes = -Infinity;
  const categoryMap = new Map<string, { imageSet: Set<string>; boxCount: number }>();

  // 最大框面积
  let maxArea = 0;
  const boxAreas: number[] = [];
  const aspectRatios: number[] = [];
  const perImageCounts: number[] = [];

  images.forEach((img) => {
    const visibleBoxes = hasFilter
      ? img.boxes.filter((b) => categorySet.has(b.label))
      : img.boxes;

    const boxCount = visibleBoxes.length;
    perImageCounts.push(boxCount);

    if (boxCount > 0) annotatedImages++;
    totalBoxes += boxCount;
    minBoxes = Math.min(minBoxes, boxCount);
    maxBoxes = Math.max(maxBoxes, boxCount);

    visibleBoxes.forEach((box) => {
      const area = box.width * box.height;
      boxAreas.push(area);
      maxArea = Math.max(maxArea, area);

      const ratio = box.height > 0 ? box.width / box.height : 0;
      aspectRatios.push(ratio);

      // 类别统计
      if (!categoryMap.has(box.label)) {
        categoryMap.set(box.label, { imageSet: new Set(), boxCount: 0 });
      }
      const entry = categoryMap.get(box.label)!;
      entry.imageSet.add(img.id);
      entry.boxCount++;
    });
  });

  // 概览
  const overview: IDatasetStatsOverview = {
    totalImages: images.length,
    totalBoxes,
    categoryCount: categoryMap.size,
    avgBoxesPerImage: images.length > 0 ? totalBoxes / images.length : 0,
    annotatedRatio: images.length > 0 ? annotatedImages / images.length : 0,
    minBoxesPerImage: images.length > 0 ? minBoxes : 0,
    maxBoxesPerImage: images.length > 0 ? Math.max(0, maxBoxes) : 0,
  };

  // 类别统计
  const categoryStats: ICategoryStat[] = Array.from(categoryMap.entries())
    .map(([label, val]) => ({
      label,
      imageCount: val.imageSet.size,
      boxCount: val.boxCount,
      color: getColorForLabel(label),
    }))
    .sort((a, b) => b.boxCount - a.boxCount);

  // 面积分布
  const areaBins = createAreaBins(maxArea);
  boxAreas.forEach((area) => {
    const bin = areaBins.find((b) => area >= b.min && area < b.max);
    if (bin) bin.count++;
  });

  // 宽高比分布
  const arBins = createAspectRatioBins();
  aspectRatios.forEach((ratio) => {
    const bin = arBins.find((b) => ratio >= b.min && ratio < b.max);
    if (bin) bin.count++;
  });

  // 每图目标数分布
  const maxPerImage = maxBoxes >= 0 ? maxBoxes : 0;
  const perImageBins = createPerImageBins(maxPerImage);
  perImageCounts.forEach((c) => {
    const bin = perImageBins.find((b) => c >= b.min && c <= b.max);
    if (bin) bin.count++;
  });

  return {
    overview,
    categoryStats,
    areaDistribution: areaBins,
    aspectRatioDistribution: arBins,
    perImageDistribution: perImageBins,
    images,
  };
}

/** 获取数据集中的所有类别（去重） */
export function getAllCategories(images: IAnnotationImage[]): string[] {
  const set = new Set<string>();
  images.forEach((img) => {
    img.boxes.forEach((b) => set.add(b.label));
  });
  return Array.from(set).sort();
}
