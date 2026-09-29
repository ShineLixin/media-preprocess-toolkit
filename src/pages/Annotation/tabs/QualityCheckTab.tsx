import { useState, useCallback, useRef } from 'react';
import { Upload, FileText, Download, AlertTriangle, CheckCircle2, XCircle, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit-lite';
import type { IAnnotationImage, IQualityReport, QualityIssueType } from '@/types/annotation';
import {
  detectAnnotationFormat,
  parseVocXml,
  vocToBoxes,
  parseCocoJson,
  cocoToImageMap,
  yoloToBoxes,
  parseLabelMeJson,
  labelMeToBoxes,
  uid,
} from '@/utils/annotation/formats';
import { runQualityCheck, QUALITY_ISSUE_LABELS } from '@/utils/annotation/quality';
import { readFileAsText, getImageSize, stripExtension, downloadJson } from '@/utils/file/fileUtils';

export default function QualityCheckTab() {
  const [images, setImages] = useState<IAnnotationImage[]>([]);
  const [report, setReport] = useState<IQualityReport | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [minBoxArea, setMinBoxArea] = useState('100');
  const [maxAreaRatio, setMaxAreaRatio] = useState('0.8');
  const [maxAspectRatio, setMaxAspectRatio] = useState('15');
  const [categoryInput, setCategoryInput] = useState('');
  const [knownCategories, setKnownCategories] = useState<string[]>([]);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const annoInputRef = useRef<HTMLInputElement>(null);

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
      toast.success(`已添加 ${newImages.length} 张图片`);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  /* ── 标注文件上传 ── */
  const handleAnnotationUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsProcessing(true);
    let matched = 0;
    try {
      const updatedImages = [...images];

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
                matched++;
              }
            });
            continue;
          } catch {
            continue;
          }
        }

        const imgIdx = updatedImages.findIndex((img) => stripExtension(img.name) === baseName);
        if (imgIdx < 0) continue;

        try {
          let boxes = [] as typeof updatedImages[0]['boxes'];
          switch (format) {
            case 'voc':
              boxes = vocToBoxes(parseVocXml(content));
              break;
            case 'yolo': {
              const img = updatedImages[imgIdx];
              const cats = knownCategories.length > 0 ? knownCategories : [];
              boxes = yoloToBoxes(content, img.width, img.height, cats);
              break;
            }
            case 'labelme':
              boxes = labelMeToBoxes(parseLabelMeJson(content));
              break;
          }
          updatedImages[imgIdx] = { ...updatedImages[imgIdx], boxes, format };
          matched++;
        } catch {
          /* skip */
        }
      }
      setImages(updatedImages);
      toast.success(`成功解析 ${matched} 个标注文件`);
    } finally {
      setIsProcessing(false);
    }
  }, [images, knownCategories]);

  /* ── 执行质检 ── */
  const handleRunCheck = useCallback(() => {
    if (images.length === 0) {
      toast.info('请先上传图片和标注文件');
      return;
    }
    setIsProcessing(true);
    try {
      const result = runQualityCheck(images, {
        minBoxArea: parseInt(minBoxArea, 10) || 100,
        maxBoxAreaRatio: parseFloat(maxAreaRatio) || 0.8,
        maxAspectRatio: parseFloat(maxAspectRatio) || 15,
        knownCategories,
      });
      setReport(result);
      toast.success(
        `质检完成：${result.issueImages} 张问题图片，${result.issueCount} 个问题`
      );
    } catch (err) {
      toast.error('质检失败');
      logger.error('质检失败:', String(err));
    } finally {
      setIsProcessing(false);
    }
  }, [images, minBoxArea, maxAreaRatio, maxAspectRatio, knownCategories]);

  /* ── 导出报告 ── */
  const handleExportReport = useCallback(() => {
    if (!report) return;
    downloadJson(report, 'quality_report.json');
  }, [report]);

  /* ── 添加类别 ── */
  const handleAddCategory = useCallback(() => {
    const v = categoryInput.trim();
    if (!v) return;
    if (knownCategories.includes(v)) {
      toast.info('类别已存在');
      return;
    }
    setKnownCategories((prev) => [...prev, v]);
    setCategoryInput('');
  }, [categoryInput, knownCategories]);

  /* ── 问题类型图标/颜色 ── */
  const getIssueIcon = (type: QualityIssueType) => {
    switch (type) {
      case 'missing_annotation':
        return <XCircle className="size-4 text-destructive" />;
      case 'box_too_small':
      case 'box_too_large':
      case 'aspect_ratio_abnormal':
        return <AlertTriangle className="size-4 text-warning" />;
      case 'unknown_category':
        return <AlertTriangle className="size-4 text-info" />;
      default:
        return <AlertTriangle className="size-4" />;
    }
  };

  const issueTypes: QualityIssueType[] = [
    'missing_annotation',
    'box_too_small',
    'box_too_large',
    'aspect_ratio_abnormal',
    'unknown_category',
  ];

  return (
    <div className="grid grid-cols-12 gap-4 h-[calc(100vh-220px)] min-h-[500px]">
      {/* 左侧：上传 + 配置 */}
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
            variant="secondary"
            onClick={() => imageInputRef.current?.click()}
            disabled={isProcessing}
          >
            <Upload className="size-4 mr-2" />
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

        <Card>
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-sm">质检配置</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 space-y-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">最小框面积 (px²)</label>
              <Input
                type="number"
                value={minBoxArea}
                onChange={(e) => setMinBoxArea(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">最大框面积占比</label>
              <Input
                type="number"
                step="0.1"
                value={maxAreaRatio}
                onChange={(e) => setMaxAreaRatio(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">最大宽高比</label>
              <Input
                type="number"
                value={maxAspectRatio}
                onChange={(e) => setMaxAspectRatio(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">预设类别列表</label>
              <div className="flex gap-1">
                <Input
                  value={categoryInput}
                  onChange={(e) => setCategoryInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCategory())}
                  placeholder="输入类别名"
                  className="h-8 text-sm flex-1"
                />
                <Button size="sm" variant="secondary" className="h-8 px-2" onClick={handleAddCategory}>
                  添加
                </Button>
              </div>
              {knownCategories.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {knownCategories.map((c) => (
                    <Badge
                      key={c}
                      variant="outline"
                      className="text-xs cursor-pointer"
                      onClick={() =>
                        setKnownCategories((prev) => prev.filter((x) => x !== c))
                      }
                    >
                      {c} ×
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Button
          className="w-full"
          onClick={handleRunCheck}
          disabled={isProcessing || images.length === 0}
        >
          <BarChart3 className="size-4 mr-2" />
          开始质检
        </Button>

        <div className="text-xs text-muted-foreground">
          已加载 {images.length} 张图片，{' '}
          {images.reduce((s, i) => s + i.boxes.length, 0)} 个标注框
        </div>
      </div>

      {/* 右侧：报告 */}
      <div className="col-span-9 flex flex-col gap-3 min-h-0">
        {report ? (
          <>
            {/* 概览卡片 */}
            <div className="grid grid-cols-4 gap-3">
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">总样本数</div>
                  <div className="text-2xl font-bold mt-1">{report.totalImages}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">标注框总数</div>
                  <div className="text-2xl font-bold mt-1">{report.totalBoxes}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">问题样本</div>
                  <div className="text-2xl font-bold mt-1 text-destructive">
                    {report.issueImages}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">通过率</div>
                  <div
                    className={`text-2xl font-bold mt-1 ${
                      report.passRate >= 90 ? 'text-success' : report.passRate >= 70 ? 'text-warning' : 'text-destructive'
                    }`}
                  >
                    {report.passRate.toFixed(1)}%
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 问题分布 + 明细 */}
            <Card className="flex-1 min-h-0 flex flex-col">
              <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm">质检报告</CardTitle>
                <Button size="sm" variant="secondary" onClick={handleExportReport}>
                  <Download className="size-3.5 mr-1" />
                  导出 JSON
                </Button>
              </CardHeader>
              <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
                <Tabs defaultValue="overview" className="w-full h-full flex flex-col">
                  <div className="px-3">
                    <TabsList className="mb-2">
                      <TabsTrigger value="overview">问题分布</TabsTrigger>
                      <TabsTrigger value="detail">问题明细</TabsTrigger>
                    </TabsList>
                  </div>
                  <TabsContent value="overview" className="flex-1 mt-0 p-3 min-h-0">
                    <ScrollArea className="h-full">
                      <div className="space-y-3">
                        {issueTypes.map((type) => {
                          const count = report.issuesByType[type] || 0;
                          const pct = report.issueCount > 0 ? (count / report.issueCount) * 100 : 0;
                          return (
                            <div key={type} className="space-y-1">
                              <div className="flex items-center justify-between text-sm">
                                <span className="flex items-center gap-2">
                                  {getIssueIcon(type)}
                                  {QUALITY_ISSUE_LABELS[type]}
                                </span>
                                <span className="text-muted-foreground">
                                  {count} 个 ({pct.toFixed(1)}%)
                                </span>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary rounded-full transition-all"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {report.issueCount === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                          <CheckCircle2 className="size-10 text-success mb-2" />
                          <p className="text-sm">未发现问题，数据集质量良好</p>
                        </div>
                      )}
                    </ScrollArea>
                  </TabsContent>
                  <TabsContent value="detail" className="flex-1 mt-0 min-h-0">
                    <div className="w-full overflow-x-auto h-full">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="whitespace-nowrap">图片名称</TableHead>
                            <TableHead className="whitespace-nowrap">问题类型</TableHead>
                            <TableHead className="whitespace-nowrap">描述</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {report.issues.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                                暂无问题
                              </TableCell>
                            </TableRow>
                          ) : (
                            report.issues.map((issue, idx) => (
                              <TableRow key={idx}>
                                <TableCell className="font-medium max-w-[200px]">
                                  <span className="block truncate">{issue.imageName}</span>
                                </TableCell>
                                <TableCell>
                                  <span className="flex items-center gap-1.5">
                                    {getIssueIcon(issue.type)}
                                    {QUALITY_ISSUE_LABELS[issue.type]}
                                  </span>
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {issue.description}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center border rounded-md bg-muted/20 text-muted-foreground">
            <BarChart3 className="size-12 opacity-30 mb-3" />
            <p className="text-sm">上传图片和标注文件后，点击"开始质检"</p>
            <p className="text-xs mt-1 opacity-70">支持 VOC / COCO / YOLO / LabelMe 格式</p>
          </div>
        )}
      </div>
    </div>
  );
}
