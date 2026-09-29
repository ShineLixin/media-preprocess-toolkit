import type {
  IAnnotationImage,
  IQualityConfig,
  IQualityIssue,
  IQualityReport,
  QualityIssueType,
} from '@/types/annotation';

/** 默认质检配置 */
export const DEFAULT_QUALITY_CONFIG: IQualityConfig = {
  minBoxArea: 100,           // 10x10 像素以下算过小
  maxBoxAreaRatio: 0.8,      // 超过图片 80% 算过大
  maxAspectRatio: 15,        // 宽高比超过 15:1 算异常
  knownCategories: [],       // 从数据中提取
};

/**
 * 对一批标注图片执行质检
 */
export function runQualityCheck(
  images: IAnnotationImage[],
  config: Partial<IQualityConfig> = {}
): IQualityReport {
  const cfg: IQualityConfig = { ...DEFAULT_QUALITY_CONFIG, ...config };

  // 先收集所有已知类别（若配置中未指定）
  if (cfg.knownCategories.length === 0) {
    const set = new Set<string>();
    images.forEach((img) => img.boxes.forEach((b) => set.add(b.label)));
    cfg.knownCategories = Array.from(set);
  }

  const issues: IQualityIssue[] = [];
  const issuesByType: Record<QualityIssueType, number> = {
    missing_annotation: 0,
    box_too_small: 0,
    box_too_large: 0,
    aspect_ratio_abnormal: 0,
    unknown_category: 0,
    corrupted_image: 0,
    missing_file: 0,
  };
  const issueImageSet = new Set<string>();
  let totalBoxes = 0;

  images.forEach((img) => {
    const imgArea = img.width * img.height;

    // 漏标检测
    if (img.boxes.length === 0) {
      issues.push({
        imageName: img.name,
        type: 'missing_annotation',
        description: '该图片无任何标注框，可能为漏标样本',
      });
      issuesByType.missing_annotation++;
      issueImageSet.add(img.id);
    }

    img.boxes.forEach((box) => {
      totalBoxes++;
      const area = box.width * box.height;

      // 标注框过小
      if (area < cfg.minBoxArea) {
        issues.push({
          imageName: img.name,
          type: 'box_too_small',
          description: `标注框 "${box.label}" 面积 ${Math.round(area)}px² 小于阈值 ${cfg.minBoxArea}px²`,
          boxId: box.id,
        });
        issuesByType.box_too_small++;
        issueImageSet.add(img.id);
      }

      // 标注框过大
      if (area > cfg.maxBoxAreaRatio * imgArea) {
        issues.push({
          imageName: img.name,
          type: 'box_too_large',
          description: `标注框 "${box.label}" 占图片面积 ${((area / imgArea) * 100).toFixed(1)}%，超过阈值 ${(cfg.maxBoxAreaRatio * 100).toFixed(0)}%`,
          boxId: box.id,
        });
        issuesByType.box_too_large++;
        issueImageSet.add(img.id);
      }

      // 宽高比异常
      if (box.width > 0 && box.height > 0) {
        const ratio = box.width / box.height;
        const ratioInv = box.height / box.width;
        if (ratio > cfg.maxAspectRatio || ratioInv > cfg.maxAspectRatio) {
          issues.push({
            imageName: img.name,
            type: 'aspect_ratio_abnormal',
            description: `标注框 "${box.label}" 宽高比 ${ratio.toFixed(2)} 异常（阈值 ${cfg.maxAspectRatio}）`,
            boxId: box.id,
          });
          issuesByType.aspect_ratio_abnormal++;
          issueImageSet.add(img.id);
        }
      }

      // 未知类别
      if (cfg.knownCategories.length > 0 && !cfg.knownCategories.includes(box.label)) {
        issues.push({
          imageName: img.name,
          type: 'unknown_category',
          description: `类别 "${box.label}" 不在预设类别列表中`,
          boxId: box.id,
        });
        issuesByType.unknown_category++;
        issueImageSet.add(img.id);
      }
    });
  });

  const passRate = images.length > 0 ? (1 - issueImageSet.size / images.length) * 100 : 100;

  return {
    totalImages: images.length,
    totalBoxes,
    issueImages: issueImageSet.size,
    issueCount: issues.length,
    issuesByType,
    issues,
    categories: cfg.knownCategories,
    passRate,
  };
}

/** 问题类型中文映射 */
export const QUALITY_ISSUE_LABELS: Record<QualityIssueType, string> = {
  missing_annotation: '漏标',
  box_too_small: '标注框过小',
  box_too_large: '标注框过大',
  aspect_ratio_abnormal: '宽高比异常',
  unknown_category: '未知类别',
  corrupted_image: '图片损坏',
  missing_file: '文件缺失',
};
