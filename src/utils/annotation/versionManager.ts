// 数据集版本管理工具 - 基于 localStorage 存储版本快照

import type {
  IDatasetVersion,
  IAnnotationImage,
  IVersionDiff,
  AnnotationFormat,
} from '@/types/annotation';
import { scopedStorage } from '@lark-apaas/client-toolkit-lite';

const STORAGE_KEY = 'dataset_versions';

/** 获取所有版本（按创建时间倒序） */
export function getAllVersions(): IDatasetVersion[] {
  try {
    const raw = scopedStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const versions = JSON.parse(raw) as IDatasetVersion[];
    return versions.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

/** 获取单个版本 */
export function getVersion(id: string): IDatasetVersion | null {
  const all = getAllVersions();
  return all.find((v) => v.id === id) || null;
}

/** 保存新版本快照 */
export function saveVersion(
  images: IAnnotationImage[],
  params: {
    version: string;
    name: string;
    format: AnnotationFormat;
    augmentConfig?: IDatasetVersion['augmentConfig'];
    splitConfig?: IDatasetVersion['splitConfig'];
  }
): IDatasetVersion {
  // 统计
  const categoryMap = new Map<string, number>();
  let totalBoxes = 0;
  const boxCountPerImage: Record<string, number> = {};

  for (const img of images) {
    boxCountPerImage[img.name] = img.boxes.length;
    totalBoxes += img.boxes.length;
    for (const box of img.boxes) {
      categoryMap.set(box.label, (categoryMap.get(box.label) || 0) + 1);
    }
  }

  const categories = Array.from(categoryMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const version: IDatasetVersion = {
    id: Math.random().toString(36).slice(2, 10),
    version: params.version,
    name: params.name,
    createdAt: Date.now(),
    imageCount: images.length,
    boxCount: totalBoxes,
    categoryCount: categories.length,
    categories,
    format: params.format,
    augmentConfig: params.augmentConfig ?? null,
    splitConfig: params.splitConfig ?? null,
    imageNames: images.map((i) => i.name),
    boxCountPerImage,
  };

  const all = getAllVersions();
  all.push(version);
  scopedStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  return version;
}

/** 删除版本 */
export function deleteVersion(id: string): void {
  const all = getAllVersions().filter((v) => v.id !== id);
  scopedStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

/** 对比两个版本 */
export function compareVersions(
  v1: IDatasetVersion,
  v2: IDatasetVersion
): IVersionDiff {
  const set1 = new Set(v1.imageNames);
  const set2 = new Set(v2.imageNames);

  const added = [...set2].filter((n) => !set1.has(n));
  const removed = [...set1].filter((n) => !set2.has(n));

  const catMap1 = new Map(v1.categories.map((c) => [c.name, c.count]));
  const catMap2 = new Map(v2.categories.map((c) => [c.name, c.count]));
  const allCatNames = new Set([...catMap1.keys(), ...catMap2.keys()]);

  const categoryDiff = [...allCatNames]
    .map((name) => ({
      name,
      oldCount: catMap1.get(name) || 0,
      newCount: catMap2.get(name) || 0,
    }))
    .sort((a, b) => b.newCount - a.newCount);

  return {
    addedImages: added,
    removedImages: removed,
    boxCountDiff: v2.boxCount - v1.boxCount,
    imageCountDiff: v2.imageCount - v1.imageCount,
    categoryDiff,
  };
}

/** 生成下一个版本号（基于已有版本） */
export function getNextVersion(bump: 'patch' | 'minor' | 'major' = 'patch'): string {
  const all = getAllVersions();
  if (all.length === 0) return 'v1.0.0';

  // 解析最新版本号
  const latest = all[0].version.replace(/^v/, '');
  const parts = latest.split('.').map((n) => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);

  if (bump === 'major') {
    return `v${parts[0] + 1}.0.0`;
  } else if (bump === 'minor') {
    return `v${parts[0]}.${parts[1] + 1}.0`;
  } else {
    return `v${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  }
}
