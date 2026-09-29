import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Download, Image as ImageIcon, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit-lite';
import type { IImageItem, IDistortionParams, IFormatParams } from '@/types/media';
import { loadImage, correctDistortion, canvasToBlob } from '@/utils/image/process';
import { getImageSize, zipAndDownload, formatFileSize } from '@/utils/file/fileUtils';
import { Image } from '@/components/ui/image';

const DEFAULT_PARAMS: IDistortionParams = {
  k1: 0,
  k2: 0,
};

export default function DistortionTab() {
  const [images, setImages] = useState<IImageItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [params, setParams] = useState<IDistortionParams>(DEFAULT_PARAMS);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [format, setFormat] = useState<IFormatParams['format']>('image/jpeg');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedImage = images.find((i) => i.id === selectedId) ?? null;

  /* ── 图片上传 ── */
  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newItems: IImageItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;
      const url = URL.createObjectURL(file);
      try {
        const { width, height } = await getImageSize(file);
        newItems.push({
          id: Math.random().toString(36).slice(2, 10),
          file,
          name: file.name,
          url,
          width,
          height,
        });
      } catch (err) {
        logger.warn('图片读取失败:', String(err));
      }
    }
    setImages((prev) => {
      const next = [...prev, ...newItems];
      if (!selectedId && newItems.length > 0) {
        setSelectedId(newItems[0].id);
      }
      return next;
    });
    toast.success(`已添加 ${newItems.length} 张图片`);
  }, [selectedId]);

  /* ── 实时预览 ── */
  useEffect(() => {
    if (!selectedImage) {
      setPreviewUrl('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const img = await loadImage(selectedImage.url);
        const canvas = correctDistortion(img, params);
        const blob = await canvasToBlob(canvas, { format, quality: 0.92 });
        if (cancelled) return;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(URL.createObjectURL(blob));
      } catch (err) {
        logger.warn('预览生成失败:', String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedImage?.id, params, format]);

  /* ── 预设方案 ── */
  const presets: { label: string; k1: number; k2: number }[] = [
    { label: '轻微桶形校正', k1: -0.1, k2: 0 },
    { label: '中度桶形校正', k1: -0.25, k2: -0.05 },
    { label: '严重桶形校正', k1: -0.4, k2: -0.15 },
    { label: '枕形校正', k1: 0.15, k2: 0.05 },
  ];

  const handlePreset = useCallback((k1: number, k2: number) => {
    setParams({ k1, k2 });
  }, []);

  /* ── 重置 ── */
  const handleReset = useCallback(() => {
    setParams(DEFAULT_PARAMS);
  }, []);

  /* ── 批量导出 ── */
  const handleBatchProcess = useCallback(async () => {
    if (images.length === 0) {
      toast.info('请先上传图片');
      return;
    }
    setIsProcessing(true);
    try {
      const files: { path: string; content: Blob }[] = [];
      for (let i = 0; i < images.length; i++) {
        const item = images[i];
        const img = await loadImage(item.url);
        const canvas = correctDistortion(img, params);
        const blob = await canvasToBlob(canvas, { format, quality: 0.92 });
        const ext = format === 'image/jpeg' ? 'jpg' : format === 'image/png' ? 'png' : 'webp';
        const baseName = item.name.replace(/\.[^.]+$/, '');
        files.push({ path: `${baseName}_corrected.${ext}`, content: blob });
      }
      await zipAndDownload(files, 'corrected_images.zip');
      toast.success('批量校正完成，已下载');
    } catch (err) {
      toast.error('批量处理失败');
      logger.error('畸变校正失败:', String(err));
    } finally {
      setIsProcessing(false);
    }
  }, [images, params, format]);

  useEffect(() => {
    return () => {
      images.forEach((img) => URL.revokeObjectURL(img.url));
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const distortionType = params.k1 > 0 ? '枕形' : params.k1 < 0 ? '桶形' : '无';

  return (
    <div className="grid grid-cols-12 gap-4 h-[calc(100vh-220px)] min-h-[500px]">
      {/* 左侧：文件列表 */}
      <div className="col-span-2 flex flex-col gap-3 min-h-0">
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
          <Button
            className="w-full"
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
          >
            <Upload className="size-4 mr-2" />
            上传图片
          </Button>
        </div>

        <div className="text-xs text-muted-foreground">{images.length} 张图片</div>

        <ScrollArea className="flex-1 border rounded-md">
          {images.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">暂无图片</div>
          ) : (
            <div className="p-1 space-y-0.5">
              {images.map((img) => (
                <button
                  key={img.id}
                  onClick={() => setSelectedId(img.id)}
                  className={`w-full text-left px-2 py-1.5 rounded text-sm truncate hover:bg-muted/60 ${
                    selectedId === img.id ? 'bg-accent text-accent-foreground' : ''
                  }`}
                >
                  <span className="block truncate">{img.name}</span>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* 中间：预览区 */}
      <div className="col-span-7 flex flex-col gap-3 min-h-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {selectedImage ? selectedImage.name : '未选择图片'}
            </span>
            {selectedImage && (
              <Badge variant="outline" className="text-xs">
                {selectedImage.width}×{selectedImage.height}
              </Badge>
            )}
          </div>
          {params.k1 !== 0 || params.k2 !== 0 ? (
            <Badge>{distortionType}畸变校正</Badge>
          ) : (
            <Badge variant="outline">未启用</Badge>
          )}
        </div>

        {/* 预览区 - 左右对比 */}
        <div className="flex-1 border rounded-md bg-muted/20 overflow-hidden grid grid-cols-2">
          <div className="relative border-r border-border/50 flex items-center justify-center p-2">
            <div className="absolute top-2 left-2 z-10">
              <Badge variant="outline" className="bg-background/80 backdrop-blur-sm">原图</Badge>
            </div>
            {selectedImage ? (
              <Image
                src={selectedImage.url}
                alt="原图"
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-muted-foreground">
                <ImageIcon className="size-12 opacity-30 mb-2" />
                <p className="text-sm">上传图片</p>
              </div>
            )}
          </div>
          <div className="relative flex items-center justify-center p-2">
            <div className="absolute top-2 left-2 z-10">
              <Badge className="bg-primary/80 backdrop-blur-sm">校正后</Badge>
            </div>
            {previewUrl ? (
              <Image
                src={previewUrl}
                alt="校正后"
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <div className="text-sm text-muted-foreground">
                {selectedImage ? '调整参数查看效果' : ''}
              </div>
            )}
          </div>
        </div>

        {/* 说明 */}
        <div className="text-xs text-muted-foreground">
          基于径向畸变模型进行像素级校正。黑边为校正后无数据区域（透明/黑色），属于正常现象。
        </div>
      </div>

      {/* 右侧：参数面板 */}
      <div className="col-span-3 flex flex-col gap-3 min-h-0">
        <Card>
          <CardContent className="p-3 space-y-4">
            <div className="text-sm font-medium flex items-center gap-1">
              <Layers className="size-3.5" />
              畸变参数
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">k1 主系数</span>
                <span className="tabular-nums">{params.k1.toFixed(2)}</span>
              </div>
              <Slider
                value={[params.k1 * 100]}
                onValueChange={([v]) => setParams({ ...params, k1: v / 100 })}
                min={-50}
                max={50}
                step={1}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>桶形 -</span>
                <span>0</span>
                <span>+ 枕形</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">k2 次级系数</span>
                <span className="tabular-nums">{params.k2.toFixed(2)}</span>
              </div>
              <Slider
                value={[params.k2 * 100]}
                onValueChange={([v]) => setParams({ ...params, k2: v / 100 })}
                min={-30}
                max={30}
                step={1}
              />
            </div>

            <Button size="sm" variant="ghost" className="w-full" onClick={handleReset}>
              重置参数
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="text-sm font-medium">预设方案</div>
            <div className="grid grid-cols-2 gap-1.5">
              {presets.map((p) => (
                <Button
                  key={p.label}
                  size="sm"
                  variant="outline"
                  className="text-xs h-7 justify-start px-2"
                  onClick={() => handlePreset(p.k1, p.k2)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 space-y-3">
            <div className="text-sm font-medium">输出格式</div>
            <Select value={format} onValueChange={(v) => setFormat(v as IFormatParams['format'])}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="image/jpeg">JPEG</SelectItem>
                <SelectItem value="image/png">PNG</SelectItem>
                <SelectItem value="image/webp">WebP</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Button
          className="w-full"
          onClick={handleBatchProcess}
          disabled={isProcessing || images.length === 0}
        >
          <Download className="size-4 mr-2" />
          批量校正并导出
        </Button>

        {images.length > 0 && (
          <div className="text-xs text-muted-foreground text-center">
            共 {images.length} 张，约 {formatFileSize(images.reduce((s, i) => s + i.file.size, 0))}
          </div>
        )}
      </div>
    </div>
  );
}
