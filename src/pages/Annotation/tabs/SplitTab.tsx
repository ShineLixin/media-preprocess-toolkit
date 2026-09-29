import { useState, useCallback, useRef, useMemo } from 'react';
import {
  Upload,
  SplitSquareVertical,
  Download,
  Settings,
  PieChart,
  Shuffle,
  Layers,
} from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit-lite';
import JSZip from 'jszip';
import type { IAnnotationImage, IAnnotationBox, AnnotationFormat } from '@/types/annotation';
import type { ISplitConfig, ISplitResult } from '@/types/annotation-stats';
import {
  splitDataset,
  getDefaultSplitConfig,
  generateDataYaml,
  generateSplitCocoJson,
} from '@/utils/annotation/split';
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
  getColorForLabel,
  getAnnotationFileExt,
} from '@/utils/annotation/formats';
import {
  readFileAsText,
  getImageSize,
  downloadBlob,
  stripExtension,
} from '@/utils/file/fileUtils';

const CHART_TRAIN = '#22c55e';
const CHART_VAL = '#3b82f6';
const CHART_TEST = '#f97316';

export default function SplitTab() {
  const [images, setImages] = useState<IAnnotationImage[]>([]);
  const [config, setConfig] = useState<ISplitConfig>(getDefaultSplitConfig());
  const [result, setResult] = useState<ISplitResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    images.forEach((img) => img.boxes.forEach((b) => set.add(b.label)));
    return Array.from(set).sort();
  }, [images]);

  /* ── 上传标注文件 ── */
  const handleAnnotationUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsProcessing(true);
    const newImages: IAnnotationImage[] = [];
    let added = 0;

    try {
      const annotationFiles: Array<{ name: string; format: AnnotationFormat; content: string }> = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const name = file.name.toLowerCase();
        if (!name.endsWith('.xml') && !name.endsWith('.json') && !name.endsWith('.txt')) continue;
        try {
          const content = await readFileAsText(file);
          const fmt = detectAnnotationFormat(file.name, content);
          if (fmt) {
            annotationFiles.push({ name: file.name, format: fmt, content });
          }
        } catch (err) {
          logger.warn('标注文件读取失败:', String(err));
        }
      }

      // COCO 单文件处理
      const cocoFile = annotationFiles.find((f) => f.format === 'coco');
      if (cocoFile) {
        const coco = parseCocoJson(cocoFile.content);
        const map = cocoToImageMap(coco);
        map.forEach((entry) => {
          newImages.push({
            id: Math.random().toString(36).slice(2, 10),
            name: entry.image.file_name,
            url: '',
            width: entry.image.width,
            height: entry.image.height,
            boxes: entry.boxes,
            format: 'coco',
          });
          added++;
        });
      } else {
        for (const af of annotationFiles) {
          if (af.format === 'voc') {
            const voc = parseVocXml(af.content);
            const boxes = vocToBoxes(voc);
            newImages.push({
              id: Math.random().toString(36).slice(2, 10),
              name: voc.filename || stripExtension(af.name),
              url: '',
              width: voc.width,
              height: voc.height,
              boxes,
              format: 'voc',
            });
            added++;
          } else if (af.format === 'labelme') {
            const lm = parseLabelMeJson(af.content);
            const boxes = labelMeToBoxes(lm);
            newImages.push({
              id: Math.random().toString(36).slice(2, 10),
              name: lm.imagePath || stripExtension(af.name),
              url: '',
              width: lm.imageWidth,
              height: lm.imageHeight,
              boxes,
              format: 'labelme',
            });
            added++;
          } else if (af.format === 'yolo') {
            const lines = af.content.split('\n').filter((l) => l.trim());
            const boxes: IAnnotationBox[] = lines
              .map((line) => {
                const parts = line.trim().split(/\s+/);
                if (parts.length < 5) return null;
                const classIdx = parseInt(parts[0], 10);
                const label = `class_${classIdx}`;
                const w = parseFloat(parts[3]) * 640;
                const h = parseFloat(parts[4]) * 640;
                return {
                  id: Math.random().toString(36).slice(2, 10),
                  label,
                  x: parseFloat(parts[1]) * 640 - w / 2,
                  y: parseFloat(parts[2]) * 640 - h / 2,
                  width: w,
                  height: h,
                  color: getColorForLabel(label),
                };
              })
              .filter(Boolean) as IAnnotationBox[];
            newImages.push({
              id: Math.random().toString(36).slice(2, 10),
              name: stripExtension(af.name),
              url: '',
              width: 640,
              height: 640,
              boxes,
              format: 'yolo',
            });
            added++;
          }
        }
      }

      setImages(newImages);
      setResult(null);
      toast.success(`已加载 ${added} 个标注文件`);
    } catch (err) {
      toast.error('解析失败');
      logger.error('切分解析失败:', String(err));
    } finally {
      setIsProcessing(false);
    }
  }, []);

  /* ── 执行切分 ── */
  const handleSplit = useCallback(() => {
    if (images.length === 0) {
      toast.info('请先上传标注文件');
      return;
    }
    try {
      const splitResult = splitDataset(images, config);
      setResult(splitResult);
      toast.success('切分完成');
    } catch (err) {
      toast.error('切分失败');
      logger.error('数据集切分失败:', String(err));
    }
  }, [images, config]);

  /* ── 导出 ── */
  const handleExport = useCallback(async () => {
    if (!result) return;
    setIsProcessing(true);
    try {
      const zip = new JSZip();

      if (config.outputFormat === 'yolo') {
        // YOLO 目录结构
        const addSplit = (
          splitName: string,
          splitImages: IAnnotationImage[]
        ) => {
          const imgFolder = zip.folder(`images/${splitName}`);
          const lblFolder = zip.folder(`labels/${splitName}`);
          splitImages.forEach((img) => {
            const baseName = stripExtension(img.name);
            const yoloTxt = boxesToYoloTxt(img.boxes, img.width, img.height, categories);
            lblFolder?.file(`${baseName}.txt`, yoloTxt);
            // 图片占位（无实际图片，放一个空文件说明）
            imgFolder?.file(`${baseName}.txt`, `原图：${img.name}\n尺寸：${img.width}x${img.height}\n标注框：${img.boxes.length} 个\n`);
          });
        };

        addSplit('train', result.train);
        addSplit('val', result.val);
        addSplit('test', result.test);

        // data.yaml
        zip.file('data.yaml', generateDataYaml(categories));
      } else {
        // COCO 单文件 JSON
        const cocoJson = generateSplitCocoJson(result, categories);
        zip.file('dataset_split.json', cocoJson);
      }

      // 切分说明
      const readme = `数据集切分结果
==========
切分比例：train ${config.trainRatio.toFixed(2)} / val ${config.valRatio.toFixed(2)} / test ${config.testRatio.toFixed(2)}
随机种子：${config.seed}
分层采样：${config.stratified ? '是' : '否'}
输出格式：${config.outputFormat === 'yolo' ? 'YOLO 目录结构' : 'COCO 单文件 JSON'}

统计：
  训练集：${result.trainStats.imageCount} 张图，${result.trainStats.boxCount} 个标注框
  验证集：${result.valStats.imageCount} 张图，${result.valStats.boxCount} 个标注框
  测试集：${result.testStats.imageCount} 张图，${result.testStats.boxCount} 个标注框
  总计：${images.length} 张图
`;
      zip.file('README.txt', readme);

      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, 'dataset_split.zip');
      toast.success('导出成功');
    } catch (err) {
      toast.error('导出失败');
      logger.error('切分导出失败:', String(err));
    } finally {
      setIsProcessing(false);
    }
  }, [result, config, categories, images.length]);

  // ── 饼图配置 ──
  const pieOption: EChartsOption = useMemo(() => {
    if (!result) return {};
    return {
      tooltip: { trigger: 'item' },
      legend: { bottom: 0 },
      series: [
        {
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['50%', '45%'],
          avoidLabelOverlap: false,
          label: { show: false },
          emphasis: { label: { show: false } },
          data: [
            { value: result.trainStats.imageCount, name: 'Train', itemStyle: { color: CHART_TRAIN } },
            { value: result.valStats.imageCount, name: 'Val', itemStyle: { color: CHART_VAL } },
            { value: result.testStats.imageCount, name: 'Test', itemStyle: { color: CHART_TEST } },
          ],
        },
      ],
    };
  }, [result]);

  // 类别分布对比图
  const classDistOption: EChartsOption = useMemo(() => {
    if (!result) return {};
    const countClasses = (list: IAnnotationImage[]): Map<string, number> => {
      const map = new Map<string, number>();
      list.forEach((img) => img.boxes.forEach((b) => map.set(b.label, (map.get(b.label) ?? 0) + 1)));
      return map;
    };
    const trainMap = countClasses(result.train);
    const valMap = countClasses(result.val);
    const testMap = countClasses(result.test);
    const allCats = categories;

    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { bottom: 0, data: ['Train', 'Val', 'Test'] },
      grid: { left: '3%', right: '4%', bottom: '20%', containLabel: true },
      xAxis: {
        type: 'category',
        data: allCats,
        axisLabel: { rotate: allCats.length > 6 ? 30 : 0, fontSize: 11 },
      },
      yAxis: { type: 'value', name: '目标数' },
      series: [
        {
          name: 'Train',
          type: 'bar',
          stack: 'total',
          data: allCats.map((c) => trainMap.get(c) ?? 0),
          itemStyle: { color: CHART_TRAIN },
        },
        {
          name: 'Val',
          type: 'bar',
          stack: 'total',
          data: allCats.map((c) => valMap.get(c) ?? 0),
          itemStyle: { color: CHART_VAL },
        },
        {
          name: 'Test',
          type: 'bar',
          stack: 'total',
          data: allCats.map((c) => testMap.get(c) ?? 0),
          itemStyle: { color: CHART_TEST },
        },
      ],
    };
  }, [result, categories]);

  return (
    <div className="grid grid-cols-12 gap-4 h-[calc(100vh-260px)] min-h-[560px]">
      {/* 左侧：文件列表 */}
      <div className="col-span-3 flex flex-col gap-3 min-h-0">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xml,.json,.txt"
          multiple
          className="hidden"
          onChange={(e) => handleAnnotationUpload(e.target.files)}
        />
        <Button
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessing}
        >
          <Upload className="size-4 mr-2" />
          上传标注文件
        </Button>

        <div className="text-xs text-muted-foreground">{images.length} 个标注文件</div>

        <ScrollArea className="flex-1 border rounded-md">
          {images.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              暂无数据
            </div>
          ) : (
            <div className="p-1 space-y-0.5">
              {images.map((img) => (
                <div
                  key={img.id}
                  className="px-2 py-1.5 rounded text-xs hover:bg-muted/60"
                >
                  <div className="truncate">{img.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {img.boxes.length} 个框 · {img.width}x{img.height}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* 中间：结果展示 */}
      <div className="col-span-6 flex flex-col gap-3 min-h-0">
        {!result ? (
          <div className="flex-1 border border-dashed rounded-lg flex flex-col items-center justify-center p-8">
            <SplitSquareVertical className="size-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm mb-4">
              上传标注文件后配置切分比例，一键生成 train / val / test 划分
            </p>
            <Button onClick={handleSplit} disabled={images.length === 0}>
              <Shuffle className="size-4 mr-2" />
              开始切分
            </Button>
          </div>
        ) : (
          <>
            {/* 概览卡片 */}
            <div className="grid grid-cols-3 gap-3">
              <Card className="border-l-4" style={{ borderLeftColor: CHART_TRAIN }}>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground mb-1">Train 训练集</div>
                  <div className="text-xl font-semibold tabular-nums">
                    {result.trainStats.imageCount}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {result.trainStats.boxCount} 个标注框
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4" style={{ borderLeftColor: CHART_VAL }}>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground mb-1">Val 验证集</div>
                  <div className="text-xl font-semibold tabular-nums">
                    {result.valStats.imageCount}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {result.valStats.boxCount} 个标注框
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4" style={{ borderLeftColor: CHART_TEST }}>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground mb-1">Test 测试集</div>
                  <div className="text-xl font-semibold tabular-nums">
                    {result.testStats.imageCount}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {result.testStats.boxCount} 个标注框
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 图表 */}
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">样本分布</CardTitle>
                </CardHeader>
                <CardContent>
                  <ReactECharts option={pieOption} className="h-[240px]" />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">类别分布对比</CardTitle>
                </CardHeader>
                <CardContent>
                  <ReactECharts option={classDistOption} className="h-[240px]" />
                </CardContent>
              </Card>
            </div>

            {/* 样本列表 */}
            <Card className="flex-1 min-h-0 flex flex-col">
              <CardHeader className="pb-2 shrink-0">
                <CardTitle className="text-sm">切分明细</CardTitle>
              </CardHeader>
              <CardContent className="p-0 flex-1 min-h-0">
                <div className="w-full h-full overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">图片名</TableHead>
                        <TableHead className="whitespace-nowrap">尺寸</TableHead>
                        <TableHead className="whitespace-nowrap">标注框数</TableHead>
                        <TableHead className="whitespace-nowrap">划分</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        ...result.train.map((img) => ({ ...img, split: 'train' })),
                        ...result.val.map((img) => ({ ...img, split: 'val' })),
                        ...result.test.map((img) => ({ ...img, split: 'test' })),
                      ].map((img) => (
                        <TableRow key={img.id}>
                          <TableCell className="font-medium max-w-[200px]">
                            <span className="block truncate">{img.name}</span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap tabular-nums">
                            {img.width}x{img.height}
                          </TableCell>
                          <TableCell>{img.boxes.length}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                img.split === 'train'
                                  ? 'text-green-600 border-green-200 bg-green-50'
                                  : img.split === 'val'
                                    ? 'text-blue-600 border-blue-200 bg-blue-50'
                                    : 'text-orange-600 border-orange-200 bg-orange-50'
                              }
                            >
                              {img.split}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* 右侧：切分配置 */}
      <div className="col-span-3 flex flex-col gap-3 min-h-0">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Settings className="size-4" />
              切分配置
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 比例滑块 */}
            <div className="space-y-3">
              <SliderItem
                label="训练集"
                value={config.trainRatio}
                color={CHART_TRAIN}
                onChange={(v) => {
                  const remain = 1 - v;
                  const valRatio = config.valRatio + config.testRatio > 0
                    ? (config.valRatio / (config.valRatio + config.testRatio)) * remain
                    : remain / 2;
                  const testRatio = remain - valRatio;
                  setConfig({
                    ...config,
                    trainRatio: v,
                    valRatio: Math.round(valRatio * 100) / 100,
                    testRatio: Math.round(testRatio * 100) / 100,
                  });
                }}
              />
              <SliderItem
                label="验证集"
                value={config.valRatio}
                color={CHART_VAL}
                onChange={(v) => {
                  const train = config.trainRatio;
                  const test = Math.max(0, 1 - train - v);
                  setConfig({
                    ...config,
                    valRatio: v,
                    testRatio: Math.round(test * 100) / 100,
                  });
                }}
              />
              <SliderItem
                label="测试集"
                value={config.testRatio}
                color={CHART_TEST}
                onChange={(v) => {
                  const train = config.trainRatio;
                  const val = Math.max(0, 1 - train - v);
                  setConfig({
                    ...config,
                    testRatio: v,
                    valRatio: Math.round(val * 100) / 100,
                  });
                }}
              />
            </div>

            {/* 随机种子 */}
            <div className="space-y-1">
              <Label className="text-xs">随机种子</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={config.seed}
                  onChange={(e) =>
                    setConfig({ ...config, seed: parseInt(e.target.value) || 42 })
                  }
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setConfig({ ...config, seed: Math.floor(Math.random() * 100000) })}
                  title="随机种子"
                >
                  <Shuffle className="size-4" />
                </Button>
              </div>
            </div>

            {/* 分层采样 */}
            <div className="flex items-center justify-between">
              <Label className="text-xs cursor-pointer" htmlFor="stratified">
                <Layers className="size-3.5 inline mr-1" />
                按类别分层采样
              </Label>
              <Switch
                id="stratified"
                checked={config.stratified}
                onCheckedChange={(v) => setConfig({ ...config, stratified: v })}
              />
            </div>

            {/* 输出格式 */}
            <div className="space-y-1">
              <Label className="text-xs">输出格式</Label>
              <Select
                value={config.outputFormat}
                onValueChange={(v: 'yolo' | 'coco') =>
                  setConfig({ ...config, outputFormat: v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yolo">YOLO 目录结构</SelectItem>
                  <SelectItem value="coco">COCO 单文件 JSON</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-2 mt-auto">
          <Button
            className="flex-1"
            onClick={handleSplit}
            disabled={images.length === 0}
          >
            <SplitSquareVertical className="size-4 mr-2" />
            执行切分
          </Button>
          <Button
            variant="secondary"
            onClick={handleExport}
            disabled={!result || isProcessing}
          >
            <Download className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function SliderItem({
  label,
  value,
  color,
  onChange,
}: {
  label: string;
  value: number;
  color: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
          {label}
        </span>
        <span className="text-xs tabular-nums font-medium">
          {(value * 100).toFixed(0)}%
        </span>
      </div>
      <Slider
        value={[value * 100]}
        min={0}
        max={100}
        step={1}
        onValueChange={([v]) => onChange(Math.round(v) / 100)}
      />
    </div>
  );
}
