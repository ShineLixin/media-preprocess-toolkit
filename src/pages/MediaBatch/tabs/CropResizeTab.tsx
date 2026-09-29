import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Download, Crop, Maximize2, Image as ImageIcon, Move, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit-lite';
import type { IImageItem, ICropParams, IResizeParams, IFormatParams } from '@/types/media';
import { loadImage, cropImage, resizeImage, canvasToBlob } from '@/utils/image/process';
import { getImageSize, zipAndDownload, formatFileSize } from '@/utils/file/fileUtils';
import { Image } from '@/components/ui/image';

export default function CropResizeTab() {
  const [images, setImages] = useState<IImageItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<'resize' | 'crop'>('resize');
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  // 缩放参数
  const [resizeParams, setResizeParams] = useState<IResizeParams>({
    width: 0,
    height: 0,
    mode: 'contain',
  });
  const [keepAspectRatio, setKeepAspectRatio] = useState(true);

  // 裁剪参数
  const [cropParams, setCropParams] = useState<ICropParams>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });

  // 输出格式
  const [format, setFormat] = useState<IFormatParams['format']>('image/jpeg');
  const [quality] = useState(0.92);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
    mode: 'move' | 'resize-br' | 'resize-bl' | 'resize-tr' | 'resize-tl';
  } | null>(null);
  const imgContainerRef = useRef<HTMLDivElement>(null);
  const [displayScale, setDisplayScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);

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
        // 初始化裁剪框
        const first = newItems[0];
        setCropParams({
          x: Math.round(first.width * 0.1),
          y: Math.round(first.height * 0.1),
          width: Math.round(first.width * 0.8),
          height: Math.round(first.height * 0.8),
        });
        setResizeParams((p) => ({ ...p, width: first.width, height: first.height }));
      }
      return next;
    });
    toast.success(`已添加 ${newItems.length} 张图片`);
  }, [selectedId]);

  /* ── 选中图片时初始化裁剪框 ── */
  useEffect(() => {
    if (selectedImage) {
      setCropParams({
        x: Math.round(selectedImage.width * 0.1),
        y: Math.round(selectedImage.height * 0.1),
        width: Math.round(selectedImage.width * 0.8),
        height: Math.round(selectedImage.height * 0.8),
      });
      setResizeParams((p) => ({ ...p, width: selectedImage.width, height: selectedImage.height }));
    }
  }, [selectedImage]);

  /* ── 计算显示缩放比例 ── */
  useEffect(() => {
    if (!selectedImage || !imgContainerRef.current) return;
    const container = imgContainerRef.current;
    const scaleX = container.clientWidth / selectedImage.width;
    const scaleY = container.clientHeight / selectedImage.height;
    setDisplayScale(Math.min(scaleX, scaleY, 1));
  }, [selectedImage, mode]);

  /* ── 实时生成预览 ── */
  useEffect(() => {
    if (!selectedImage) {
      setPreviewUrl('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const img = await loadImage(selectedImage.url);
        let canvas: HTMLCanvasElement;
        if (mode === 'resize') {
          const w = resizeParams.width > 0 ? resizeParams.width : img.width;
          const h = resizeParams.height > 0 ? resizeParams.height : img.height;
          canvas = resizeImage(img, w, h, resizeParams.mode);
        } else {
          canvas = cropImage(img, cropParams);
        }
        const blob = await canvasToBlob(canvas, { format, quality });
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
  }, [selectedImage?.id, mode, cropParams.x, cropParams.y, cropParams.width, cropParams.height, resizeParams.width, resizeParams.height, resizeParams.mode, format]);

  /* ── 缩放宽高联动 ── */
  const handleResizeWidthChange = useCallback(
    (v: number) => {
      if (!selectedImage || !keepAspectRatio) {
        setResizeParams({ ...resizeParams, width: v });
        return;
      }
      const ratio = selectedImage.height / selectedImage.width;
      setResizeParams({ ...resizeParams, width: v, height: Math.round(v * ratio) });
    },
    [resizeParams, selectedImage, keepAspectRatio]
  );

  const handleResizeHeightChange = useCallback(
    (v: number) => {
      if (!selectedImage || !keepAspectRatio) {
        setResizeParams({ ...resizeParams, height: v });
        return;
      }
      const ratio = selectedImage.width / selectedImage.height;
      setResizeParams({ ...resizeParams, height: v, width: Math.round(v * ratio) });
    },
    [resizeParams, selectedImage, keepAspectRatio]
  );

  /* ── 裁剪框拖拽 ── */
  const handleCropMouseDown = useCallback(
    (e: React.MouseEvent, dragMode: 'move' | 'resize-br' | 'resize-bl' | 'resize-tr' | 'resize-tl') => {
      e.stopPropagation();
      setIsDragging(true);
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: cropParams.x,
        origY: cropParams.y,
        origW: cropParams.width,
        origH: cropParams.height,
        mode: dragMode,
      };
    },
    [cropParams]
  );

  const handleCropMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragRef.current || !selectedImage) return;
      const dx = (e.clientX - dragRef.current.startX) / displayScale;
      const dy = (e.clientY - dragRef.current.startY) / displayScale;

      if (dragRef.current.mode === 'move') {
        let newX = dragRef.current.origX + dx;
        let newY = dragRef.current.origY + dy;
        newX = Math.max(0, Math.min(selectedImage.width - dragRef.current.origW, newX));
        newY = Math.max(0, Math.min(selectedImage.height - dragRef.current.origH, newY));
        setCropParams({ ...cropParams, x: newX, y: newY });
      } else {
        let newW = dragRef.current.origW;
        let newH = dragRef.current.origH;
        let newX = dragRef.current.origX;
        let newY = dragRef.current.origY;

        if (dragRef.current.mode.includes('r')) {
          newW = Math.max(10, dragRef.current.origW + dx);
          newW = Math.min(newW, selectedImage.width - dragRef.current.origX);
        }
        if (dragRef.current.mode.includes('l')) {
          const deltaW = Math.min(dragRef.current.origW - 10, -dx);
          newW = dragRef.current.origW - deltaW;
          newX = dragRef.current.origX + deltaW;
        }
        if (dragRef.current.mode.includes('b')) {
          newH = Math.max(10, dragRef.current.origH + dy);
          newH = Math.min(newH, selectedImage.height - dragRef.current.origY);
        }
        if (dragRef.current.mode.includes('t')) {
          const deltaH = Math.min(dragRef.current.origH - 10, -dy);
          newH = dragRef.current.origH - deltaH;
          newY = dragRef.current.origY + deltaH;
        }

        setCropParams({ x: newX, y: newY, width: newW, height: newH });
      }
    },
    [cropParams, displayScale, selectedImage]
  );

  const handleCropMouseUp = useCallback(() => {
    setIsDragging(false);
    dragRef.current = null;
  }, []);

  /* ── 重置裁剪 ── */
  const handleResetCrop = useCallback(() => {
    if (!selectedImage) return;
    setCropParams({
      x: 0,
      y: 0,
      width: selectedImage.width,
      height: selectedImage.height,
    });
  }, [selectedImage]);

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
        let canvas: HTMLCanvasElement;
        if (mode === 'resize') {
          const w = resizeParams.width > 0 ? resizeParams.width : img.width;
          const h = resizeParams.height > 0 ? resizeParams.height : img.height;
          canvas = resizeImage(img, w, h, resizeParams.mode);
        } else {
          canvas = cropImage(img, cropParams);
        }
        const blob = await canvasToBlob(canvas, { format, quality });
        const ext = format === 'image/jpeg' ? 'jpg' : format === 'image/png' ? 'png' : 'webp';
        const baseName = item.name.replace(/\.[^.]+$/, '');
        files.push({ path: `${baseName}_${mode === 'resize' ? 'resized' : 'cropped'}.${ext}`, content: blob });
      }
      await zipAndDownload(files, `${mode === 'resize' ? 'resized' : 'cropped'}_images.zip`);
      toast.success('批量处理完成，已下载');
    } catch (err) {
      toast.error('批量处理失败');
      logger.error('批量处理失败:', String(err));
    } finally {
      setIsProcessing(false);
    }
  }, [images, mode, resizeParams, cropParams, format, quality]);

  useEffect(() => {
    return () => {
      images.forEach((img) => URL.revokeObjectURL(img.url));
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={mode === 'resize' ? 'default' : 'secondary'}
              onClick={() => setMode('resize')}
              className="h-8"
            >
              <Maximize2 className="size-3.5 mr-1" />
              缩放
            </Button>
            <Button
              size="sm"
              variant={mode === 'crop' ? 'default' : 'secondary'}
              onClick={() => setMode('crop')}
              className="h-8"
            >
              <Crop className="size-3.5 mr-1" />
              裁剪
            </Button>
          </div>
        </div>

        <div
          ref={imgContainerRef}
          className="flex-1 border rounded-md bg-muted/20 overflow-hidden flex items-center justify-center relative"
          onMouseMove={isDragging ? handleCropMouseMove : undefined}
          onMouseUp={isDragging ? handleCropMouseUp : undefined}
          onMouseLeave={isDragging ? handleCropMouseUp : undefined}
        >
          {selectedImage ? (
            mode === 'crop' ? (
              <div
                className="relative"
                style={{
                  width: selectedImage.width * displayScale,
                  height: selectedImage.height * displayScale,
                }}
              >
                <Image
                  src={selectedImage.url}
                  alt="原图"
                  className="absolute inset-0 w-full h-full object-cover opacity-50"
                  draggable={false}
                />
                <div
                  className="absolute cursor-move border-2 border-primary shadow-lg"
                  style={{
                    left: cropParams.x * displayScale,
                    top: cropParams.y * displayScale,
                    width: cropParams.width * displayScale,
                    height: cropParams.height * displayScale,
                  }}
                  onMouseDown={(e) => handleCropMouseDown(e, 'move')}
                >
                  <Image
                    src={selectedImage.url}
                    alt="裁剪区域"
                    className="absolute w-full h-full"
                    style={{
                      objectPosition: `-${cropParams.x}px -${cropParams.y}px`,
                      width: selectedImage.width * displayScale,
                      height: selectedImage.height * displayScale,
                      objectFit: 'none',
                      left: 0,
                      top: 0,
                      transform: 'none',
                    }}
                    draggable={false}
                  />
                  {/* 8 个调整手柄 - 用 4 个角 */}
                  {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => {
                    const pos: Record<string, string> = {
                      tl: 'top-0 left-0 cursor-nwse-resize',
                      tr: 'top-0 right-0 cursor-nesw-resize',
                      bl: 'bottom-0 left-0 cursor-nesw-resize',
                      br: 'bottom-0 right-0 cursor-nwse-resize',
                    };
                    return (
                      <div
                        key={corner}
                        className={`absolute w-3 h-3 bg-primary border border-white rounded-sm ${pos[corner]}`}
                        style={{ margin: '-3px' }}
                        onMouseDown={(e) => {
                          const mode = corner === 'tl' ? 'resize-tl' :
                                       corner === 'tr' ? 'resize-tr' :
                                       corner === 'bl' ? 'resize-bl' : 'resize-br';
                          handleCropMouseDown(e, mode as any);
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="relative max-w-full max-h-full flex items-center justify-center p-4">
                {previewUrl ? (
                  <Image
                    src={previewUrl}
                    alt="缩放预览"
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <Image
                    src={selectedImage.url}
                    alt="原图"
                    className="max-w-full max-h-full object-contain"
                  />
                )}
              </div>
            )
          ) : (
            <div className="flex flex-col items-center justify-center text-muted-foreground">
              <ImageIcon className="size-12 opacity-30 mb-2" />
              <p className="text-sm">上传图片开始处理</p>
            </div>
          )}
        </div>

        {/* 裁剪模式下显示尺寸信息 */}
        {mode === 'crop' && selectedImage && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              裁剪区域: {Math.round(cropParams.width)} × {Math.round(cropParams.height)} px
            </span>
            <span>
              位置: ({Math.round(cropParams.x)}, {Math.round(cropParams.y)})
            </span>
          </div>
        )}
      </div>

      {/* 右侧：参数面板 */}
      <div className="col-span-3 flex flex-col gap-3 min-h-0">
        <Card>
          <CardContent className="p-3 space-y-3">
            <div className="text-sm font-medium">
              {mode === 'resize' ? '缩放设置' : '裁剪设置'}
            </div>

            {mode === 'resize' ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">宽 (px)</label>
                    <Input
                      type="number"
                      value={resizeParams.width}
                      onChange={(e) => handleResizeWidthChange(parseInt(e.target.value) || 0)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">高 (px)</label>
                    <Input
                      type="number"
                      value={resizeParams.height}
                      onChange={(e) => handleResizeHeightChange(parseInt(e.target.value) || 0)}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="ratio-toggle" className="text-xs">
                    保持比例
                  </Label>
                  <Switch
                    id="ratio-toggle"
                    checked={keepAspectRatio}
                    onCheckedChange={(v) => setKeepAspectRatio(v)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">缩放模式</label>
                  <Select
                    value={resizeParams.mode}
                    onValueChange={(v) =>
                      setResizeParams({ ...resizeParams, mode: v as IResizeParams['mode'] })
                    }
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contain">等比包含</SelectItem>
                      <SelectItem value="cover">等比覆盖</SelectItem>
                      <SelectItem value="stretch">拉伸填充</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <p className="text-xs text-muted-foreground">
                  设为 0 表示使用原图尺寸
                </p>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">X 偏移</label>
                    <Input
                      type="number"
                      value={Math.round(cropParams.x)}
                      onChange={(e) =>
                        setCropParams({ ...cropParams, x: parseInt(e.target.value) || 0 })
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Y 偏移</label>
                    <Input
                      type="number"
                      value={Math.round(cropParams.y)}
                      onChange={(e) =>
                        setCropParams({ ...cropParams, y: parseInt(e.target.value) || 0 })
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">宽度</label>
                    <Input
                      type="number"
                      value={Math.round(cropParams.width)}
                      onChange={(e) =>
                        setCropParams({
                          ...cropParams,
                          width: Math.max(10, parseInt(e.target.value) || 10),
                        })
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">高度</label>
                    <Input
                      type="number"
                      value={Math.round(cropParams.height)}
                      onChange={(e) =>
                        setCropParams({
                          ...cropParams,
                          height: Math.max(10, parseInt(e.target.value) || 10),
                        })
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <Button size="sm" variant="ghost" className="w-full" onClick={handleResetCrop}>
                  <RotateCcw className="size-3.5 mr-1" />
                  重置为全图
                </Button>
                <p className="text-xs text-muted-foreground">
                  可直接拖动裁剪框调整位置和大小
                </p>
              </>
            )}
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

        <Button className="w-full" onClick={handleBatchProcess} disabled={isProcessing || images.length === 0}>
          <Download className="size-4 mr-2" />
          批量{mode === 'resize' ? '缩放' : '裁剪'}并导出
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
