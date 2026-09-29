import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Image as ImageIcon, FileText, Download, RefreshCw, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit-lite';
import type {
  AnnotationFormat,
  IAnnotationImage,
  IAnnotationBox,
} from '@/types/annotation';
import {
  detectAnnotationFormat,
  parseVocXml,
  vocToBoxes,
  parseCocoJson,
  cocoToImageMap,
  yoloToBoxes,
  parseLabelMeJson,
  labelMeToBoxes,
  boxesToVocXml,
  imagesToCocoJson,
  boxesToYoloTxt,
  boxesToLabelMeJson,
  getAnnotationFileExt,
  uid,
  getColorForLabel,
} from '@/utils/annotation/formats';
import { readFileAsText, zipAndDownload, getImageSize, stripExtension } from '@/utils/file/fileUtils';
import AnnotationCanvas from '../components/AnnotationCanvas';

const FORMAT_LABELS: Record<AnnotationFormat, string> = {
  voc: 'VOC XML',
  coco: 'COCO JSON',
  yolo: 'YOLO txt',
  labelme: 'LabelMe JSON',
};

export default function FormatConvertTab() {
  const [images, setImages] = useState<IAnnotationImage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [targetFormat, setTargetFormat] = useState<AnnotationFormat>('coco');
  const [isProcessing, setIsProcessing] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const annoInputRef = useRef<HTMLInputElement>(null);

  const selectedImage = images.find((i) => i.id === selectedId) ?? null;

  /* ── 图片上传 ── */
  const handleImageUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsProcessing(true);
    const newImages: IAnnotationImage[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/')) continue;
        const url = URL.createObjectURL(file);
        try {
          const { width, height } = await getImageSize(file);
          // 检查是否已存在同名图片
          const existing = images.find((img) => img.name === file.name);
          if (existing) continue;
          newImages.push({
            id: uid(),
            name: file.name,
            url,
            width,
            height,
            boxes: [],
            format: 'voc',
          });
        } catch (err) {
          logger.warn('图片读取失败:', file.name, String(err));
        }
      }
      setImages((prev) => [...prev, ...newImages]);
      if (newImages.length > 0 && !selectedId) {
        setSelectedId(newImages[0].id);
      }
      toast.success(`已添加 ${newImages.length} 张图片`);
    } finally {
      setIsProcessing(false);
    }
  }, [images, selectedId]);

  /* ── 标注文件上传 & 自动解析 ── */
  const handleAnnotationUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsProcessing(true);
    let matched = 0;
    try {
      // 先收集所有标注文件内容
      const updatedImages = [...images];
      const categoriesSet = new Set<string>();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        let content: string;
        try {
          content = await readFileAsText(file);
        } catch {
          continue;
        }

        const format = detectAnnotationFormat(file.name, content);
        if (!format) continue;

        const baseName = stripExtension(file.name);
        // 找到对应的图片（同名匹配）
        let imgIdx = updatedImages.findIndex((img) => stripExtension(img.name) === baseName);

        // COCO 特殊处理：一个 JSON 对应多张图
        if (format === 'coco') {
          try {
            const coco = parseCocoJson(content);
            const imgMap = cocoToImageMap(coco);
            imgMap.forEach(({ image, boxes }) => {
              const idx = updatedImages.findIndex((img) => img.name === image.file_name);
              if (idx >= 0) {
                updatedImages[idx] = {
                  ...updatedImages[idx],
                  width: image.width || updatedImages[idx].width,
                  height: image.height || updatedImages[idx].height,
                  boxes,
                  format: 'coco',
                };
                boxes.forEach((b) => categoriesSet.add(b.label));
                matched++;
              }
            });
            continue;
          } catch (err) {
            logger.warn('COCO 解析失败:', String(err));
            continue;
          }
        }

        // 其他格式：单文件单图
        if (imgIdx < 0) continue;

        let boxes: IAnnotationBox[] = [];
        try {
          switch (format) {
            case 'voc': {
              const voc = parseVocXml(content);
              boxes = vocToBoxes(voc);
              break;
            }
            case 'yolo': {
              const img = updatedImages[imgIdx];
              // YOLO 需要类别列表，先用图名或简单推断
              // MVP: 从已有类别里匹配，没有则用 class_0 等
              const cats = Array.from(categoriesSet);
              boxes = yoloToBoxes(content, img.width, img.height, cats);
              // 如果类别列表为空，重新按索引生成类别名
              if (boxes.length > 0 && boxes[0].label.startsWith('class_')) {
                const unique = new Set(boxes.map((b) => b.label));
                unique.forEach((l) => categoriesSet.add(l));
              }
              break;
            }
            case 'labelme': {
              const lm = parseLabelMeJson(content);
              boxes = labelMeToBoxes(lm);
              break;
            }
          }
          boxes.forEach((b) => categoriesSet.add(b.label));
          updatedImages[imgIdx] = {
            ...updatedImages[imgIdx],
            boxes,
            format,
          };
          matched++;
        } catch (err) {
          logger.warn(`标注文件解析失败 ${file.name}:`, String(err));
        }
      }

      setImages(updatedImages);
      toast.success(`成功解析 ${matched} 个标注文件`);
    } finally {
      setIsProcessing(false);
    }
  }, [images]);

  /* ── 格式转换并导出 ── */
  const handleConvertAndExport = useCallback(async () => {
    if (images.length === 0) {
      toast.info('请先上传图片和标注文件');
      return;
    }
    setIsProcessing(true);
    try {
      // 收集所有类别
      const allCategories = Array.from(new Set(images.flatMap((img) => img.boxes.map((b) => b.label))));

      if (targetFormat === 'coco') {
        // COCO: 一个 JSON 文件
        const jsonStr = imagesToCocoJson(images, allCategories);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'annotations_coco.json';
        a.click();
        URL.revokeObjectURL(url);
      } else {
        // 其他格式：每个图片一个标注文件，打包 ZIP
        const files: { path: string; content: string }[] = [];
        const ext = getAnnotationFileExt(targetFormat);

        images.forEach((img) => {
          const baseName = stripExtension(img.name);
          const fileName = `${baseName}${ext}`;
          let content = '';
          switch (targetFormat) {
            case 'voc':
              content = boxesToVocXml(img.name, img.width, img.height, img.boxes);
              break;
            case 'yolo':
              content = boxesToYoloTxt(img.boxes, img.width, img.height, allCategories);
              break;
            case 'labelme':
              content = boxesToLabelMeJson(img.name, img.width, img.height, img.boxes);
              break;
          }
          files.push({ path: fileName, content });
        });

        // 如果是 YOLO 格式，附加类别列表
        if (targetFormat === 'yolo') {
          files.push({ path: 'classes.txt', content: allCategories.join('\n') });
        }

        await zipAndDownload(files, `annotations_${targetFormat}.zip`);
      }
      toast.success('转换完成，已开始下载');
    } catch (err) {
      toast.error('转换失败');
      logger.error('格式转换失败:', String(err));
    } finally {
      setIsProcessing(false);
    }
  }, [images, targetFormat]);

  // 组件卸载时释放 objectURL
  useEffect(() => {
    return () => {
      images.forEach((img) => URL.revokeObjectURL(img.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = {
    totalImages: images.length,
    totalBoxes: images.reduce((s, i) => s + i.boxes.length, 0),
    categories: new Set(images.flatMap((i) => i.boxes.map((b) => b.label))).size,
  };

  return (
    <div className="grid grid-cols-12 gap-4 h-[calc(100vh-220px)] min-h-[500px]">
      {/* 左侧：上传 + 文件列表 */}
      <div className="col-span-3 flex flex-col gap-3 min-h-0">
        <div className="space-y-2">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleImageUpload(e.target.files)}
          />
          <input
            ref={annoInputRef}
            type="file"
            accept=".xml,.json,.txt"
            multiple
            className="hidden"
            onChange={(e) => handleAnnotationUpload(e.target.files)}
          />
          <Button
            className="w-full"
            onClick={() => imageInputRef.current?.click()}
            disabled={isProcessing}
          >
            <ImageIcon className="size-4 mr-2" />
            上传图片
          </Button>
          <Button
            className="w-full"
            variant="secondary"
            onClick={() => annoInputRef.current?.click()}
            disabled={isProcessing || images.length === 0}
          >
            <FileText className="size-4 mr-2" />
            上传标注文件
          </Button>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{stats.totalImages} 张图 · {stats.totalBoxes} 个标注</span>
          <span>{stats.categories} 类别</span>
        </div>

        <ScrollArea className="flex-1 border rounded-md">
          {images.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              暂无图片
            </div>
          ) : (
            <div className="p-1 space-y-0.5">
              {images.map((img) => (
                <button
                  key={img.id}
                  onClick={() => setSelectedId(img.id)}
                  className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center justify-between gap-2 hover:bg-muted/60 transition-colors ${
                    selectedId === img.id ? 'bg-accent text-accent-foreground' : ''
                  }`}
                >
                  <span className="truncate flex-1">{img.name}</span>
                  <Badge variant="outline" className="shrink-0 text-[10px] h-5">
                    {img.boxes.length}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* 右侧：预览 + 转换配置 */}
      <div className="col-span-9 flex flex-col gap-3 min-h-0">
        {/* 工具栏 */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">目标格式:</span>
            <Select value={targetFormat} onValueChange={(v) => setTargetFormat(v as AnnotationFormat)}>
              <SelectTrigger className="w-[160px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="voc">VOC XML</SelectItem>
                <SelectItem value="coco">COCO JSON</SelectItem>
                <SelectItem value="yolo">YOLO txt</SelectItem>
                <SelectItem value="labelme">LabelMe JSON</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setImages([]);
                setSelectedId(null);
              }}
              disabled={isProcessing || images.length === 0}
            >
              <RefreshCw className="size-3.5 mr-1" />
              清空
            </Button>
            <Button
              size="sm"
              onClick={handleConvertAndExport}
              disabled={isProcessing || images.length === 0}
            >
              <Download className="size-3.5 mr-1" />
              转换并导出
            </Button>
          </div>
        </div>

        {/* 预览区 */}
        <div className="flex-1 border rounded-md bg-muted/20 overflow-hidden relative">
          {selectedImage ? (
            <AnnotationCanvas
              imageUrl={selectedImage.url}
              boxes={selectedImage.boxes}
              readOnly
              fitView
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
              <Eye className="size-12 opacity-30 mb-2" />
              <p className="text-sm">选择一张图片预览标注</p>
              <p className="text-xs mt-1 opacity-70">先上传图片和对应标注文件</p>
            </div>
          )}
        </div>

        {/* 底部信息 */}
        {selectedImage && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>当前: {selectedImage.name}</span>
            <span>尺寸: {selectedImage.width}×{selectedImage.height}</span>
            <span>
              原格式: {FORMAT_LABELS[selectedImage.format]}
            </span>
            <span>标注框: {selectedImage.boxes.length} 个</span>
          </div>
        )}
      </div>
    </div>
  );
}
