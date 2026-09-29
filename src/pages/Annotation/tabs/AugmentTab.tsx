import { useState, useCallback, useRef, useMemo } from 'react';
import {
  Upload,
  Wand2,
  Eye,
  Download,
  Settings,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Palette,
  Droplets,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Image } from '@/components/ui/image';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit-lite';
import JSZip from 'jszip';
import type { IAnnotationImage, IAnnotationBox, AnnotationFormat } from '@/types/annotation';
import type { IAugmentConfig, IAugmentedImage } from '@/types/annotation-stats';
import { augmentImage, getDefaultAugmentConfig } from '@/utils/annotation/augment';
import {
  parseVocXml,
  vocToBoxes,
  parseCocoJson,
  cocoToImageMap,
  parseLabelMeJson,
  labelMeToBoxes,
  detectAnnotationFormat,
  boxesToVocXml,
  imagesToCocoJson,
  boxesToYoloTxt,
  boxesToLabelMeJson,
  getAnnotationFileExt,
  getColorForLabel,
} from '@/utils/annotation/formats';
import { readFileAsText, getImageSize, downloadBlob, stripExtension } from '@/utils/file/fileUtils';

export default function AugmentTab() {
  const [images, setImages] = useState<IAnnotationImage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [augmented, setAugmented] = useState<IAugmentedImage[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [config, setConfig] = useState<IAugmentConfig>(getDefaultAugmentConfig());

  const fileInputRef = useRef<HTMLInputElement>(null);
  const annInputRef = useRef<HTMLInputElement>(null);

  const selectedImage = images.find((i) => i.id === selectedId) ?? null;
  const previewAug = augmented.find((a) => a.id === previewId) ?? null;

  /* ── 上传图片 ── */
  const handleImageUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newItems: IAnnotationImage[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;
      const url = URL.createObjectURL(file);
      try {
        const { width, height } = await getImageSize(file);
        newItems.push({
          id: Math.random().toString(36).slice(2, 10),
          name: file.name,
          url,
          width,
          height,
          boxes: [],
          format: 'voc',
        });
      } catch (err) {
        logger.warn('图片读取失败:', String(err));
      }
    }
    setImages((prev) => {
      const next = [...prev, ...newItems];
      if (!selectedId && newItems.length > 0) setSelectedId(newItems[0].id);
      return next;
    });
    toast.success(`已添加 ${newItems.length} 张图片`);
  }, [selectedId]);

  /* ── 上传标注文件 ── */
  const handleAnnotationUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      let matched = 0;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const name = file.name.toLowerCase();
        if (!name.endsWith('.xml') && !name.endsWith('.json') && !name.endsWith('.txt')) continue;
        try {
          const content = await readFileAsText(file);
          const fmt = detectAnnotationFormat(file.name, content);
          if (!fmt) continue;

          // COCO：整文件批量匹配
          if (fmt === 'coco') {
            const coco = parseCocoJson(content);
            const map = cocoToImageMap(coco);
            setImages((prev) => {
              const next = [...prev];
              map.forEach((entry, imgId) => {
                const idx = next.findIndex(
                  (img) => img.name === entry.image.file_name || stripExtension(img.name) === entry.image.file_name
                );
                if (idx >= 0) {
                  next[idx] = { ...next[idx], boxes: entry.boxes, format: 'coco', width: entry.image.width, height: entry.image.height };
                  matched++;
                }
              });
              return next;
            });
            continue;
          }

          // VOC / YOLO / LabelMe：按文件名匹配图片
          const baseName = stripExtension(file.name);
          setImages((prev) => {
            const next = [...prev];
            const idx = next.findIndex(
              (img) => stripExtension(img.name) === baseName
            );
            if (idx >= 0) {
              let boxes: IAnnotationBox[] = [];
              if (fmt === 'voc') {
                boxes = vocToBoxes(parseVocXml(content));
              } else if (fmt === 'labelme') {
                boxes = labelMeToBoxes(parseLabelMeJson(content));
              } else if (fmt === 'yolo') {
                const catList: string[] = []; // YOLO 无类别名，暂用索引
                boxes = (window as any).__yolo_categories__
                  ? yoloBoxesFromContent(content, next[idx].width, next[idx].height, (window as any).__yolo_categories__)
                  : yoloBoxesFromContent(content, next[idx].width, next[idx].height, catList);
              }
              next[idx] = { ...next[idx], boxes, format: fmt };
              matched++;
            }
            return next;
          });
        } catch (err) {
          logger.warn('标注文件读取失败:', String(err));
        }
      }
      toast.success(`已匹配 ${matched} 个标注文件`);
    },
    []
  );

  /* ── 执行增强 ── */
  const handleAugment = useCallback(async () => {
    if (images.length === 0) {
      toast.info('请先上传图片');
      return;
    }
    setIsProcessing(true);
    setProgress(0);
    setAugmented([]);
    setPreviewId(null);

    try {
      const allAugmented: IAugmentedImage[] = [];
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const results = await augmentImage(img, config);
        allAugmented.push(...results);
        setProgress(Math.round(((i + 1) / images.length) * 100));
      }
      setAugmented(allAugmented);
      if (allAugmented.length > 0) setPreviewId(allAugmented[0].id);
      toast.success(`增强完成，生成 ${allAugmented.length} 张图片`);
    } catch (err) {
      toast.error('增强失败');
      logger.error('数据增强失败:', String(err));
    } finally {
      setIsProcessing(false);
    }
  }, [images, config]);

  /* ── 批量导出 ── */
  const handleExport = useCallback(async () => {
    if (augmented.length === 0) {
      toast.info('暂无增强结果');
      return;
    }
    setIsProcessing(true);
    try {
      const zip = new JSZip();
      const imgFolder = zip.folder('images');
      const annFolder = zip.folder('annotations');

      const categories = Array.from(
        new Set(augmented.flatMap((a) => a.boxes.map((b) => b.label)))
      ).sort();

      for (let i = 0; i < augmented.length; i++) {
        const aug = augmented[i];
        const baseName = stripExtension(aug.sourceName) + `_aug_${i}`;
        const imgName = baseName + '.png';

        if (aug.blob) {
          imgFolder?.file(imgName, aug.blob);
        }

        // VOC 格式导出
        const vocXml = boxesToVocXml(imgName, aug.width, aug.height, aug.boxes);
        annFolder?.file(baseName + '.xml', vocXml);
      }

      // 类别列表
      zip.file('classes.txt', categories.join('\n'));

      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, 'augmented_dataset.zip');
      toast.success('导出成功');
    } catch (err) {
      toast.error('导出失败');
      logger.error('增强导出失败:', String(err));
    } finally {
      setIsProcessing(false);
    }
  }, [augmented]);

  /* ── 绘制标注框到预览图 ── */
  const drawBoxes = useCallback(
    (canvas: HTMLCanvasElement, boxes: IAnnotationBox[], w: number, h: number, scale: number) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      boxes.forEach((b) => {
        const color = b.color ?? getColorForLabel(b.label);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(b.x * scale, b.y * scale, b.width * scale, b.height * scale);
        ctx.fillStyle = color;
        const label = b.label;
        ctx.font = '12px sans-serif';
        const textW = ctx.measureText(label).width + 8;
        ctx.fillRect(b.x * scale, Math.max(0, b.y * scale - 18), textW, 18);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, b.x * scale + 4, Math.max(14, b.y * scale - 4));
      });
    },
    []
  );

  return (
    <div className="grid grid-cols-12 gap-4 h-[calc(100vh-260px)] min-h-[560px]">
      {/* 左侧：图片列表 */}
      <div className="col-span-2 flex flex-col gap-3 min-h-0">
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleImageUpload(e.target.files)}
          />
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-3.5 mr-1" />
            图片
          </Button>
          <input
            ref={annInputRef}
            type="file"
            accept=".xml,.json,.txt"
            multiple
            className="hidden"
            onChange={(e) => handleAnnotationUpload(e.target.files)}
          />
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={() => annInputRef.current?.click()}
          >
            <Upload className="size-3.5 mr-1" />
            标注
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">{images.length} 张图片</div>
        <ScrollArea className="flex-1 border rounded-md">
          {images.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              暂无图片
            </div>
          ) : (
            <div className="p-1 space-y-0.5">
              {images.map((img) => (
                <button
                  key={img.id}
                  onClick={() => {
                    setSelectedId(img.id);
                    setAugmented([]);
                    setPreviewId(null);
                  }}
                  className={`w-full text-left px-2 py-1.5 rounded text-xs truncate hover:bg-muted/60 ${
                    selectedId === img.id ? 'bg-accent text-accent-foreground' : ''
                  }`}
                >
                  <span className="block truncate">{img.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {img.boxes.length} 个标注框
                  </span>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* 中间：预览区 */}
      <div className="col-span-6 flex flex-col gap-3 min-h-0">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">
            {previewAug ? (
              <>
                增强预览：{previewAug.sourceName}
                <Badge variant="outline" className="ml-2">
                  {previewAug.augmentType}
                </Badge>
              </>
            ) : selectedImage ? (
              <>原图预览：{selectedImage.name}</>
            ) : (
              '预览区'
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{augmented.length} 张增强结果</Badge>
          </div>
        </div>

        <div className="flex-1 border rounded-md overflow-hidden bg-muted/30 flex items-center justify-center relative">
          {previewAug ? (
            <AugmentPreview
              url={previewAug.url}
              boxes={previewAug.boxes}
              drawBoxes={drawBoxes}
            />
          ) : selectedImage ? (
            <AugmentPreview
              url={selectedImage.url}
              boxes={selectedImage.boxes}
              drawBoxes={drawBoxes}
            />
          ) : (
            <div className="text-sm text-muted-foreground">
              选择图片查看预览
            </div>
          )}
        </div>

        {/* 增强结果缩略图列表 */}
        {augmented.length > 0 && (
          <div className="border rounded-md p-2">
            <div className="text-xs text-muted-foreground mb-2">增强结果</div>
            <ScrollArea className="h-24">
              <div className="flex gap-2">
                {augmented.map((aug) => (
                  <button
                    key={aug.id}
                    onClick={() => setPreviewId(aug.id)}
                    className={`shrink-0 relative h-20 w-20 rounded border-2 overflow-hidden ${
                      previewId === aug.id ? 'border-primary' : 'border-transparent'
                    }`}
                  >
                    <Image src={aug.url} alt="" className="w-full h-full object-cover" />
                    <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1 truncate">
                      {aug.augmentType}
                    </span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      {/* 右侧：参数配置 */}
      <div className="col-span-4 flex flex-col gap-3 min-h-0">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Settings className="size-4" />
              增强配置
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 数量设置 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">增强数量/图</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={config.numAugments}
                  onChange={(e) =>
                    setConfig({ ...config, numAugments: Math.max(1, Math.min(20, parseInt(e.target.value) || 1)) })
                  }
                />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <Switch
                  id="keep-original"
                  checked={config.keepOriginal}
                  onCheckedChange={(v) => setConfig({ ...config, keepOriginal: v })}
                />
                <Label htmlFor="keep-original" className="text-xs cursor-pointer">
                  保留原图
                </Label>
              </div>
            </div>

            {/* 边界策略 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">越界处理</Label>
                <Select
                  value={config.borderPolicy}
                  onValueChange={(v: 'crop' | 'filter') =>
                    setConfig({ ...config, borderPolicy: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="crop">裁剪到边界</SelectItem>
                    <SelectItem value="filter">按可见度过滤</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">可见度阈值</Label>
                <div className="pt-2">
                  <Slider
                    value={[config.visibilityThreshold * 100]}
                    min={0}
                    max={100}
                    step={5}
                    onValueChange={([v]) =>
                      setConfig({ ...config, visibilityThreshold: v / 100 })
                    }
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">增强方式</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <AugmentToggle
              icon={FlipHorizontal}
              label="水平翻转"
              checked={config.flip.enabled && config.flip.horizontal}
              onCheckedChange={(v) =>
                setConfig({
                  ...config,
                  flip: { ...config.flip, enabled: v || config.flip.vertical, horizontal: v },
                })
              }
            />
            <AugmentToggle
              icon={FlipVertical}
              label="垂直翻转"
              checked={config.flip.enabled && config.flip.vertical}
              onCheckedChange={(v) =>
                setConfig({
                  ...config,
                  flip: { ...config.flip, enabled: v || config.flip.horizontal, vertical: v },
                })
              }
            />
            <AugmentToggle
              icon={RotateCw}
              label="90°/180°/270° 旋转"
              checked={config.rotate.enabled}
              onCheckedChange={(v) =>
                setConfig({ ...config, rotate: { ...config.rotate, enabled: v } })
              }
            />
            <AugmentToggle
              icon={Palette}
              label="颜色抖动 (亮度/对比度/饱和度)"
              checked={config.color.enabled}
              onCheckedChange={(v) =>
                setConfig({ ...config, color: { ...config.color, enabled: v } })
              }
            />
            <AugmentToggle
              icon={Droplets}
              label="高斯模糊"
              checked={config.blur.enabled}
              onCheckedChange={(v) =>
                setConfig({ ...config, blur: { ...config.blur, enabled: v } })
              }
            />
            <AugmentToggle
              icon={Sparkles}
              label="随机噪声"
              checked={config.noise.enabled}
              onCheckedChange={(v) =>
                setConfig({ ...config, noise: { ...config.noise, enabled: v } })
              }
            />
          </CardContent>
        </Card>

        <div className="flex gap-2 mt-auto">
          <Button
            className="flex-1"
            onClick={handleAugment}
            disabled={isProcessing || images.length === 0}
          >
            <Wand2 className="size-4 mr-2" />
            {isProcessing ? `增强中 ${progress}%` : '开始增强'}
          </Button>
          <Button
            variant="secondary"
            onClick={handleExport}
            disabled={augmented.length === 0 || isProcessing}
          >
            <Download className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function AugmentToggle({
  icon: Icon,
  label,
  checked,
  onCheckedChange,
}: {
  icon: any;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <span className="text-xs">{label}</span>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function AugmentPreview({
  url,
  boxes,
  drawBoxes,
}: {
  url: string;
  boxes: IAnnotationBox[];
  drawBoxes: (canvas: HTMLCanvasElement, boxes: IAnnotationBox[], w: number, h: number, scale: number) => void;
}) {
  const canvasRef = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (!canvas) return;
      const img = new window.Image();
      img.onload = () => {
        const parent = canvas.parentElement;
        if (!parent) return;
        const maxW = parent.clientWidth - 32;
        const maxH = parent.clientHeight - 32;
        const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
        const dw = Math.round(img.naturalWidth * ratio);
        const dh = Math.round(img.naturalHeight * ratio);
        canvas.width = dw;
        canvas.height = dh;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, dw, dh);
        drawBoxes(canvas, boxes, dw, dh, ratio);
      };
      img.src = url;
    },
    [url, boxes, drawBoxes]
  );

  return <canvas ref={canvasRef} className="max-w-full max-h-full" />;
}

function yoloBoxesFromContent(
  content: string,
  w: number,
  h: number,
  categories: string[]
): IAnnotationBox[] {
  const lines = content.split('\n').filter((l) => l.trim());
  const boxes: IAnnotationBox[] = [];
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;
    const classIdx = parseInt(parts[0], 10);
    const label = categories[classIdx] ?? `class_${classIdx}`;
    const cx = parseFloat(parts[1]) * w;
    const cy = parseFloat(parts[2]) * h;
    const bw = parseFloat(parts[3]) * w;
    const bh = parseFloat(parts[4]) * h;
    boxes.push({
      id: Math.random().toString(36).slice(2, 10),
      label,
      x: cx - bw / 2,
      y: cy - bh / 2,
      width: bw,
      height: bh,
      color: getColorForLabel(label),
      shapeType: 'rectangle',
    });
  }
  return boxes;
}
