import { useState, useMemo, useCallback } from 'react';
import {
  Save,
  GitBranch,
  Trash2,
  Download,
  Diff,
  Clock,
  Image,
  Box,
  Tags,
  ArrowUp,
  ArrowDown,
  Minus,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  getAllVersions,
  saveVersion,
  deleteVersion,
  compareVersions,
  getNextVersion,
} from '@/utils/annotation/versionManager';
import type { IDatasetVersion, IVersionDiff, IAnnotationImage, AnnotationFormat } from '@/types/annotation';

interface VersionTabProps {
  images: IAnnotationImage[];
  format: AnnotationFormat;
  augmentConfig?: Record<string, unknown>;
  splitConfig?: Record<string, unknown>;
}

export default function VersionManagerTab({ images, format, augmentConfig, splitConfig }: VersionTabProps) {
  const [versions, setVersions] = useState<IDatasetVersion[]>(() => getAllVersions());
  const [selectedId, setSelectedId] = useState<string | null>(versions[0]?.id || null);
  const [compareWithId, setCompareWithId] = useState<string | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newVersion, setNewVersion] = useState(getNextVersion('patch'));
  const [newName, setNewName] = useState('');
  const [bumpType, setBumpType] = useState<'patch' | 'minor' | 'major'>('patch');

  const selected = versions.find((v) => v.id === selectedId) || null;
  const compareWith = versions.find((v) => v.id === compareWithId) || null;

  const diff: IVersionDiff | null = useMemo(() => {
    if (!selected || !compareWith) return null;
    // 用较早的版本作为 v1
    const [v1, v2] = selected.createdAt < compareWith.createdAt
      ? [selected, compareWith]
      : [compareWith, selected];
    return compareVersions(v1, v2);
  }, [selected, compareWith]);

  // 刷新版本列表
  const refresh = useCallback(() => {
    setVersions(getAllVersions());
  }, []);

  // 保存新版本
  const handleSave = useCallback(() => {
    if (images.length === 0) {
      toast.info('请先加载图片和标注');
      return;
    }
    const v = saveVersion(images, {
      version: newVersion,
      name: newName || newVersion,
      format,
      augmentConfig: augmentConfig as unknown as IDatasetVersion['augmentConfig'],
      splitConfig: splitConfig as unknown as IDatasetVersion['splitConfig'],
    });
    setSelectedId(v.id);
    setShowSaveDialog(false);
    setNewName('');
    setNewVersion(getNextVersion(bumpType));
    refresh();
    toast.success(`已保存版本 ${v.version}`);
  }, [images, newVersion, newName, format, augmentConfig, splitConfig, bumpType, refresh]);

  // 删除版本
  const handleDelete = useCallback(
    (id: string) => {
      deleteVersion(id);
      if (selectedId === id) setSelectedId(null);
      if (compareWithId === id) setCompareWithId(null);
      refresh();
      toast.success('已删除版本');
    },
    [selectedId, compareWithId, refresh]
  );

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="grid grid-cols-12 gap-4 h-[calc(100vh-280px)] min-h-[500px]">
      {/* 左侧：版本列表 */}
      <Card className="col-span-4 flex flex-col min-h-0">
        <CardHeader className="py-3 px-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <GitBranch className="size-4" />
            版本列表 ({versions.length})
          </CardTitle>
          <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
            <DialogTrigger asChild>
              <Button size="sm" variant="secondary" className="h-7">
                <Save className="size-3.5 mr-1" />
                保存版本
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>保存数据集版本</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">版本号</Label>
                  <div className="flex gap-2">
                    <Select value={bumpType} onValueChange={(v) => {
                      setBumpType(v as any);
                      setNewVersion(getNextVersion(v as any));
                    }}>
                      <SelectTrigger className="w-28 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="patch">Patch</SelectItem>
                        <SelectItem value="minor">Minor</SelectItem>
                        <SelectItem value="major">Major</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input value={newVersion} onChange={(e) => setNewVersion(e.target.value)} className="h-8 text-sm font-mono" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">版本名称</Label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="如：数据增强后 v1"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>当前数据集：{images.length} 张图片</p>
                  <p>格式：{format.toUpperCase()}</p>
                  {augmentConfig && <p>含数据增强配置</p>}
                  {splitConfig && <p>含数据集切分配置</p>}
                </div>
                <Button onClick={handleSave} className="w-full">
                  <Save className="size-4 mr-2" />
                  确认保存
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 p-2 pt-0">
          <ScrollArea className="h-full">
            {versions.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <GitBranch className="size-10 mx-auto mb-2 opacity-30" />
                <p>暂无历史版本</p>
                <p className="text-xs mt-1 opacity-60">保存当前数据集为快照</p>
              </div>
            ) : (
              <div className="space-y-1">
                {versions.map((v) => (
                  <div
                    key={v.id}
                    className={`group p-2 rounded cursor-pointer border ${
                      selectedId === v.id
                        ? 'border-primary/50 bg-accent/30'
                        : 'border-transparent hover:bg-muted/60'
                    }`}
                    onClick={() => setSelectedId(v.id)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">{v.version}</span>
                      <button
                        className="opacity-0 group-hover:opacity-100 text-destructive hover:opacity-70"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(v.id);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    <div className="text-[11px] font-medium mt-0.5">{v.name}</div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-1">
                      <span className="flex items-center gap-0.5">
                        <Clock className="size-2.5" />
                        {formatDate(v.createdAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-[10px] h-4 px-1">
                        {v.imageCount} 图
                      </Badge>
                      <Badge variant="outline" className="text-[10px] h-4 px-1">
                        {v.boxCount} 框
                      </Badge>
                      <Badge variant="outline" className="text-[10px] h-4 px-1">
                        {v.categoryCount} 类
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* 中间：版本详情 */}
      <Card className="col-span-4 flex flex-col min-h-0">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">版本详情</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 p-4 overflow-y-auto space-y-4">
          {selected ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div>
                <div className="text-lg font-bold">{selected.version}</div>
                <div className="text-sm text-muted-foreground">{selected.name}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {formatDate(selected.createdAt)}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="border rounded-md p-2 text-center">
                  <Image className="size-4 mx-auto mb-1 text-muted-foreground" />
                  <div className="text-lg font-bold tabular-nums">{selected.imageCount}</div>
                  <div className="text-[10px] text-muted-foreground">图片数</div>
                </div>
                <div className="border rounded-md p-2 text-center">
                  <Box className="size-4 mx-auto mb-1 text-muted-foreground" />
                  <div className="text-lg font-bold tabular-nums">{selected.boxCount}</div>
                  <div className="text-[10px] text-muted-foreground">标注框</div>
                </div>
                <div className="border rounded-md p-2 text-center">
                  <Tags className="size-4 mx-auto mb-1 text-muted-foreground" />
                  <div className="text-lg font-bold tabular-nums">{selected.categoryCount}</div>
                  <div className="text-[10px] text-muted-foreground">类别数</div>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="text-xs font-medium">类别分布</div>
                <div className="space-y-1">
                  {selected.categories.map((c) => (
                    <div key={c.name} className="flex items-center gap-2 text-xs">
                      <span className="w-20 truncate">{c.name}</span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${(c.count / Math.max(...selected.categories.map(x => x.count))) * 100}%` }}
                        />
                      </div>
                      <span className="w-8 text-right tabular-nums">{c.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="text-xs font-medium">Pipeline 参数</div>
                <div className="text-[11px] text-muted-foreground space-y-1">
                  <p>格式：{selected.format.toUpperCase()}</p>
                  {selected.augmentConfig ? (
                    <p>数据增强：已配置</p>
                  ) : (
                    <p>数据增强：无</p>
                  )}
                  {selected.splitConfig ? (
                    <p>数据集切分：已配置</p>
                  ) : (
                    <p>数据集切分：无</p>
                  )}
                </div>
              </div>

              <Button size="sm" variant="secondary" className="w-full">
                <Download className="size-3.5 mr-1" />
                导出版本数据集
              </Button>
            </motion.div>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              选择版本查看详情
            </div>
          )}
        </CardContent>
      </Card>

      {/* 右侧：版本对比 */}
      <Card className="col-span-4 flex flex-col min-h-0">
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Diff className="size-4" />
              版本对比
            </CardTitle>
            <Select value={compareWithId || ''} onValueChange={setCompareWithId}>
              <SelectTrigger className="h-7 w-28 text-xs">
                <SelectValue placeholder="选择对比版本" />
              </SelectTrigger>
              <SelectContent>
                {versions.filter((v) => v.id !== selectedId).map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.version}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 p-4 overflow-y-auto">
          {diff && compareWith ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="border rounded-md p-2 text-center">
                  <div className="text-[10px] text-muted-foreground">图片变化</div>
                  <div className={`text-lg font-bold tabular-nums flex items-center justify-center gap-1 ${
                    diff.imageCountDiff > 0 ? 'text-green-600' : diff.imageCountDiff < 0 ? 'text-red-500' : ''
                  }`}>
                    {diff.imageCountDiff > 0 && <ArrowUp className="size-3.5" />}
                    {diff.imageCountDiff < 0 && <ArrowDown className="size-3.5" />}
                    {diff.imageCountDiff === 0 && <Minus className="size-3.5" />}
                    {diff.imageCountDiff > 0 ? `+${diff.imageCountDiff}` : diff.imageCountDiff}
                  </div>
                </div>
                <div className="border rounded-md p-2 text-center">
                  <div className="text-[10px] text-muted-foreground">标注框变化</div>
                  <div className={`text-lg font-bold tabular-nums flex items-center justify-center gap-1 ${
                    diff.boxCountDiff > 0 ? 'text-green-600' : diff.boxCountDiff < 0 ? 'text-red-500' : ''
                  }`}>
                    {diff.boxCountDiff > 0 && <ArrowUp className="size-3.5" />}
                    {diff.boxCountDiff < 0 && <ArrowDown className="size-3.5" />}
                    {diff.boxCountDiff === 0 && <Minus className="size-3.5" />}
                    {diff.boxCountDiff > 0 ? `+${diff.boxCountDiff}` : diff.boxCountDiff}
                  </div>
                </div>
              </div>

              {diff.addedImages.length > 0 && (
                <div>
                  <div className="text-green-600 font-medium text-xs mb-1">
                    <ArrowUp className="size-3 inline mr-1" />
                    新增图片 ({diff.addedImages.length})
                  </div>
                  <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded p-2 max-h-24 overflow-y-auto text-[11px] space-y-0.5">
                    {diff.addedImages.slice(0, 10).map((n) => (
                      <div key={n} className="truncate">{n}</div>
                    ))}
                    {diff.addedImages.length > 10 && (
                      <div className="text-muted-foreground">...还有 {diff.addedImages.length - 10} 张</div>
                    )}
                  </div>
                </div>
              )}

              {diff.removedImages.length > 0 && (
                <div>
                  <div className="text-red-500 font-medium text-xs mb-1">
                    <ArrowDown className="size-3 inline mr-1" />
                    删除图片 ({diff.removedImages.length})
                  </div>
                  <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded p-2 max-h-24 overflow-y-auto text-[11px] space-y-0.5">
                    {diff.removedImages.slice(0, 10).map((n) => (
                      <div key={n} className="truncate">{n}</div>
                    ))}
                    {diff.removedImages.length > 10 && (
                      <div className="text-muted-foreground">...还有 {diff.removedImages.length - 10} 张</div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <div className="font-medium text-xs mb-1">类别分布变化</div>
                <div className="space-y-1">
                  {diff.categoryDiff.map((c) => {
                    const delta = c.newCount - c.oldCount;
                    return (
                      <div key={c.name} className="flex items-center gap-2 text-[11px]">
                        <span className="w-16 truncate">{c.name}</span>
                        <span className="tabular-nums w-12 text-right text-muted-foreground">
                          {c.oldCount} → {c.newCount}
                        </span>
                        <span className={`w-10 text-right tabular-nums ${
                          delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-500' : 'text-muted-foreground'
                        }`}>
                          {delta > 0 ? `+${delta}` : delta}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground text-center">
              <div>
                <Diff className="size-8 mx-auto mb-2 opacity-30" />
                <p>选择两个版本进行对比</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
