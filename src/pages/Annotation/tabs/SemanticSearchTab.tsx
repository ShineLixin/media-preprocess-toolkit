import { useState, useMemo, useCallback } from 'react';
import {
  Search,
  Filter,
  Download,
  Grid3X3,
  Tag,
  Box,
  ImageIcon,
  X,
  SlidersHorizontal,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { semanticSearch, getAllCategories, defaultSearchFilters } from '@/utils/annotation/semanticSearch';
import type { IAnnotationImage, ISemanticSearchFilters } from '@/types/annotation';
import { logger } from '@lark-apaas/client-toolkit-lite';
import { Image } from '@/components/ui/image';

interface SemanticSearchTabProps {
  images: IAnnotationImage[];
}

export default function SemanticSearchTab({ images }: SemanticSearchTabProps) {
  const [filters, setFilters] = useState<ISemanticSearchFilters>(defaultSearchFilters);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const allCategories = useMemo(() => getAllCategories(images), [images]);

  const results = useMemo(() => semanticSearch(images, filters), [images, filters]);

  const updateFilter = useCallback(<K extends keyof ISemanticSearchFilters>(
    key: K,
    value: ISemanticSearchFilters[K]
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(defaultSearchFilters());
  }, []);

  const handleExport = useCallback(() => {
    if (results.length === 0) {
      toast.info('暂无检索结果可导出');
      return;
    }
    toast.success(`已选中 ${results.length} 张图片及其标注，准备导出`);
    logger.info('导出检索结果:', String(results.map((i) => i.name)));
  }, [results]);

  const toggleCategory = useCallback((cat: string) => {
    setFilters((prev) => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter((c) => c !== cat)
        : [...prev.categories, cat],
    }));
  }, []);

  const hasActiveFilters = useMemo(() => {
    const d = defaultSearchFilters();
    return (
      filters.keyword !== d.keyword ||
      filters.categories.length > 0 ||
      filters.minBoxCount !== d.minBoxCount ||
      filters.maxBoxCount !== d.maxBoxCount ||
      filters.minBoxArea !== d.minBoxArea ||
      filters.maxBoxArea !== d.maxBoxArea ||
      filters.minAspectRatio !== d.minAspectRatio ||
      filters.maxAspectRatio !== d.maxAspectRatio
    );
  }, [filters]);

  return (
    <div className="grid grid-cols-12 gap-4 h-[calc(100vh-280px)] min-h-[500px]">
      {/* 左侧：筛选面板 */}
      <Card className="col-span-3 flex flex-col min-h-0">
        <CardHeader className="py-3 px-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <SlidersHorizontal className="size-4" />
              检索条件
            </CardTitle>
            {hasActiveFilters && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                onClick={resetFilters}
              >
                <X className="size-3 mr-0.5" />
                重置
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 p-3 overflow-y-auto space-y-4 text-xs">
          {/* 关键词搜索 */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <Search className="size-3.5" />
              文件名关键词
            </Label>
            <Input
              value={filters.keyword}
              onChange={(e) => updateFilter('keyword', e.target.value)}
              placeholder="输入关键词..."
              className="h-7 text-xs"
            />
          </div>

          {/* 类别筛选 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <Tag className="size-3.5" />
                类别 ({allCategories.length})
              </Label>
              <Select
                value={filters.categoryMatch}
                onValueChange={(v) => updateFilter('categoryMatch', v as 'any' | 'all')}
              >
                <SelectTrigger className="h-6 w-16 text-[10px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">任一</SelectItem>
                  <SelectItem value="all">全部</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <ScrollArea className="max-h-32 -mx-1 px-1">
              <div className="flex flex-wrap gap-1">
                {allCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                      filters.categories.includes(cat)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted border-border'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
                {allCategories.length === 0 && (
                  <span className="text-[10px] text-muted-foreground">暂无类别</span>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* 高级筛选 */}
          <div className="space-y-2 pt-2 border-t">
            <button
              onClick={() => setAdvancedOpen(!advancedOpen)}
              className="w-full flex items-center justify-between text-xs font-medium"
            >
              <span className="flex items-center gap-1.5">
                <Filter className="size-3.5" />
                高级筛选
              </span>
              <Badge variant="outline" className="text-[10px] h-4 px-1 font-normal">
                属性过滤
              </Badge>
            </button>

            <AnimatePresence>
              {advancedOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-3 overflow-hidden"
                >
                  {/* 标注框数量 */}
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">
                      标注框数量区间
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={filters.minBoxCount || ''}
                        onChange={(e) => updateFilter('minBoxCount', parseInt(e.target.value) || 0)}
                        placeholder="最小"
                        className="h-6 text-xs"
                      />
                      <span className="text-muted-foreground">~</span>
                      <Input
                        type="number"
                        value={filters.maxBoxCount || ''}
                        onChange={(e) => updateFilter('maxBoxCount', parseInt(e.target.value) || 0)}
                        placeholder="最大"
                        className="h-6 text-xs"
                      />
                    </div>
                  </div>

                  {/* 框面积区间 */}
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">
                      框面积区间 (像素²)
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={filters.minBoxArea || ''}
                        onChange={(e) => updateFilter('minBoxArea', parseInt(e.target.value) || 0)}
                        placeholder="最小"
                        className="h-6 text-xs"
                      />
                      <span className="text-muted-foreground">~</span>
                      <Input
                        type="number"
                        value={filters.maxBoxArea || ''}
                        onChange={(e) => updateFilter('maxBoxArea', parseInt(e.target.value) || 0)}
                        placeholder="最大"
                        className="h-6 text-xs"
                      />
                    </div>
                  </div>

                  {/* 宽高比区间 */}
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">
                      宽高比区间 (w/h)
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        step="0.1"
                        value={filters.minAspectRatio || ''}
                        onChange={(e) => updateFilter('minAspectRatio', parseFloat(e.target.value) || 0)}
                        placeholder="最小"
                        className="h-6 text-xs"
                      />
                      <span className="text-muted-foreground">~</span>
                      <Input
                        type="number"
                        step="0.1"
                        value={filters.maxAspectRatio || ''}
                        onChange={(e) => updateFilter('maxAspectRatio', parseFloat(e.target.value) || 0)}
                        placeholder="最大"
                        className="h-6 text-xs"
                      />
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      如：正方形 1.0，宽扁 2.0，瘦高 0.5
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 统计 */}
          <div className="pt-2 border-t space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">总图片</span>
              <span className="tabular-nums font-medium">{images.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">命中结果</span>
              <span className="tabular-nums font-medium text-primary">{results.length}</span>
            </div>
          </div>

          {/* 导出 */}
          <Button size="sm" className="w-full h-7" onClick={handleExport} disabled={results.length === 0}>
            <Download className="size-3.5 mr-1" />
            导出检索结果
          </Button>
        </CardContent>
      </Card>

      {/* 右侧：结果网格 */}
      <Card className="col-span-9 flex flex-col min-h-0">
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Grid3X3 className="size-4" />
              检索结果
              <Badge variant="outline" className="font-normal">
                {results.length} 张
              </Badge>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 p-4">
          <ScrollArea className="h-full">
            {results.length === 0 ? (
              <div className="h-full min-h-[300px] flex items-center justify-center text-sm text-muted-foreground">
                <div className="text-center">
                  <Search className="size-10 mx-auto mb-2 opacity-30" />
                  <p>未找到匹配结果</p>
                  <p className="text-xs mt-1 opacity-60">尝试调整筛选条件</p>
                </div>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3"
              >
                {results.map((img) => (
                  <motion.div
                    key={img.id}
                    whileHover={{ y: -2 }}
                    transition={{ duration: 0.15 }}
                    className="border rounded-md overflow-hidden bg-card group"
                  >
                    <div className="aspect-video bg-muted/50 relative overflow-hidden">
                      {img.url ? (
                        <Image
                          src={img.url}
                          alt={img.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="size-6 text-muted-foreground/30" />
                        </div>
                      )}
                      <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded tabular-nums">
                        {img.boxes.length} 框
                      </div>
                    </div>
                    <div className="p-2">
                      <div className="text-xs truncate font-medium">{img.name}</div>
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        {[...new Set(img.boxes.map((b) => b.label))].slice(0, 3).map((l) => (
                          <Badge key={l} variant="outline" className="text-[9px] h-3.5 px-1">
                            {l}
                          </Badge>
                        ))}
                        {img.boxes.length > 3 && (
                          <Badge variant="outline" className="text-[9px] h-3.5 px-1">
                            +{img.boxes.length - 3}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
