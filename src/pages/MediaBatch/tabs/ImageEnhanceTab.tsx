import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Download, Sun, Contrast, Droplets, Sparkles, VolumeX, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit-lite';
import type { IImageItem, IImageProcessParams, IFormatParams } from '@/types/media';
import { loadImage, processImageEnhance, canvasToBlob } from '@/utils/image/process';
import { getImageSize, zipAndDownload, formatFileSize } from '@/utils/file/fileUtils';
import { Image } from '@/components/ui/image';

const DEFAULT_PARAMS: IImageProcessParams = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  sharpen: 0,
  denoise: 0,
};

export default function ImageEnhanceTab() {
  const [images, setImages] = useState<IImageItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [params, setParams] = useState<IImageProcessParams>(DEFAULT_PARAMS);
  const [compareMode, setCompareMode] = useState<'side' | 'slider'>('side');
  const [sliderPos, setSliderPos] = useState(50);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [format, setFormat] = useState<IFormatParams['format']>('image/jpeg');
  const [quality, setQuality] = useState(0.9);

  const selectedImage = images.find((i) => i.id === selectedId) ?? null;

  /* ── 图片上传 ── */
  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsProcessing(true);
    const newItems: IImageItem[] = [];
    try {
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
    } finally {
      setIsProcessing(false);
    }
  }, [selectedId]);

  /* ── 实时预览处理效果 ── */
  useEffect(() => {
    if (!selectedImage) {
      setPreviewUrl('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const img = await loadImage(selectedImage.url);
        const canvas = processImageEnhance(img, params);
        const blob = await canvasToBlob(canvas, { format, quality });
        if (cancelled) return;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      } catch (err) {
        logger.warn('预览生成失败:', String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedImage?.id, params, format, quality]);

  /* ── 批量处理并导出 ── */
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
        const canvas = processImageEnhance(img, params);
        const blob = await canvasToBlob(canvas, { format, quality });
        const ext = format === 'image/jpeg' ? 'jpg' : format === 'image/png' ? 'png' : 'webp';
        const baseName = item.name.replace(/\.[^.]+$/, '');
        files.push({ path: `${baseName}_enhanced.${ext}`, content: blob });
      }
      await zipAndDownload(files, 'enhanced_images.zip');
      toast.success('批量处理完成，已下载');
    } catch (err) {
      toast.error('批量处理失败');
      logger.error('批量增强失败:', String(err));
    } finally {
      setIsProcessing(false);
    }
  }, [images, params, format, quality]);

  /* ── 重置参数 ── */
  const handleReset = useCallback(() => {
    setParams(DEFAULT_PARAMS);
  }, []);

  // 组件卸载时释放 URL
  useEffect(() => {
    return () => {
      images.forEach((img) => URL.revokeObjectURL(img.url));
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sliderControls = [
    { key: 'brightness', label: '亮度', icon: Sun, min: -100, max: 100 },
    { key: 'contrast', label: '对比度', icon: Contrast, min: -100, max: 100 },
    { key: 'saturation', label: '饱和度', icon: Droplets, min: -100, max: 100 },
    { key: 'sharpen', label: '锐化', icon: Sparkles, min: 0, max: 100 },
    { key: 'denoise', label: '降噪', icon: VolumeX, min: 0, max: 100 },
  ] as const;

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
            <div className="p-8 text-center text-sm text-muted-foreground">
              暂无图片
            </div>
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
        {/* 对比模式切换 */}
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
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">对比模式:</span>
            <Select value={compareMode} onValueChange={(v) => setCompareMode(v as typeof compareMode)}>
              <SelectTrigger className="w-[120px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="side">左右并列</SelectItem>
                <SelectItem value="slider">滑动对比</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 预览区 */}
        <div className="flex-1 border rounded-md bg-muted/20 overflow-hidden relative">
          {selectedImage && previewUrl ? (
            compareMode === 'side' ? (
              <div className="grid grid-cols-2 h-full">
                <div className="relative border-r border-border/50 flex items-center justify-center p-2">
                  <div className="absolute top-2 left-2 z-10">
                    <Badge variant="outline" className="bg-background/80 backdrop-blur-sm">原图</Badge>
                  </div>
                  <Image
                    src={selectedImage.url}
                    alt="原图"
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
                <div className="relative flex items-center justify-center p-2">
                  <div className="absolute top-2 left-2 z-10">
                    <Badge className="bg-primary/80 backdrop-blur-sm">处理后</Badge>
                  </div>
                  <Image
                    src={previewUrl}
                    alt="处理后"
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              </div>
            ) : (
              <div
                className="relative h-full w-full overflow-hidden cursor-ew-resize select-none"
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = ((e.clientX - rect.left) / rect.width) * 100;
                  setSliderPos(Math.max(0, Math.min(100, x)));
                }}
              >
                <div className="absolute inset-0 flex items-center justify-center p-2">
                  <Image
                    src={previewUrl}
                    alt="处理后"
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
                <div
                  className="absolute top-0 left-0 bottom-0 overflow-hidden border-r-2 border-white/80"
                  style={{ width: `${sliderPos}%` }}
                >
                  <div className="relative w-full h-full flex items-center justify-center p-2">
                    <Image
                      src={selectedImage.url}
                      alt="原图"
                      className="max-w-full max-h-full object-contain"
                      style={{
                        position: 'absolute',
                        left: '50%',
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                        maxWidth: 'none',
                        width: 'auto',
                        height: 'auto',
                        maxHeight: '100%',
                      }}
                    />
                  </div>
                </div>
                <div className="absolute top-2 left-2 z-10">
                  <Badge variant="outline" className="bg-background/80 backdrop-blur-sm">
                    原图 ↔ 处理后
                  </Badge>
                </div>
              </div>
            )
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
              <ImageIcon className="size-12 opacity-30 mb-2" />
              <p className="text-sm">上传图片并选择以预览增强效果</p>
              <p className="text-xs mt-1 opacity-70">实时预览 · 批量导出</p>
            </div>
          )}
        </div>
      </div>

      {/* 右侧：参数面板 + 导出 */}
      <div className="col-span-3 flex flex-col gap-3 min-h-0">
        <Card>
          <CardContent className="p-3 space-y-4">
            <div className="text-sm font-medium">参数调节</div>

            {sliderControls.map(({ key, label, icon: Icon, min, max }) => (
              <div key={key} className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Icon className="size-3.5" />
                    {label}
                  </span>
                  <span className="tabular-nums">{params[key]}</span>
                </div>
                <Slider
                  value={[params[key]]}
                  onValueChange={([v]) => setParams({ ...params, [key]: v })}
                  min={min}
                  max={max}
                  step={1}
                />
              </div>
            ))}

            <Button size="sm" variant="ghost" className="w-full" onClick={handleReset}>
              重置参数
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 space-y-3">
            <div className="text-sm font-medium">导出设置</div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">输出格式</label>
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
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>质量</span>
                <span>{Math.round(quality * 100)}%</span>
              </div>
              <Slider
                value={[quality * 100]}
                onValueChange={([v]) => setQuality(v / 100)}
                min={10}
                max={100}
                step={5}
              />
            </div>
          </CardContent>
        </Card>

        <Button className="w-full" onClick={handleBatchProcess} disabled={isProcessing || images.length === 0}>
          <Download className="size-4 mr-2" />
          批量处理并导出
        </Button>

        {images.length > 0 && (
          <div className="text-xs text-muted-foreground text-center">
            共 {images.length} 张，总大小约{' '}
            {formatFileSize(images.reduce((s, i) => s + i.file.size, 0))}
          </div>
        )}
      </div>
    </div>
  );
}
