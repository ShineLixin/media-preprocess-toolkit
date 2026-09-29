// 语义检索工具 - 基于文件名、类别、标注属性多条件组合检索

import type { IAnnotationImage, ISemanticSearchFilters } from '@/types/annotation';

/** 对图片数据集进行语义检索过滤 */
export function semanticSearch(
  images: IAnnotationImage[],
  filters: ISemanticSearchFilters
): IAnnotationImage[] {
  return images.filter((img) => {
    // 1. 文件名关键词
    if (filters.keyword.trim()) {
      const kw = filters.keyword.trim().toLowerCase();
      if (!img.name.toLowerCase().includes(kw)) return false;
    }

    // 2. 类别匹配
    if (filters.categories.length > 0) {
      const imgLabels = new Set(img.boxes.map((b) => b.label));
      if (filters.categoryMatch === 'all') {
        // 必须包含所有选中类别
        if (!filters.categories.every((c) => imgLabels.has(c))) return false;
      } else {
        // 任一命中即可
        if (!filters.categories.some((c) => imgLabels.has(c))) return false;
      }
    }

    // 3. 标注框数量区间
    if (filters.minBoxCount > 0 && img.boxes.length < filters.minBoxCount) {
      return false;
    }
    if (filters.maxBoxCount > 0 && img.boxes.length > filters.maxBoxCount) {
      return false;
    }

    // 4. 标注框面积区间
    if (filters.minBoxArea > 0 || filters.maxBoxArea > 0) {
      const hasMatch = img.boxes.some((box) => {
        const area = box.width * box.height;
        if (filters.minBoxArea > 0 && area < filters.minBoxArea) return false;
        if (filters.maxBoxArea > 0 && area > filters.maxBoxArea) return false;
        return true;
      });
      if (!hasMatch) return false;
    }

    // 5. 宽高比区间
    if (filters.minAspectRatio > 0 || filters.maxAspectRatio > 0) {
      const hasMatch = img.boxes.some((box) => {
        const ratio = box.height > 0 ? box.width / box.height : 0;
        if (filters.minAspectRatio > 0 && ratio < filters.minAspectRatio) return false;
        if (filters.maxAspectRatio > 0 && ratio > filters.maxAspectRatio) return false;
        return true;
      });
      if (!hasMatch) return false;
    }

    return true;
  });
}

/** 获取所有不重复的类别名 */
export function getAllCategories(images: IAnnotationImage[]): string[] {
  const set = new Set<string>();
  for (const img of images) {
    for (const box of img.boxes) {
      set.add(box.label);
    }
  }
  return [...set].sort();
}

/** 默认检索条件 */
export function defaultSearchFilters(): ISemanticSearchFilters {
  return {
    keyword: '',
    categories: [],
    categoryMatch: 'any',
    minBoxCount: 0,
    maxBoxCount: 0,
    minBoxArea: 0,
    maxBoxArea: 0,
    minAspectRatio: 0,
    maxAspectRatio: 0,
  };
}
