import { useState, useMemo, useCallback, useRef } from 'react';
import { Upload, BarChart3, FileText, Filter, Download } from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import type { IAnnotationImage, AnnotationFormat } from '@/types/annotation';
import { computeDatasetStats, getAllCategories } from '@/utils/annotation/stats';
import {
  parseVocXml,
  vocToBoxes,
  parseCocoJson,
  cocoToImageMap,
  parseYoloLine,
  yoloToBoxes,
  parseLabelMeJson,
  labelMeToBoxes,
  detectAnnotationFormat,
  getColorForLabel,
} from '@/utils/annotation/formats';
import {
  readFileAsText,
  getImageSize,
  downloadJson,
  stripExtension,
} from '@/utils/file/fileUtils';

const CHART_PRIMARY = '#f97316';
const CHART_SECONDARY = '#3b82f6';
const CHART_COLORS = [
  '#f97316',
  '#3b82f6',
  '#22c55e',
  '#ec4899',
  '#8b5cf6',
  '#06b6d4',
  '#eab308',
  '#ef4444',
];

export default function StatsTab() {
  const [images, setImages] = useState<IAnnotationImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);

  // 所有类别
  const allCategories = useMemo(() => getAllCategories(images), [images]);

  // 筛选后的类别列表
  const filterList = useMemo(() => {
    if (filterCategory === 'all') return [];
    return [filterCategory];
  }, [filterCategory]);

  // 统计数据
  const stats = useMemo(
    () => computeDatasetStats(images, filterList),
    [images, filterList]
  );

  /* ── 上传解析 ── */
  const handleAnnotationUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsLoading(true);
    let added = 0;
    const newImages: IAnnotationImage[] = [];

    try {
      // 按基础名分组的标注文件
      const annotationFiles: Array<{ name: string; file: File; format: AnnotationFormat; content: string }> = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const name = file.name.toLowerCase();
        if (!name.endsWith('.xml') && !name.endsWith('.json') && !name.endsWith('.txt')) continue;
        try {
          const content = await readFileAsText(file);
          const fmt = detectAnnotationFormat(file.name, content);
          if (fmt) {
            annotationFiles.push({ name: file.name, file, format: fmt, content });
          }
        } catch (err) {
          logger.warn('标注文件读取失败:', String(err));
        }
      }

      // COCO JSON：单文件包含所有图片标注
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
        // VOC / YOLO / LabelMe：按文件处理
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
            // YOLO 无尺寸信息，默认占位 640x640（统计会失真，建议配合图片上传）
            const lines = af.content.split('\n').filter((l) => l.trim());
            const boxes: import('@/types/annotation').IAnnotationBox[] = lines
              .map((line) => {
                const yolo = parseYoloLine(line);
                if (!yolo) return null;
                const label = `class_${yolo.classIndex}`;
                const w = yolo.w * 640;
                const h = yolo.h * 640;
                return {
                  id: Math.random().toString(36).slice(2, 10),
                  label,
                  x: yolo.cx * 640 - w / 2,
                  y: yolo.cy * 640 - h / 2,
                  width: w,
                  height: h,
                  color: getColorForLabel(label),
                };
              })
              .filter(Boolean) as import('@/types/annotation').IAnnotationBox[];
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
      toast.success(`已加载 ${added} 个标注文件`);
    } catch (err) {
      toast.error('解析失败');
      logger.error('标注解析失败:', String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  /* ── 导出 JSON ── */
  const handleExportStats = useCallback(() => {
    if (images.length === 0) {
      toast.info('暂无数据');
      return;
    }
    const data = {
      overview: stats.overview,
      categoryStats: stats.categoryStats,
      areaDistribution: stats.areaDistribution,
      aspectRatioDistribution: stats.aspectRatioDistribution,
      perImageDistribution: stats.perImageDistribution,
    };
    downloadJson(data, 'dataset_stats.json');
    toast.success('已导出统计报告');
  }, [images.length, stats]);

  // ── 图表配置 ──

  // 类别数量分布图
  const categoryChartOption: EChartsOption = useMemo(() => {
    const data = stats.categoryStats;
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { bottom: 0, data: ['图片数', '目标数'] },
      grid: { left: '3%', right: '4%', bottom: '20%', containLabel: true },
      xAxis: {
        type: 'category',
        data: data.map((d) => d.label),
        axisLabel: { rotate: data.length > 6 ? 30 : 0, fontSize: 11 },
      },
      yAxis: { type: 'value' },
      series: [
        {
          name: '图片数',
          type: 'bar',
          data: data.map((d) => d.imageCount),
          itemStyle: { color: CHART_PRIMARY, borderRadius: [4, 4, 0, 0] },
        },
        {
          name: '目标数',
          type: 'bar',
          data: data.map((d) => d.boxCount),
          itemStyle: { color: CHART_SECONDARY, borderRadius: [4, 4, 0, 0] },
        },
      ],
    };
  }, [stats.categoryStats]);

  // 标注框面积分布
  const areaChartOption: EChartsOption = useMemo(() => {
    const data = stats.areaDistribution;
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true },
      xAxis: {
        type: 'category',
        data: data.map((d) => d.label),
        axisLabel: { fontSize: 11 },
      },
      yAxis: { type: 'value', name: '框数量' },
      series: [
        {
          type: 'bar',
          data: data.map((d) => d.count),
          itemStyle: { color: CHART_PRIMARY, borderRadius: [4, 4, 0, 0] },
        },
      ],
    };
  }, [stats.areaDistribution]);

  // 宽高比分布
  const arChartOption: EChartsOption = useMemo(() => {
    const data = stats.aspectRatioDistribution;
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true },
      xAxis: {
        type: 'category',
        data: data.map((d) => d.label),
        axisLabel: { fontSize: 10 },
      },
      yAxis: { type: 'value', name: '框数量' },
      series: [
        {
          type: 'bar',
          data: data.map((d) => d.count),
          itemStyle: { color: CHART_SECONDARY, borderRadius: [4, 4, 0, 0] },
        },
      ],
    };
  }, [stats.aspectRatioDistribution]);

  // 每图目标数分布
  const perImageChartOption: EChartsOption = useMemo(() => {
    const data = stats.perImageDistribution;
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true },
      xAxis: {
        type: 'category',
        data: data.map((d) => d.label),
        axisLabel: { fontSize: 11 },
      },
      yAxis: { type: 'value', name: '图片数' },
      series: [
        {
          type: 'bar',
          data: data.map((d) => d.count),
          itemStyle: { color: '#22c55e', borderRadius: [4, 4, 0, 0] },
        },
      ],
    };
  }, [stats.perImageDistribution]);

  return (
    <div className="space-y-4">
      {/* 操作栏 */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xml,.json,.txt"
          multiple
          className="hidden"
          onChange={(e) => handleAnnotationUpload(e.target.files)}
        />
        <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={isLoading}>
          <Upload className="size-4 mr-2" />
          上传标注文件
        </Button>
        <Button variant="outline" onClick={handleExportStats} disabled={images.length === 0}>
          <Download className="size-4 mr-2" />
          导出报告
        </Button>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <Filter className="size-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">类别筛选：</span>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类别</SelectItem>
              {allCategories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {images.length === 0 ? (
        <div className="border border-dashed rounded-lg p-16 text-center">
          <BarChart3 className="size-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">
            上传 VOC / COCO / YOLO / LabelMe 标注文件以生成数据集统计报告
          </p>
          <Button onClick={() => fileInputRef.current?.click()}>
            <Upload className="size-4 mr-2" />
            开始分析
          </Button>
        </div>
      ) : (
        <>
          {/* 概览卡片 */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <StatCard label="图片总数" value={stats.overview.totalImages} />
            <StatCard label="标注框总数" value={stats.overview.totalBoxes} />
            <StatCard label="类别数" value={stats.overview.categoryCount} />
            <StatCard
              label="平均每图目标"
              value={stats.overview.avgBoxesPerImage.toFixed(1)}
            />
            <StatCard
              label="带标注图片占比"
              value={`${(stats.overview.annotatedRatio * 100).toFixed(1)}%`}
            />
            <StatCard
              label="每图目标范围"
              value={`${stats.overview.minBoxesPerImage} ~ ${stats.overview.maxBoxesPerImage}`}
            />
          </div>

          {/* 图表区 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">类别数量分布</CardTitle>
              </CardHeader>
              <CardContent>
                <ReactECharts option={categoryChartOption} className="h-[300px]" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">标注框面积分布</CardTitle>
              </CardHeader>
              <CardContent>
                <ReactECharts option={areaChartOption} className="h-[300px]" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">标注框宽高比分布</CardTitle>
              </CardHeader>
              <CardContent>
                <ReactECharts option={arChartOption} className="h-[300px]" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">每张图片目标数分布</CardTitle>
              </CardHeader>
              <CardContent>
                <ReactECharts option={perImageChartOption} className="h-[300px]" />
              </CardContent>
            </Card>
          </div>

          {/* 类别详情表 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">类别详细统计</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">类别</TableHead>
                      <TableHead className="whitespace-nowrap">颜色</TableHead>
                      <TableHead className="whitespace-nowrap">图片数</TableHead>
                      <TableHead className="whitespace-nowrap">目标数</TableHead>
                      <TableHead className="whitespace-nowrap">占比</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.categoryStats.map((cat) => (
                      <TableRow key={cat.label}>
                        <TableCell className="font-medium">{cat.label}</TableCell>
                        <TableCell>
                          <span
                            className="inline-block size-4 rounded-sm border border-border"
                            style={{ backgroundColor: cat.color }}
                          />
                        </TableCell>
                        <TableCell>{cat.imageCount}</TableCell>
                        <TableCell>{cat.boxCount}</TableCell>
                        <TableCell>
                          {stats.overview.totalBoxes > 0
                            ? `${((cat.boxCount / stats.overview.totalBoxes) * 100).toFixed(1)}%`
                            : '0%'}
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
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground mb-1">{label}</div>
        <div className="text-xl font-semibold tabular-nums tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}
