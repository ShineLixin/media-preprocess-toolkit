import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Upload, Plus, Trash2, Wand2, Download, Image as ImageIcon, Layers,
  Cpu, Square, Hexagon, AlertCircle, CheckCircle2, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit-lite';
import type {
  IAnnotationBox, IAnnotationImage, AnnotationFormat,
  AnnotationShapeType, ModelLoadState,
} from '@/types/annotation';
import {
  uid,
  getColorForLabel,
  boxesToVocXml,
  imagesToCocoJson,
  boxesToYoloTxt,
  boxesToLabelMeJson,
} from '@/utils/annotation/formats';
import { generatePreAnnotations, generatePolygonCandidates } from '@/utils/annotation/edgeDetection';
import {
  ModelInferenceEngine,
  runDetectionWithFallback,
  detectionsToBoxes,
} from '@/utils/annotation/modelInference';
import { getImageSize, zipAndDownload } from '@/utils/file/fileUtils';
import AnnotationCanvas from '../components/AnnotationCanvas';

export default function PreAnnotateTab() {
  const [images, setImages] = useState<IAnnotationImage[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>(['object', 'person', 'car']);
  const [selectedLabel, setSelectedLabel] = useState('object');
  const [exportFormat, setExportFormat] = useState<AnnotationFormat>('voc');

  // 绘制工具
  const [drawTool, setDrawTool] = useState<AnnotationShapeType>('rectangle');

  // 边缘检测参数
  const [lowThreshold, setLowThreshold] = useState(30);
  const [highThreshold, setHighThreshold] = useState(80);
  const [minArea, setMinArea] = useState(500);

  // 模型状态
  const modelEngineRef = useRef<ModelInferenceEngine | null>(null);
  const [modelState, setModelState] = useState<ModelLoadState>('idle');
  const [modelFailReason, setModelFailReason] = useState('');
  const [useModel, setUseModel] = useState(true);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.5);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genStats, setGenStats] = useState<{
    usedModel: boolean;
    count: number;
    fallbackReason?: string;
  } | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);

  const currentImage = images.find((i) => i.id === currentId) ?? null;

  // 初始化模型引擎
  useEffect(() => {
    modelEngineRef.current = new ModelInferenceEngine({ confidenceThreshold });
    return () => {
      modelEngineRef.current?.dispose();
    };
  }, [confidenceThreshold]);

  /* ── 图片上传 ── */
  const handleImageUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newImages: IAnnotationImage[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;
      const url = URL.createObjectURL(file);
      try {
        const { width, height } = await getImageSize(file);
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
        logger.warn('图片读取失败:', String(err));
      }
    }
    setImages((prev) => {
      const next = [...prev, ...newImages];
      if (!currentId && newImages.length > 0) {
        setCurrentId(newImages[0].id);
      }
      return next;
    });
    toast.success(`已添加 ${newImages.length} 张图片`);
  }, [currentId]);

  /* ── 类别管理 ── */
  const [categoryInput, setCategoryInput] = useState('');
  const handleAddCategory = useCallback(() => {
    const v = categoryInput.trim();
    if (!v) return;
    if (categories.includes(v)) {
      toast.info('类别已存在');
      return;
    }
    setCategories((prev) => [...prev, v]);
    setCategoryInput('');
    setSelectedLabel(v);
  }, [categoryInput, categories]);

  const handleDeleteCategory = useCallback(
    (cat: string) => {
      if (categories.length <= 1) {
        toast.info('至少保留一个类别');
        return;
      }
      setCategories((prev) => prev.filter((c) => c !== cat));
      if (selectedLabel === cat) {
        const remaining = categories.filter((c) => c !== cat);
        setSelectedLabel(remaining[0]);
      }
    },
    [categories, selectedLabel]
  );

  /* ── 更新当前图片的标注框 ── */
  const updateCurrentBoxes = useCallback(
    (updater: (boxes: IAnnotationBox[]) => IAnnotationBox[]) => {
      if (!currentId) return;
      setImages((prev) =>
        prev.map((img) => (img.id === currentId ? { ...img, boxes: updater(img.boxes) } : img))
      );
    },
    [currentId]
  );

  /* ── 添加新标注框 ── */
  const handleAddBox = useCallback(
    (box: Omit<IAnnotationBox, 'id' | 'color'>) => {
      updateCurrentBoxes((prev) => [
        ...prev,
        {
          ...box,
          id: uid(),
          color: getColorForLabel(box.label),
          label: selectedLabel,
        },
      ]);
    },
    [updateCurrentBoxes, selectedLabel]
  );

  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const handleSelectBox = useCallback((id: string | null) => {
    setSelectedBoxId(id);
  }, []);

  const handleUpdateBox = useCallback(
    (id: string, patch: Partial<IAnnotationBox>) => {
      updateCurrentBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    },
    [updateCurrentBoxes]
  );

  const handleChangeBoxLabel = useCallback(
    (label: string) => {
      if (!selectedBoxId) return;
      handleUpdateBox(selectedBoxId, { label, color: getColorForLabel(label) });
    },
    [selectedBoxId, handleUpdateBox]
  );

  const handleDeleteBox = useCallback(
    (id: string) => {
      updateCurrentBoxes((prev) => prev.filter((b) => b.id !== id));
      if (selectedBoxId === id) setSelectedBoxId(null);
    },
    [updateCurrentBoxes, selectedBoxId]
  );

  /* ── 生成预标注（模型 + 边缘检测回退 + 多边形候选） ── */
  const handleGeneratePreAnnotations = useCallback(async () => {
    if (!currentImage) return;
    setIsGenerating(true);
    setGenStats(null);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('图片加载失败'));
        img.src = currentImage.url;
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 不可用');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      let newBoxes: IAnnotationBox[] = [];
      let usedModel = false;
      let fallbackReason: string | undefined;

      if (useModel && modelEngineRef.current) {
        setModelState('loading');
        const result = await runDetectionWithFallback(
          modelEngineRef.current,
          imageData,
          selectedLabel
        );
        usedModel = result.usedModel;
        fallbackReason = result.fallbackReason;
        const converted = detectionsToBoxes(result.detections, getColorForLabel);
        newBoxes = converted.map((d) => ({
          id: uid(),
          label: d.label,
          shapeType: d.shapeType,
          x: d.x, y: d.y,
          width: d.width, height: d.height,
          color: d.color,
        }));
        setModelState(modelEngineRef.current.getState());
        if (!result.usedModel) {
          setModelFailReason(result.fallbackReason ?? '');
        }
      } else {
        // 仅使用边缘检测
        const rectBoxes = generatePreAnnotations(
          canvas,
          selectedLabel,
          lowThreshold,
          highThreshold,
          minArea,
          15
        );
        newBoxes = rectBoxes.map((b) => ({
          ...b,
          id: uid(),
          shapeType: 'rectangle' as const,
          color: getColorForLabel(b.label),
        }));
      }

      updateCurrentBoxes((prev) => [...prev, ...newBoxes]);
      setGenStats({
        usedModel,
        count: newBoxes.length,
        fallbackReason,
      });
      if (newBoxes.length > 0) {
        toast.success(`生成 ${newBoxes.length} 个候选标注${usedModel ? '（模型推理）' : '（边缘检测）'}`);
      } else {
        toast.info('未生成候选标注，可尝试调整参数');
      }
    } catch (err) {
      toast.error('预标注生成失败');
      logger.error('预标注生成失败:', String(err));
    } finally {
      setIsGenerating(false);
    }
  }, [
    currentImage, selectedLabel, lowThreshold, highThreshold, minArea,
    updateCurrentBoxes, useModel,
  ]);

  /* ── 生成多边形候选（边缘检测轮廓 → 多边形） ── */
  const handleGeneratePolygonCandidates = useCallback(async () => {
    if (!currentImage) return;
    setIsGenerating(true);
    setGenStats(null);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('图片加载失败'));
        img.src = currentImage.url;
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 不可用');
      ctx.drawImage(img, 0, 0);

      const polygons = generatePolygonCandidates(
        canvas,
        selectedLabel,
        lowThreshold,
        highThreshold,
        minArea
      );

      updateCurrentBoxes((prev) => [...prev, ...polygons]);
      setGenStats({ usedModel: false, count: polygons.length });
      toast.success(`生成 ${polygons.length} 个多边形候选`);
    } catch (err) {
      toast.error('多边形候选生成失败');
      logger.error('多边形候选生成失败:', String(err));
    } finally {
      setIsGenerating(false);
    }
  }, [currentImage, selectedLabel, lowThreshold, highThreshold, minArea, updateCurrentBoxes]);

  /* ── 清空当前标注 ── */
  const handleClearBoxes = useCallback(() => {
    updateCurrentBoxes(() => []);
    setSelectedBoxId(null);
  }, [updateCurrentBoxes]);

  /* ── 批量导出 ── */
  const handleExport = useCallback(async () => {
    if (images.length === 0) {
      toast.info('暂无数据可导出');
      return;
    }
    try {
      if (exportFormat === 'coco') {
        const jsonStr = imagesToCocoJson(images, categories);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'annotations_coco.json';
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const files: { path: string; content: string }[] = [];
        const extMap: Record<AnnotationFormat, string> = {
          voc: '.xml', yolo: '.txt', labelme: '.json', coco: '.json',
        };
        const ext = extMap[exportFormat];

        images.forEach((img) => {
          const baseName = img.name.replace(/\.[^.]+$/, '');
          let content = '';
          switch (exportFormat) {
            case 'voc':
              content = boxesToVocXml(img.name, img.width, img.height, img.boxes);
              break;
            case 'yolo':
              content = boxesToYoloTxt(img.boxes, img.width, img.height, categories);
              break;
            case 'labelme':
              content = boxesToLabelMeJson(img.name, img.width, img.height, img.boxes);
              break;
          }
          files.push({ path: `${baseName}${ext}`, content });
        });

        if (exportFormat === 'yolo') {
          files.push({ path: 'classes.txt', content: categories.join('\n') });
        }

        await zipAndDownload(files, `annotations_${exportFormat}.zip`);
      }
      toast.success('导出成功');
    } catch (err) {
      toast.error('导出失败');
      logger.error('导出失败:', String(err));
    }
  }, [images, exportFormat, categories]);

  const selectedBox = useMemo(
    () => currentImage?.boxes.find((b) => b.id === selectedBoxId) ?? null,
    [currentImage, selectedBoxId]
  );

  const modelStateIcon = (state: ModelLoadState) => {
    switch (state) {
      case 'loading': return <Loader2 className="size-3.5 animate-spin text-warning" />;
      case 'ready':   return <CheckCircle2 className="size-3.5 text-success" />;
      case 'failed':  return <AlertCircle className="size-3.5 text-destructive" />;
      default:        return <Cpu className="size-3.5 text-muted-foreground" />;
    }
  };

  const modelStateText = (state: ModelLoadState) => {
    switch (state) {
      case 'loading': return '模型加载中...';
      case 'ready':   return '模型就绪';
      case 'failed':  return '模型加载失败';
      default:        return '未加载';
    }
  };

  // 统计矩形/多边形数量
  const rectCount = currentImage?.boxes.filter((b) => b.shapeType === 'rectangle').length ?? 0;
  const polyCount = currentImage?.boxes.filter((b) => b.shapeType === 'polygon').length ?? 0;

  return (
    <div className="grid grid-cols-12 gap-4 h-[calc(100vh-220px)] min-h-[500px]">
      {/* 左侧：图片列表 + 类别管理 */}
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
          <Button className="w-full" onClick={() => imageInputRef.current?.click()}>
            <Upload className="size-4 mr-2" />
            上传图片
          </Button>
        </div>

        <div className="text-xs text-muted-foreground flex items-center justify-between">
          <span>图片列表 ({images.length})</span>
          {currentImage && (
            <span>{currentImage.width}×{currentImage.height}</span>
          )}
        </div>
        <ScrollArea className="flex-1 border rounded-md">
          {images.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">暂无图片</div>
          ) : (
            <div className="p-1 space-y-0.5">
              {images.map((img) => (
                <button
                  key={img.id}
                  onClick={() => { setCurrentId(img.id); setSelectedBoxId(null); }}
                  className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center justify-between gap-2 hover:bg-muted/60 ${
                    currentId === img.id ? 'bg-accent text-accent-foreground' : ''
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

        <Card>
          <CardContent className="p-3">
            <div className="text-sm font-medium mb-2 flex items-center gap-1">
              <Layers className="size-3.5" />
              类别管理
            </div>
            <div className="flex gap-1 mb-2">
              <Input
                value={categoryInput}
                onChange={(e) => setCategoryInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCategory())}
                placeholder="新类别名"
                className="h-8 text-sm flex-1"
              />
              <Button size="sm" variant="secondary" className="h-8 px-2" onClick={handleAddCategory}>
                <Plus className="size-3.5" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
              {categories.map((c) => (
                <Badge
                  key={c}
                  variant={selectedLabel === c ? 'default' : 'outline'}
                  className="text-xs cursor-pointer"
                  onClick={() => setSelectedLabel(c)}
                >
                  {c}
                  <span
                    className="ml-1 opacity-60 hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); handleDeleteCategory(c); }}
                  >
                    ×
                  </span>
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              点击类别选中，新标注框使用此类别
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 中间：画布区 */}
      <div className="col-span-6 flex flex-col gap-3 min-h-0">
        {/* 工具栏 */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {currentImage ? currentImage.name : '未选择图片'}
            </span>
            {currentImage && (
              <Badge variant="outline" className="text-xs">
                {rectCount} 矩形 / {polyCount} 多边形
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant={drawTool === 'rectangle' ? 'default' : 'secondary'}
              onClick={() => setDrawTool('rectangle')}
              title="矩形标注工具"
            >
              <Square className="size-3.5 mr-1" />
              矩形
            </Button>
            <Button
              size="sm"
              variant={drawTool === 'polygon' ? 'default' : 'secondary'}
              onClick={() => setDrawTool('polygon')}
              title="多边形标注工具（点击打点，双击闭合）"
            >
              <Hexagon className="size-3.5 mr-1" />
              多边形
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleGeneratePreAnnotations}
              disabled={!currentImage || isGenerating}
            >
              {isGenerating ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : <Cpu className="size-3.5 mr-1" />}
              自动标注
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleGeneratePolygonCandidates}
              disabled={!currentImage || isGenerating}
              title="基于边缘检测生成多边形候选"
            >
              <Wand2 className="size-3.5 mr-1" />
              多边形候选
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleClearBoxes}
              disabled={!currentImage || currentImage.boxes.length === 0}
            >
              <Trash2 className="size-3.5 mr-1" />
              清空
            </Button>
          </div>
        </div>

        {/* 模型状态提示条 */}
        {useModel && modelState !== 'idle' && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs ${
            modelState === 'failed' ? 'bg-destructive/10 text-destructive' :
            modelState === 'ready'  ? 'bg-success/10 text-success' :
                                    'bg-warning/10 text-warning'
          }`}>
            {modelStateIcon(modelState)}
            <span className="flex-1">{modelStateText(modelState)}</span>
            {modelFailReason && modelState === 'failed' && (
              <span className="truncate max-w-[300px]">{modelFailReason}</span>
            )}
            {genStats && !genStats.usedModel && genStats.fallbackReason && (
              <Badge variant="outline" className="shrink-0">回退到边缘检测</Badge>
            )}
          </div>
        )}

        {/* 画布 */}
        <div className="flex-1 border rounded-md bg-muted/20 overflow-hidden">
          {currentImage ? (
            <AnnotationCanvas
              imageUrl={currentImage.url}
              boxes={currentImage.boxes}
              selectedBoxId={selectedBoxId}
              drawTool={drawTool}
              onSelectBox={handleSelectBox}
              onAddBox={handleAddBox}
              onUpdateBox={handleUpdateBox}
              onDeleteBox={handleDeleteBox}
              fitView
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
              <ImageIcon className="size-12 opacity-30 mb-2" />
              <p className="text-sm">上传图片并选择，开始标注</p>
              <p className="text-xs mt-1 opacity-70">
                矩形拖拽绘制 · 多边形点击打点/双击闭合 · 滚轮缩放 · Alt+拖动平移
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 右侧：属性 + 预标注配置 + 导出 */}
      <div className="col-span-3 flex flex-col gap-3 min-h-0">
        {/* 选中标注框属性 */}
        <Card>
          <CardContent className="p-3 space-y-3">
            <div className="text-sm font-medium">标注对象属性</div>
            {selectedBox ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {selectedBox.shapeType === 'polygon' ? '多边形' : '矩形'}
                  </Badge>
                  {selectedBox.shapeType === 'polygon' && selectedBox.points && (
                    <span className="text-xs text-muted-foreground">
                      {selectedBox.points.length} 个顶点
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">类别</label>
                  <Select value={selectedBox.label} onValueChange={handleChangeBoxLabel}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">X</label>
                    <Input
                      type="number"
                      value={Math.round(selectedBox.x)}
                      onChange={(e) =>
                        handleUpdateBox(selectedBox.id, { x: parseFloat(e.target.value) || 0 })
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Y</label>
                    <Input
                      type="number"
                      value={Math.round(selectedBox.y)}
                      onChange={(e) =>
                        handleUpdateBox(selectedBox.id, { y: parseFloat(e.target.value) || 0 })
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">宽</label>
                    <Input
                      type="number"
                      value={Math.round(selectedBox.width)}
                      onChange={(e) =>
                        handleUpdateBox(selectedBox.id, {
                          width: Math.max(1, parseFloat(e.target.value) || 1),
                        })
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">高</label>
                    <Input
                      type="number"
                      value={Math.round(selectedBox.height)}
                      onChange={(e) =>
                        handleUpdateBox(selectedBox.id, {
                          height: Math.max(1, parseFloat(e.target.value) || 1),
                        })
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  className="w-full"
                  onClick={() => handleDeleteBox(selectedBox.id)}
                >
                  <Trash2 className="size-3.5 mr-1" />
                  删除此对象
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">点击标注框查看/编辑属性</p>
            )}
          </CardContent>
        </Card>

        {/* 预标注配置 */}
        <Card>
          <CardContent className="p-3 space-y-3">
            <div className="text-sm font-medium flex items-center gap-1">
              <Wand2 className="size-3.5" />
              预标注配置
            </div>
            <Tabs defaultValue="model">
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="model">AI 模型</TabsTrigger>
                <TabsTrigger value="edge">边缘检测</TabsTrigger>
              </TabsList>
              <TabsContent value="model" className="space-y-3 pt-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="use-model" className="text-xs">启用模型推理</Label>
                  <Switch
                    id="use-model"
                    checked={useModel}
                    onCheckedChange={setUseModel}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>置信度阈值</span>
                    <span>{confidenceThreshold.toFixed(2)}</span>
                  </div>
                  <Slider
                    value={[confidenceThreshold * 100]}
                    onValueChange={([v]) => setConfidenceThreshold(v / 100)}
                    min={10}
                    max={95}
                    step={5}
                    disabled={!useModel}
                  />
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {modelStateIcon(modelState)}
                  <span className="text-muted-foreground">{modelStateText(modelState)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  浏览器端本地推理，失败自动回退到边缘检测方案
                </p>
              </TabsContent>
              <TabsContent value="edge" className="space-y-3 pt-3">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>低阈值</span>
                    <span>{lowThreshold}</span>
                  </div>
                  <Slider
                    value={[lowThreshold]}
                    onValueChange={([v]) => setLowThreshold(v)}
                    min={10} max={100} step={5}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>高阈值</span>
                    <span>{highThreshold}</span>
                  </div>
                  <Slider
                    value={[highThreshold]}
                    onValueChange={([v]) => setHighThreshold(v)}
                    min={50} max={200} step={5}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>最小面积</span>
                    <span>{minArea}px²</span>
                  </div>
                  <Slider
                    value={[minArea]}
                    onValueChange={([v]) => setMinArea(v)}
                    min={100} max={5000} step={100}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  基于 Canny 边缘检测 + 轮廓提取，适合边缘清晰场景
                </p>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* 导出 */}
        <Card>
          <CardContent className="p-3 space-y-3">
            <div className="text-sm font-medium">批量导出</div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">导出格式</label>
              <Select
                value={exportFormat}
                onValueChange={(v) => setExportFormat(v as AnnotationFormat)}
              >
                <SelectTrigger className="h-8 text-sm">
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
            <p className="text-[10px] text-muted-foreground">
              VOC/YOLO 对多边形导出其最小外接矩形
            </p>
            <Button className="w-full" size="sm" onClick={handleExport}>
              <Download className="size-3.5 mr-1" />
              导出所有标注
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
