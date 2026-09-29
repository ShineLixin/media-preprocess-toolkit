import type {
  AnnotationFormat,
  IAnnotationBox,
  IAnnotationImage,
  VocAnnotation,
  VocObject,
  CocoAnnotation,
  CocoImage,
  CocoAnnotationItem,
  CocoCategory,
  YoloLine,
  LabelMeAnnotation,
  LabelMeShape,
} from '@/types/annotation';

/* ── 多边形工具函数 ── */

/** 根据多边形顶点计算外接矩形 */
export function getBboxFromPoints(points: [number, number][]): { x: number; y: number; width: number; height: number } {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [px, py] of points) {
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** 计算多边形面积（鞋带公式） */
export function getPolygonArea(points: [number, number][]): number {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

/** 生成唯一 ID */
function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** 类别配色表（稳定哈希） */
const COLOR_PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#6366f1',
  '#06b6d4', '#84cc16', '#f59e0b', '#10b981', '#a855f7',
];

export function getColorForLabel(label: string): string {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  }
  return COLOR_PALETTE[hash % COLOR_PALETTE.length];
}

/* ──────────────────── VOC XML ↔ 通用 IAnnotationBox ──────────────────── */

/** 解析 VOC XML 字符串 */
export function parseVocXml(xmlStr: string): VocAnnotation {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlStr, 'text/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) throw new Error('VOC XML 解析失败');

  const filename = doc.querySelector('filename')?.textContent ?? '';
  const sizeEl = doc.querySelector('size');
  const width = parseInt(sizeEl?.querySelector('width')?.textContent ?? '0', 10);
  const height = parseInt(sizeEl?.querySelector('height')?.textContent ?? '0', 10);
  const depth = parseInt(sizeEl?.querySelector('depth')?.textContent ?? '3', 10);

  const objects: VocObject[] = [];
  doc.querySelectorAll('object').forEach((objEl) => {
    const name = objEl.querySelector('name')?.textContent ?? '';
    const bndbox = objEl.querySelector('bndbox');
    if (!bndbox) return;
    objects.push({
      name,
      xmin: parseFloat(bndbox.querySelector('xmin')?.textContent ?? '0'),
      ymin: parseFloat(bndbox.querySelector('ymin')?.textContent ?? '0'),
      xmax: parseFloat(bndbox.querySelector('xmax')?.textContent ?? '0'),
      ymax: parseFloat(bndbox.querySelector('ymax')?.textContent ?? '0'),
    });
  });

  return { filename, width, height, depth, objects };
}

/** VOC → 通用 boxes */
export function vocToBoxes(voc: VocAnnotation): IAnnotationBox[] {
  return voc.objects.map((obj) => ({
    id: uid(),
    label: obj.name,
    shapeType: 'rectangle' as const,
    x: obj.xmin,
    y: obj.ymin,
    width: obj.xmax - obj.xmin,
    height: obj.ymax - obj.ymin,
    color: getColorForLabel(obj.name),
  }));
}

/** 通用 boxes → VOC XML 字符串 */
export function boxesToVocXml(name: string, width: number, height: number, boxes: IAnnotationBox[]): string {
  const objXml = boxes
    .map(
      (b) => {
        // 多边形导出其最小外接矩形
        const note = b.shapeType === 'polygon' ? '    <!-- polygon exported as bbox (minimum enclosing rectangle) -->\n' : '';
        return `  <object>
    <name>${b.label}</name>
    <pose>Unspecified</pose>
    <truncated>0</truncated>
    <difficulty>0</difficulty>
${note}    <bndbox>
      <xmin>${Math.round(b.x)}</xmin>
      <ymin>${Math.round(b.y)}</ymin>
      <xmax>${Math.round(b.x + b.width)}</xmax>
      <ymax>${Math.round(b.y + b.height)}</ymax>
    </bndbox>
  </object>`;
      }
    )
    .join('\n');

  return `<annotation>
  <filename>${name}</filename>
  <size>
    <width>${width}</width>
    <height>${height}</height>
    <depth>3</depth>
  </size>
${objXml}
</annotation>`;
}

/* ──────────────────── COCO JSON ↔ 通用 ──────────────────── */

/** 解析 COCO JSON 字符串 */
export function parseCocoJson(jsonStr: string): CocoAnnotation {
  const data = JSON.parse(jsonStr) as CocoAnnotation;
  return {
    images: data.images ?? [],
    annotations: data.annotations ?? [],
    categories: data.categories ?? [],
  };
}

/** COCO → 按图片分组的标注 (通用 boxes 数组) */
export function cocoToImageMap(
  coco: CocoAnnotation
): Map<number, { image: CocoImage; boxes: IAnnotationBox[] }> {
  const map = new Map<number, { image: CocoImage; boxes: IAnnotationBox[] }>();
  coco.images.forEach((img) => {
    map.set(img.id, { image: img, boxes: [] });
  });

  const catMap = new Map<number, string>();
  coco.categories.forEach((c) => catMap.set(c.id, c.name));

  coco.annotations.forEach((ann) => {
    const entry = map.get(ann.image_id);
    if (!entry) return;
    const label = catMap.get(ann.category_id) ?? `class_${ann.category_id}`;
    const [x, y, w, h] = ann.bbox;
    // 如有 segmentation 多边形，解析为 points
    let shapeType: 'rectangle' | 'polygon' = 'rectangle';
    let points: [number, number][] | undefined;
    if (
      ann.segmentation &&
      ann.segmentation.length > 0 &&
      Array.isArray(ann.segmentation[0]) &&
      ann.segmentation[0].length >= 6
    ) {
      const seg = ann.segmentation[0];
      const pts: [number, number][] = [];
      for (let i = 0; i + 1 < seg.length; i += 2) {
        pts.push([seg[i], seg[i + 1]]);
      }
      if (pts.length >= 3) {
        shapeType = 'polygon';
        points = pts;
      }
    }
    entry.boxes.push({
      id: uid(),
      label,
      shapeType,
      x,
      y,
      width: w,
      height: h,
      points,
      color: getColorForLabel(label),
    });
  });

  return map;
}

/** 通用 images[] → COCO JSON */
export function imagesToCocoJson(images: IAnnotationImage[], categories: string[]): string {
  const catList: CocoCategory[] = categories.map((name, i) => ({ id: i + 1, name }));
  const catIdMap = new Map(categories.map((n, i) => [n, i + 1]));

  const cocoImages: CocoImage[] = images.map((img, i) => ({
    id: i + 1,
    file_name: img.name,
    width: img.width,
    height: img.height,
  }));

  let annId = 1;
  const annotations: CocoAnnotationItem[] = [];
  images.forEach((img, i) => {
    const imageId = i + 1;
    img.boxes.forEach((b) => {
      const catId = catIdMap.get(b.label) ?? 1;
      const ann: CocoAnnotationItem = {
        id: annId++,
        image_id: imageId,
        category_id: catId,
        bbox: [b.x, b.y, b.width, b.height],
        iscrowd: 0,
        area:
          b.shapeType === 'polygon' && b.points
            ? getPolygonArea(b.points)
            : b.width * b.height,
      };
      // 多边形导出 segmentation 字段
      if (b.shapeType === 'polygon' && b.points && b.points.length >= 3) {
        const seg: number[] = [];
        for (const [px, py] of b.points) {
          seg.push(px, py);
        }
        ann.segmentation = [seg];
      }
      annotations.push(ann);
    });
  });

  const coco: CocoAnnotation = {
    images: cocoImages,
    annotations,
    categories: catList,
  };
  return JSON.stringify(coco, null, 2);
}

/* ──────────────────── YOLO txt ↔ 通用 ──────────────────── */

/** 解析 YOLO txt 一行 */
export function parseYoloLine(line: string): YoloLine | null {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 5) return null;
  return {
    classIndex: parseInt(parts[0], 10),
    cx: parseFloat(parts[1]),
    cy: parseFloat(parts[2]),
    w: parseFloat(parts[3]),
    h: parseFloat(parts[4]),
  };
}

/** YOLO txt → 通用 boxes（需要图尺寸 + 类别列表） */
export function yoloToBoxes(
  txtContent: string,
  imgWidth: number,
  imgHeight: number,
  categories: string[]
): IAnnotationBox[] {
  const lines = txtContent.split('\n').filter((l) => l.trim().length > 0);
  const boxes: IAnnotationBox[] = [];
  for (const line of lines) {
    const yolo = parseYoloLine(line);
    if (!yolo) continue;
    const label = categories[yolo.classIndex] ?? `class_${yolo.classIndex}`;
    const w = yolo.w * imgWidth;
    const h = yolo.h * imgHeight;
    boxes.push({
      id: uid(),
      label,
      shapeType: 'rectangle' as const,
      x: yolo.cx * imgWidth - w / 2,
      y: yolo.cy * imgHeight - h / 2,
      width: w,
      height: h,
      color: getColorForLabel(label),
    });
  }
  return boxes;
}

/** 通用 boxes → YOLO txt 内容（根据类别列表映射索引） */
export function boxesToYoloTxt(
  boxes: IAnnotationBox[],
  imgWidth: number,
  imgHeight: number,
  categories: string[]
): string {
  const catIndex = new Map(categories.map((c, i) => [c, i]));
  const lines: string[] = [];
  let hasPolygon = false;
  boxes.forEach((b) => {
    const idx = catIndex.get(b.label) ?? 0;
    // 多边形导出其最小外接矩形（YOLO 仅支持矩形框）
    const cx = (b.x + b.width / 2) / imgWidth;
    const cy = (b.y + b.height / 2) / imgHeight;
    const w = b.width / imgWidth;
    const h = b.height / imgHeight;
    lines.push(`${idx} ${cx.toFixed(6)} ${cy.toFixed(6)} ${w.toFixed(6)} ${h.toFixed(6)}`);
    if (b.shapeType === 'polygon') hasPolygon = true;
  });
  if (hasPolygon) {
    lines.unshift('# Note: polygon annotations exported as bounding boxes (minimum enclosing rectangles)');
  }
  return lines.join('\n');
}

/* ──────────────────── LabelMe JSON ↔ 通用 ──────────────────── */

/** 解析 LabelMe JSON */
export function parseLabelMeJson(jsonStr: string): LabelMeAnnotation {
  const data = JSON.parse(jsonStr) as LabelMeAnnotation;
  return data;
}

/** LabelMe → 通用 boxes（支持 rectangle / polygon） */
export function labelMeToBoxes(lm: LabelMeAnnotation): IAnnotationBox[] {
  const boxes: IAnnotationBox[] = [];
  lm.shapes.forEach((shape) => {
    if (shape.shape_type === 'rectangle' && shape.points.length >= 2) {
      const [[x1, y1], [x2, y2]] = shape.points as [[number, number], [number, number]];
      const x = Math.min(x1, x2);
      const y = Math.min(y1, y2);
      const w = Math.abs(x2 - x1);
      const h = Math.abs(y2 - y1);
      boxes.push({
        id: uid(),
        label: shape.label,
        shapeType: 'rectangle',
        x,
        y,
        width: w,
        height: h,
        color: getColorForLabel(shape.label),
      });
    } else if (shape.shape_type === 'polygon' && shape.points.length >= 3) {
      const bbox = getBboxFromPoints(shape.points);
      boxes.push({
        id: uid(),
        label: shape.label,
        shapeType: 'polygon',
        x: bbox.x,
        y: bbox.y,
        width: bbox.width,
        height: bbox.height,
        points: [...shape.points],
        color: getColorForLabel(shape.label),
      });
    }
  });
  return boxes;
}

/** 通用 boxes → LabelMe JSON */
export function boxesToLabelMeJson(
  imagePath: string,
  width: number,
  height: number,
  boxes: IAnnotationBox[]
): string {
  const shapes: LabelMeShape[] = boxes.map((b) => {
    if (b.shapeType === 'polygon' && b.points && b.points.length >= 3) {
      return { label: b.label, shape_type: 'polygon', points: [...b.points], flags: {} };
    }
    return {
      label: b.label,
      shape_type: 'rectangle',
      points: [
        [b.x, b.y],
        [b.x + b.width, b.y + b.height],
      ],
      flags: {},
    };
  });
  const lm: LabelMeAnnotation = {
    version: '5.0.1',
    flags: {},
    imagePath,
    imageData: null,
    imageWidth: width,
    imageHeight: height,
    shapes,
  };
  return JSON.stringify(lm, null, 2);
}

/* ──────────────────── 格式自动识别 ──────────────────── */

/** 根据文件名/内容推断标注格式 */
export function detectAnnotationFormat(filename: string, content: string): AnnotationFormat | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.xml') && content.includes('<annotation>')) return 'voc';
  if (lower.endsWith('.json')) {
    try {
      const data = JSON.parse(content);
      if (Array.isArray(data.images) && Array.isArray(data.annotations) && Array.isArray(data.categories)) {
        return 'coco';
      }
      if (data.shapes && data.imagePath !== undefined) return 'labelme';
    } catch {
      /* ignore */
    }
  }
  if (lower.endsWith('.txt')) {
    // YOLO: 每行 5 个数字，首列为整数
    const firstLine = content.split('\n').find((l) => l.trim().length > 0);
    if (firstLine) {
      const parts = firstLine.trim().split(/\s+/);
      if (parts.length >= 5 && /^\d+$/.test(parts[0])) return 'yolo';
    }
  }
  return null;
}

/* ──────────────────── 获取目标文件扩展名 ──────────────────── */
export function getAnnotationFileExt(format: AnnotationFormat): string {
  switch (format) {
    case 'voc':
      return '.xml';
    case 'coco':
      return '.json';
    case 'yolo':
      return '.txt';
    case 'labelme':
      return '.json';
  }
}

export { uid };
