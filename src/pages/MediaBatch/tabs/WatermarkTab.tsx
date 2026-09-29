import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  Upload, Download, Type, Image as ImageIcon, Trash2,
  Plus, RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit-lite';
import type {
  IImageItem, IFormatParams,
  ITextWatermarkConfig, IImageWatermarkConfig, IRenameRuleConfig,
  WatermarkPosition,
} from '@/types/media';
import { applyWatermarks, type WatermarkConfig } from '@/utils/image/watermark';
import { getImageSize, zipAndDownload } from '@/utils/file/fileUtils';
import { Image } from '@/components/ui/image';

/** 水印 + 重命名 + 格式转换 Tab */
export default function WatermarkTab() {
  const [images, setImages] = useState<IImageItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // 文字水印
  const [textWm, setTextWm] = useState<ITextWatermarkConfig>({
    enabled: false,
    text: 'Sample Watermark',
    fontSize: 36,
    fontFamily: 'Arial, sans-serif',
    color: '#ffffff',
    opacity: 0.5,
    position: 'bottom-right',
    rotation: 0,
    margin: 20,
  });

  // 图片水印
  const [imageWm, setImageWm] = useState<IImageWatermarkConfig>({
    enabled: false,
    file: null,
    opacity: 0.6,
    position: 'bottom-right',
    scale: 0.15,
    margin: 20,
    rotation: 0,
  });
  const [wmImageUrl, setWmImageUrl] = useState<string>('');
  const wmImageRef = useRef<HTMLImageElement | null>(null);
  const wmFileInputRef = useRef<HTMLInputElement>(null);

  // 重命名规则
  const [rename, setRename] = useState<IRenameRuleConfig>({
    enabled: false,
    prefix: '',
    suffix: '',
    keepOriginalName: true,
    startIndex: 1,
    indexDigits: 3,
    indexPosition: 'after',
  });

  // 输出格式
  const [formatCfg, setFormatCfg] = useState<IFormatParams>({
    format: 'image/jpeg',
    quality: 0.9,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedImage = useMemo(
    () => images.find((i) => i.id === selectedId) ?? null,
    [images, selectedId]
  );

  // 处理格式扩展名
  const formatExt: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/avif': '.avif',
  };

  /* ── 图片上传 ── */
  const handleImageUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newItems: IImageItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;
      const url = URL.createObjectURL(file);
      try {
        const { width, height } = await getImageSize(file);
        newItems.push({
          id: `img_${Date.now()}_${i}`,
          file, name: file.name, url, width, height,
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

  /* ── 水印图片上传 ── */
  const handleWmImageUpload = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) return;
    if (wmImageUrl) URL.revokeObjectURL(wmImageUrl);
    const url = URL.createObjectURL(file);
    setWmImageUrl(url);
    setImageWm((p) => ({ ...p, file }));
    const img = new window.Image();
    img.onload = () => { wmImageRef.current = img; };
    img.src = url;
  }, [wmImageUrl]);

  /* ── 删除图片 ── */
  const handleRemoveImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((i) => i.id !== id));
    if (selectedId === id) setSelectedId(null);
  }, [selectedId]);

  /* ── 清空所有 ── */
  const handleClearAll = useCallback(() => {
    images.forEach((i) => URL.revokeObjectURL(i.url));
    setImages([]);
    setSelectedId(null);
  }, [images]);

  /* ── 生成预览（应用水印 + 格式） ── */
  const generatePreview = useCallback((source: HTMLImageElement): HTMLCanvasElement | null => {
    const watermarkConfigs: Parameters<typeof applyWatermarks>[1] = [];
    if (textWm.enabled && textWm.text) {
      watermarkConfigs.push({
        type: 'text',
        text: textWm.text,
        fontSize: textWm.fontSize,
        fontFamily: textWm.fontFamily,
        color: textWm.color,
        opacity: textWm.opacity,
        position: textWm.position,
        rotation: textWm.rotation,
        margin: textWm.margin,
      });
    }
    if (imageWm.enabled && wmImageRef.current) {
      watermarkConfigs.push({
        type: 'image',
        image: wmImageRef.current,
        opacity: imageWm.opacity,
        position: imageWm.position,
        scale: imageWm.scale,
        margin: imageWm.margin,
        rotation: imageWm.rotation,
      });
    }
    if (watermarkConfigs.length === 0) return null;
    return applyWatermarks(source, watermarkConfigs);
  }, [textWm, imageWm]);

  /* ── 预览 URL 计算 ── */
  const previewUrl = useMemo(() => {
    if (!selectedImage) return '';
    // 直接返回原图（水印实时预览通过预览组件）
    return selectedImage.url;
  }, [selectedImage]);

  /* ── 生成新文件名 ── */
  const buildOutputName = useCallback((originalName: string, index: number): string => {
    const ext = formatExt[formatCfg.format] ?? '.jpg';
    const baseName = originalName.replace(/\.[^.]+$/, '');

    let name = '';
    if (rename.enabled) {
      const idx = String(rename.startIndex + index - 1).padStart(rename.indexDigits, '0');
      if (rename.indexPosition === 'replace' || !rename.keepOriginalName) {
        name = `${rename.prefix}${idx}${rename.suffix}`;
      } else if (rename.indexPosition === 'before') {
        name = `${rename.prefix}${idx}_${baseName}${rename.suffix}`;
      } else {
        name = `${rename.prefix}${baseName}_${idx}${rename.suffix}`;
      }
    } else {
      name = baseName;
    }
    return `${name}${ext}`;
  }, [rename, formatCfg.format]);

  /* ── 批量导出 ── */
  const handleBatchExport = useCallback(async () => {
    if (images.length === 0) {
      toast.info('请先上传图片');
      return;
    }
    setIsProcessing(true);
    try {
      const files: { path: string; content: Blob }[] = [];
      for (let i = 0; i < images.length; i++) {
        const item = images[i];
        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('图片加载失败'));
          img.src = item.url;
        });

        // 应用水印
        const result = generatePreview(img);
        const canvas = result ?? document.createElement('canvas');
        if (!result) {
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0);
        }

        // 转格式
        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob(
            (b) => resolve(b ?? new Blob([], { type: formatCfg.format })),
            formatCfg.format,
            formatCfg.quality,
          );
        });

        const outName = buildOutputName(item.name, i + 1);
        files.push({ path: outName, content: blob });
      }

      await zipAndDownload(files, 'watermarked_images.zip');
      toast.success(`已导出 ${files.length} 张图片`);
    } catch (err) {
      toast.error('导出失败');
      logger.error('批量导出失败:', String(err));
    } finally {
      setIsProcessing(false);
    }
  }, [images, generatePreview, formatCfg, buildOutputName]);

  const positionOptions: { value: WatermarkPosition; label: string }[] = [
    { value: 'top-left', label: '左上' },
    { value: 'top-center', label: '顶部居中' },
    { value: 'top-right', label: '右上' },
    { value: 'center-left', label: '左中' },
    { value: 'center', label: '居中' },
    { value: 'center-right', label: '右中' },
    { value: 'bottom-left', label: '左下' },
    { value: 'bottom-center', label: '底部居中' },
    { value: 'bottom-right', label: '右下' },
    { value: 'tile', label: '平铺' },
  ];

  return (
    <div className="grid grid-cols-12 gap-4 h-[calc(100vh-220px)] min-h-[500px]">
      {/* 左侧：图片列表 */}
      <div className="col-span-2 flex flex-col gap-3 min-h-0">
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleImageUpload(e.target.files)}
          />
          <Button className="w-full" onClick={() => fileInputRef.current?.click()}>
            <Upload className="size-4 mr-2" />
            上传图片
          </Button>
          {images.length > 0 && (
            <Button
              variant="secondary"
              className="w-full"
              size="sm"
              onClick={handleClearAll}
            >
              <Trash2 className="size-3.5 mr-1" />
              清空全部
            </Button>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          图片列表 ({images.length})
        </div>
        <ScrollArea className="flex-1 border rounded-md">
          {images.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              暂无图片
            </div>
          ) : (
            <div className="p-1 space-y-1">
              {images.map((img) => (
                <button
                  key={img.id}
                  onClick={() => setSelectedId(img.id)}
                  className={`w-full flex items-center gap-2 p-1.5 rounded text-left hover:bg-muted/60 ${
                    selectedId === img.id ? 'bg-accent text-accent-foreground' : ''
                  }`}
                >
                  <Image
                    src={img.url}
                    alt=""
                    className="w-8 h-8 object-cover rounded shrink-0"
                  />
                  <span className="text-xs truncate flex-1">{img.name}</span>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* 中间：预览区 */}
      <div className="col-span-6 flex flex-col gap-3 min-h-0">
        <Card className="flex-1 flex flex-col min-h-0">
          <CardContent className="p-3 flex-1 flex flex-col min-h-0">
            <div className="text-sm font-medium mb-2 flex items-center justify-between">
              <span>实时预览</span>
              {selectedImage && (
                <Badge variant="outline" className="text-xs">
                  {selectedImage.width}×{selectedImage.height}
                </Badge>
              )}
            </div>
            <div className="flex-1 border rounded-md bg-muted/20 flex items-center justify-center overflow-hidden">
              {previewUrl ? (
                <WatermarkPreview
                  imageUrl={previewUrl}
                  textWm={textWm}
                  imageWm={imageWm}
                  wmImageUrl={wmImageUrl}
                />
              ) : (
                <div className="text-center text-muted-foreground">
                  <ImageIcon className="size-12 opacity-30 mx-auto mb-2" />
                  <p className="text-sm">上传图片开始处理</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 右侧：水印/重命名/格式配置 */}
      <div className="col-span-4 flex flex-col gap-3 min-h-0 overflow-y-auto">
        {/* 文字水印 */}
        <Card>
          <CardContent className="p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium flex items-center gap-1">
                <Type className="size-3.5" />
                文字水印
              </div>
              <Switch
                checked={textWm.enabled}
                onCheckedChange={(v) => setTextWm((p) => ({ ...p, enabled: v }))}
              />
            </div>
            <Input
              value={textWm.text}
              onChange={(e) => setTextWm((p) => ({ ...p, text: e.target.value }))}
              placeholder="水印文字"
              className="h-8 text-sm"
              disabled={!textWm.enabled}
            />
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">字号</label>
                <Input
                  type="number"
                  value={textWm.fontSize}
                  onChange={(e) => setTextWm((p) => ({ ...p, fontSize: parseInt(e.target.value) || 12 }))}
                  className="h-8 text-sm"
                  disabled={!textWm.enabled}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">颜色</label>
                <input
                  type="color"
                  value={textWm.color}
                  onChange={(e) => setTextWm((p) => ({ ...p, color: e.target.value }))}
                  className="h-8 w-full rounded border cursor-pointer"
                  disabled={!textWm.enabled}
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>透明度</span>
                <span>{Math.round(textWm.opacity * 100)}%</span>
              </div>
              <Slider
                value={[textWm.opacity * 100]}
                onValueChange={([v]) => setTextWm((p) => ({ ...p, opacity: v / 100 }))}
                min={5} max={100} step={5}
                disabled={!textWm.enabled}
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>旋转</span>
                <span>{textWm.rotation}°</span>
              </div>
              <Slider
                value={[textWm.rotation]}
                onValueChange={([v]) => setTextWm((p) => ({ ...p, rotation: v }))}
                min={-45} max={45} step={5}
                disabled={!textWm.enabled}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">位置</label>
              <Select
                value={textWm.position}
                onValueChange={(v) => setTextWm((p) => ({ ...p, position: v as WatermarkPosition }))}
                disabled={!textWm.enabled}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {positionOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* 图片水印 */}
        <Card>
          <CardContent className="p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium flex items-center gap-1">
                <ImageIcon className="size-3.5" />
                图片水印
              </div>
              <Switch
                checked={imageWm.enabled}
                onCheckedChange={(v) => setImageWm((p) => ({ ...p, enabled: v }))}
              />
            </div>
            <input
              ref={wmFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleWmImageUpload(e.target.files)}
            />
            <Button
              size="sm"
              variant="secondary"
              className="w-full"
              onClick={() => wmFileInputRef.current?.click()}
              disabled={!imageWm.enabled}
            >
              <Plus className="size-3.5 mr-1" />
              上传水印图片
            </Button>
            {wmImageUrl && (
              <div className="flex justify-center">
                <Image src={wmImageUrl} alt="wm" className="h-12 object-contain" />
              </div>
            )}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>大小比例</span>
                <span>{Math.round(imageWm.scale * 100)}%</span>
              </div>
              <Slider
                value={[imageWm.scale * 100]}
                onValueChange={([v]) => setImageWm((p) => ({ ...p, scale: v / 100 }))}
                min={1} max={50} step={1}
                disabled={!imageWm.enabled || !wmImageUrl}
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>透明度</span>
                <span>{Math.round(imageWm.opacity * 100)}%</span>
              </div>
              <Slider
                value={[imageWm.opacity * 100]}
                onValueChange={([v]) => setImageWm((p) => ({ ...p, opacity: v / 100 }))}
                min={5} max={100} step={5}
                disabled={!imageWm.enabled || !wmImageUrl}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">位置</label>
              <Select
                value={imageWm.position}
                onValueChange={(v) => setImageWm((p) => ({ ...p, position: v as WatermarkPosition }))}
                disabled={!imageWm.enabled || !wmImageUrl}
              >
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {positionOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* 重命名规则 */}
        <Card>
          <CardContent className="p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium flex items-center gap-1">
                <RotateCcw className="size-3.5" />
                批量重命名
              </div>
              <Switch
                checked={rename.enabled}
                onCheckedChange={(v) => setRename((p) => ({ ...p, enabled: v }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">前缀</label>
                <Input
                  value={rename.prefix}
                  onChange={(e) => setRename((p) => ({ ...p, prefix: e.target.value }))}
                  placeholder="img_"
                  className="h-8 text-sm"
                  disabled={!rename.enabled}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">后缀</label>
                <Input
                  value={rename.suffix}
                  onChange={(e) => setRename((p) => ({ ...p, suffix: e.target.value }))}
                  placeholder="_final"
                  className="h-8 text-sm"
                  disabled={!rename.enabled}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">起始序号</label>
                <Input
                  type="number"
                  value={rename.startIndex}
                  onChange={(e) => setRename((p) => ({ ...p, startIndex: parseInt(e.target.value) || 1 }))}
                  className="h-8 text-sm"
                  disabled={!rename.enabled}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">序号位数</label>
                <Input
                  type="number"
                  value={rename.indexDigits}
                  onChange={(e) => setRename((p) => ({ ...p, indexDigits: Math.max(1, parseInt(e.target.value) || 1) }))}
                  className="h-8 text-sm"
                  disabled={!rename.enabled}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">序号位置</label>
              <Select
                value={rename.indexPosition}
                onValueChange={(v) => setRename((p) => ({ ...p, indexPosition: v as 'before' | 'after' | 'replace' }))}
                disabled={!rename.enabled}
              >
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="before">前缀+序号_原名</SelectItem>
                  <SelectItem value="after">前缀+原名_序号</SelectItem>
                  <SelectItem value="replace">替换原名</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="keep-name"
                checked={rename.keepOriginalName}
                onCheckedChange={(v) => setRename((p) => ({ ...p, keepOriginalName: v }))}
                disabled={!rename.enabled}
              />
              <Label htmlFor="keep-name" className="text-xs">保留原文件名</Label>
            </div>
          </CardContent>
        </Card>

        {/* 输出格式 */}
        <Card>
          <CardContent className="p-3 space-y-3">
            <div className="text-sm font-medium">输出格式</div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">格式</label>
              <Select
                value={formatCfg.format}
                onValueChange={(v) => setFormatCfg((p) => ({ ...p, format: v as IFormatParams['format'] }))}
              >
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="image/jpeg">JPEG</SelectItem>
                  <SelectItem value="image/png">PNG</SelectItem>
                  <SelectItem value="image/webp">WebP</SelectItem>
                  <SelectItem value="image/avif">AVIF（浏览器支持时）</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>质量</span>
                <span>{Math.round(formatCfg.quality * 100)}%</span>
              </div>
              <Slider
                value={[formatCfg.quality * 100]}
                onValueChange={([v]) => setFormatCfg((p) => ({ ...p, quality: v / 100 }))}
                min={10} max={100} step={5}
              />
            </div>
          </CardContent>
        </Card>

        {/* 导出 */}
        <Button onClick={handleBatchExport} disabled={!images.length || isProcessing}>
          <Download className="size-4 mr-2" />
          {isProcessing ? '处理中...' : `批量导出 (${images.length} 张)`}
        </Button>
      </div>
    </div>
  );
}

/** 实时水印预览组件（每次参数变化重新渲染） */
function WatermarkPreview({
  imageUrl, textWm, imageWm, wmImageUrl,
}: {
  imageUrl: string;
  textWm: ITextWatermarkConfig;
  imageWm: IImageWatermarkConfig;
  wmImageUrl: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mainImgRef = useRef<HTMLImageElement | null>(null);
  const wmImgRef = useRef<HTMLImageElement | null>(null);

  // 加载主图
  useEffect(() => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      mainImgRef.current = img;
      redraw();
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // 加载水印图
  useEffect(() => {
    if (!wmImageUrl) { wmImgRef.current = null; redraw(); return; }
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      wmImgRef.current = img;
      redraw();
    };
    img.src = wmImageUrl;
  }, [wmImageUrl]);

  // 参数变化时重绘
  useEffect(() => { redraw(); }, [textWm, imageWm]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !mainImgRef.current) return;
    const img = mainImgRef.current;
    // 计算适应容器的尺寸
    const parent = canvas.parentElement;
    if (!parent) return;
    const maxW = parent.clientWidth - 16;
    const maxH = parent.clientHeight - 16;
    const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
    const w = Math.max(1, img.naturalWidth * ratio);
    const h = Math.max(1, img.naturalHeight * ratio);
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(img, 0, 0, w, h);

    // 缩放后的水印参数（按比例缩放字号和边距）
    if (textWm.enabled && textWm.text) {
      const scaledFontSize = Math.max(8, textWm.fontSize * ratio);
      const scaledMargin = Math.max(4, textWm.margin * ratio);
      const watermarks: WatermarkConfig[] = [{
        type: 'text',
        text: textWm.text,
        fontSize: scaledFontSize,
        fontFamily: textWm.fontFamily,
        color: textWm.color,
        opacity: textWm.opacity,
        position: textWm.position,
        rotation: textWm.rotation,
        margin: scaledMargin,
      }];
      applyWatermarksInline(ctx, watermarks);
    }
    if (imageWm.enabled && wmImgRef.current) {
      const scaledMargin = Math.max(4, imageWm.margin * ratio);
      const watermarks: WatermarkConfig[] = [{
        type: 'image',
        image: wmImgRef.current,
        opacity: imageWm.opacity,
        position: imageWm.position,
        scale: imageWm.scale,
        margin: scaledMargin,
        rotation: imageWm.rotation,
      }];
      applyWatermarksInline(ctx, watermarks);
    }
  }, [textWm, imageWm]);

  return (
    <canvas
      ref={canvasRef}
      className="max-w-full max-h-full block"
    />
  );
}

/** 在现有 ctx 上叠加水印（不重置画布） */
function applyWatermarksInline(
  ctx: CanvasRenderingContext2D,
  configs: WatermarkConfig[]
): void {
  for (const cfg of configs) {
    if (cfg.type === 'text') {
      const canvas = ctx.canvas;
      const w = canvas.width, h = canvas.height;
      ctx.save();
      ctx.globalAlpha = cfg.opacity;
      ctx.font = `${cfg.fontSize}px ${cfg.fontFamily}`;
      ctx.fillStyle = cfg.color;
      ctx.textBaseline = 'top';
      const textW = ctx.measureText(cfg.text).width;
      const textH = cfg.fontSize * 1.2;

      const getPos = (p: string, cw: number, ch: number, tw: number, th: number, m: number) => {
        switch (p) {
          case 'top-left': return { x: m, y: m };
          case 'top-center': return { x: (cw - tw) / 2, y: m };
          case 'top-right': return { x: cw - tw - m, y: m };
          case 'center-left': return { x: m, y: (ch - th) / 2 };
          case 'center': return { x: (cw - tw) / 2, y: (ch - th) / 2 };
          case 'center-right': return { x: cw - tw - m, y: (ch - th) / 2 };
          case 'bottom-left': return { x: m, y: ch - th - m };
          case 'bottom-center': return { x: (cw - tw) / 2, y: ch - th - m };
          case 'bottom-right': return { x: cw - tw - m, y: ch - th - m };
          default: return { x: m, y: m };
        }
      };

      if (cfg.position === 'tile') {
        const stepX = textW + cfg.margin;
        const stepY = textH + cfg.margin;
        const diag = Math.sqrt(w * w + h * h);
        ctx.translate(w / 2, h / 2);
        ctx.rotate((cfg.rotation * Math.PI) / 180);
        ctx.translate(-diag / 2, -diag / 2);
        for (let y = 0; y < diag; y += stepY) {
          for (let x = 0; x < diag; x += stepX) {
            ctx.fillText(cfg.text, x, y);
          }
        }
      } else {
        const { x, y } = getPos(cfg.position, w, h, textW, textH, cfg.margin);
        if (cfg.rotation !== 0) {
          ctx.translate(x + textW / 2, y + textH / 2);
          ctx.rotate((cfg.rotation * Math.PI) / 180);
          ctx.translate(-textW / 2, -textH / 2);
          ctx.fillText(cfg.text, 0, 0);
        } else {
          ctx.fillText(cfg.text, x, y);
        }
      }
      ctx.restore();
    }
  }
}

// 避免 tree-shaking 警告
void Tabs;
void TabsContent;
void TabsList;
void TabsTrigger;
