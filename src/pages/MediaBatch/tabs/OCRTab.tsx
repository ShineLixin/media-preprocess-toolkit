import { useState, useCallback, useRef, useMemo } from 'react';
import {
  Upload,
  FileText,
  Plus,
  Trash2,
  Download,
  Copy,
  Image as ImageIcon,
  Layers,
  List,
  Grid3X3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit-lite';
import Tesseract from 'tesseract.js';
import type { IImageItem, IOcrFieldTemplate, IOcrResult, IOcrTableResult } from '@/types/media';
import type { IBatchOcrResult } from '@/types/annotation-stats';
import { getImageSize, copyToClipboard, downloadJson } from '@/utils/file/fileUtils';
import { Image } from '@/components/ui/image';

export default function OCRTab() {
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [images, setImages] = useState<IImageItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fullText, setFullText] = useState('');
  const [fieldResults, setFieldResults] = useState<IOcrResult[]>([]);
  const [language, setLanguage] = useState('chi_sim+eng');
  const [fieldMode, setFieldMode] = useState(false);

  // 表格识别相关
  const [tableMode, setTableMode] = useState(false);
  const [tableResult, setTableResult] = useState<IOcrTableResult | null>(null);
  const [editingTableCell, setEditingTableCell] = useState<{ row: number; col: number } | null>(null);
  const [editingTableCellValue, setEditingTableCellValue] = useState('');

  // 可视化模板编辑模式
  const [visualTemplateMode, setVisualTemplateMode] = useState(false);
  const [drawingFieldName, setDrawingFieldName] = useState('');

  // 批量识别相关
  const [batchResults, setBatchResults] = useState<IBatchOcrResult[]>([]);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState('');

  // 模板字段
  const [fields, setFields] = useState<IOcrFieldTemplate[]>([
    { id: '1', name: '标题区域', x: 0.1, y: 0.05, width: 0.8, height: 0.1 },
    { id: '2', name: '正文区域', x: 0.1, y: 0.2, width: 0.8, height: 0.6 },
    { id: '3', name: '底部区域', x: 0.1, y: 0.85, width: 0.8, height: 0.1 },
  ]);

  const [newFieldName, setNewFieldName] = useState('');

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
    // 清空批量结果
    setBatchResults([]);
    toast.success(`已添加 ${newItems.length} 张图片`);
  }, [selectedId]);

  /* ── 全图 OCR 识别（单张）── */
  const handleRecognizeAll = useCallback(async () => {
    if (!selectedImage) {
      toast.info('请先选择图片');
      return;
    }
    setIsRecognizing(true);
    setProgress(0);
    setFullText('');
    try {
      const result = await Tesseract.recognize(selectedImage.url, language, {
        logger: (m) => {
          if (m.status === 'recognizing text' && typeof m.progress === 'number') {
            setProgress(Math.round(m.progress * 100));
          }
        },
      });
      setFullText(result.data.text);
      toast.success('识别完成');
    } catch (err) {
      toast.error('识别失败');
      logger.error('OCR 识别失败:', String(err));
    } finally {
      setIsRecognizing(false);
    }
  }, [selectedImage, language]);

  /* ── 按字段模板识别（单张）── */
  const handleRecognizeFields = useCallback(async () => {
    if (!selectedImage) {
      toast.info('请先选择图片');
      return;
    }
    if (fields.length === 0) {
      toast.info('请先添加字段模板');
      return;
    }
    setIsRecognizing(true);
    setProgress(0);
    setFieldResults([]);

    try {
      const results = recognizeFieldsFromImage(selectedImage.url, selectedImage.width, selectedImage.height, fields, language, (p) => setProgress(p));
      const fieldRes = await results;
      setFieldResults(fieldRes);
      toast.success(`识别完成，共 ${fields.length} 个字段`);
    } catch (err) {
      toast.error('识别失败');
      logger.error('OCR 字段识别失败:', String(err));
    } finally {
      setIsRecognizing(false);
    }
  }, [selectedImage, language, fields]);

  /* ── 批量字段识别 ── */
  const handleBatchRecognize = useCallback(async () => {
    if (images.length === 0) {
      toast.info('请先上传图片');
      return;
    }
    if (fields.length === 0) {
      toast.info('请先添加字段模板');
      return;
    }
    setIsRecognizing(true);
    setBatchProgress({ current: 0, total: images.length });
    setBatchResults([]);

    try {
      const allResults: IBatchOcrResult[] = [];
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        setBatchProgress({ current: i, total: images.length });
        try {
          const fieldRes = await recognizeFieldsFromImage(
            img.url,
            img.width,
            img.height,
            fields,
            language,
            () => {}
          );
          allResults.push({
            imageId: img.id,
            imageName: img.name,
            fields: fieldRes,
          });
        } catch (err) {
          logger.warn(`OCR 批量识别失败 ${img.name}:`, String(err));
          allResults.push({
            imageId: img.id,
            imageName: img.name,
            fields: fields.map((f) => ({
              fieldId: f.id,
              fieldName: f.name,
              text: '(识别失败)',
              confidence: 0,
            })),
          });
        }
      }
      setBatchResults(allResults);
      setBatchProgress({ current: images.length, total: images.length });
      toast.success(`批量识别完成，共 ${allResults.length} 张图片`);
    } catch (err) {
      toast.error('批量识别失败');
      logger.error('OCR 批量识别失败:', String(err));
    } finally {
      setIsRecognizing(false);
    }
  }, [images, fields, language]);

  /* ── 字段模板管理 ── */
  const handleAddField = useCallback(() => {
    const name = newFieldName.trim();
    if (!name) return;
    const newField: IOcrFieldTemplate = {
      id: Math.random().toString(36).slice(2, 10),
      name,
      x: 0.1,
      y: 0.5,
      width: 0.8,
      height: 0.1,
    };
    setFields((prev) => [...prev, newField]);
    setNewFieldName('');
  }, [newFieldName]);

  /* ── 可视化框选添加字段（带位置）── */
  const handleAddFieldWithRect = useCallback(
    (x: number, y: number, width: number, height: number) => {
      const name = newFieldName.trim();
      if (!name) {
        toast.info('请先输入字段名称');
        return false;
      }
      const newField: IOcrFieldTemplate = {
        id: Math.random().toString(36).slice(2, 10),
        name,
        x, y, width, height,
      };
      setFields((prev) => [...prev, newField]);
      setNewFieldName('');
      return true;
    },
    [newFieldName]
  );

  const handleDeleteField = useCallback((id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
  }, []);

  /* ── 表格识别 ── */
  const handleRecognizeTable = useCallback(async () => {
    if (!selectedImage) {
      toast.info('请先选择图片');
      return;
    }
    setIsRecognizing(true);
    setProgress(0);
    setTableResult(null);
    try {
      const result = await Tesseract.recognize(selectedImage.url, language, {
        logger: (m) => {
          if (m.status === 'recognizing text' && typeof m.progress === 'number') {
            setProgress(Math.round(m.progress * 100));
          }
        },
      });
      const data = result.data as any;
      const words = (data.words || []) as Array<{
        text: string;
        confidence: number;
        bbox?: { x0: number; y0: number; x1: number; y1: number };
      }>;

      // 基于文字 bbox 的 y 坐标聚类分行
      const rows: typeof words[] = [];
      const used = new Set<number>();
      const lineGap = 15; // 行间距阈值（像素）

      const sortedByY = [...words].sort((a, b) => (a.bbox?.y0 ?? 0) - (b.bbox?.y0 ?? 0));

      for (let i = 0; i < sortedByY.length; i++) {
        if (used.has(words.indexOf(sortedByY[i]))) continue;
        const word = sortedByY[i];
        const y0 = word.bbox?.y0 ?? 0;
        const y1 = word.bbox?.y1 ?? 0;
        const rowH = y1 - y0;
        const threshold = Math.max(lineGap, rowH * 0.6);

        const row: typeof words = [word];
        used.add(words.indexOf(sortedByY[i]));

        // 找同行（y 中心距离小于阈值）
        const centerY = (y0 + y1) / 2;
        for (let j = 0; j < sortedByY.length; j++) {
          if (i === j) continue;
          if (used.has(words.indexOf(sortedByY[j]))) continue;
          const w2 = sortedByY[j];
          const cy2 = ((w2.bbox?.y0 ?? 0) + (w2.bbox?.y1 ?? 0)) / 2;
          if (Math.abs(cy2 - centerY) <= threshold) {
            row.push(w2);
            used.add(words.indexOf(sortedByY[j]));
          }
        }
        // 按 x 排序
        row.sort((a, b) => (a.bbox?.x0 ?? 0) - (b.bbox?.x0 ?? 0));
        rows.push(row);
      }

      // 按列分割：找每一行的列分隔 x 坐标
      // 简化：统计所有 word 之间的大间距作为列分隔
      if (rows.length > 0) {
        // 计算每一行的单元格（按水平间距大的地方分列）
        const tableData: string[][] = [];
        let maxCols = 1;

        for (const row of rows) {
          const cells: string[] = [];
          let currentText = row[0]?.text || '';
          for (let k = 1; k < row.length; k++) {
            const prev = row[k - 1];
            const curr = row[k];
            const gap = (curr.bbox?.x0 ?? 0) - (prev.bbox?.x1 ?? 0);
            const avgCharW = (prev.bbox ? (prev.bbox.x1 - prev.bbox.x0) / Math.max(1, prev.text.length) : 10);
            // 间距大于 2 个字符宽度认为是列分隔
            if (gap > avgCharW * 2.5) {
              cells.push(currentText.trim());
              currentText = curr.text;
            } else {
              currentText += ' ' + curr.text;
            }
          }
          cells.push(currentText.trim());
          tableData.push(cells);
          if (cells.length > maxCols) maxCols = cells.length;
        }

        // 补齐列数
        const normalized = tableData.map((row) => {
          while (row.length < maxCols) row.push('');
          return row;
        });

        setTableResult({
          rows: normalized.length,
          cols: maxCols,
          data: normalized,
          cells: [],
          headers: normalized[0] ?? [],
        });
        toast.success(`表格识别完成：${normalized.length} 行 × ${maxCols} 列`);
      } else {
        setTableResult({ rows: 0, cols: 0, data: [], cells: [], headers: [] });
        toast.info('未识别到表格结构');
      }
    } catch (err) {
      toast.error('表格识别失败');
      logger.error('表格识别失败:', String(err));
    } finally {
      setIsRecognizing(false);
    }
  }, [selectedImage, language]);

  /* ── 表格单元格编辑 ── */
  const handleTableCellEdit = useCallback(
    (rowIdx: number, colIdx: number, value: string) => {
      setTableResult((prev) => {
        if (!prev) return prev;
        const newData = prev.data.map((row, ri) =>
          ri === rowIdx ? row.map((cell, ci) => (ci === colIdx ? value : cell)) : row
        );
        return { ...prev, data: newData };
      });
    },
    []
  );

  /* ── 表格导出 CSV ── */
  const handleExportTableCsv = useCallback(() => {
    if (!tableResult || tableResult.rows === 0) {
      toast.info('暂无表格数据');
      return;
    }
    const csv = tableResult.data
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      )
      .join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ocr_table_result.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('已导出 CSV');
  }, [tableResult]);

  /* ── 表格导出 JSON ── */
  const handleExportTableJson = useCallback(() => {
    if (!tableResult || tableResult.rows === 0) {
      toast.info('暂无表格数据');
      return;
    }
    const data = {
      image: selectedImage?.name,
      rows: tableResult.rows,
      cols: tableResult.cols,
      data: tableResult.data,
      headers: tableResult.headers,
    };
    downloadJson(data, 'ocr_table_result.json');
    toast.success('已导出 JSON');
  }, [tableResult, selectedImage]);

  /* ── 可视化模板：在图片上框选添加字段 ── */
  const [templateDrawStart, setTemplateDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [templateDrawCurrent, setTemplateDrawCurrent] = useState<{ x: number; y: number } | null>(null);

  /* ── 复制结果 ── */
  const handleCopyAll = useCallback(async () => {
    const text = fieldMode
      ? fieldResults.map((r) => `${r.fieldName}: ${r.text}`).join('\n')
      : fullText;
    if (!text) {
      toast.info('暂无识别结果');
      return;
    }
    try {
      await copyToClipboard(text);
      toast.success('已复制到剪贴板');
    } catch (err) {
      toast.error('复制失败');
    }
  }, [fieldMode, fieldResults, fullText]);

  /* ── 导出 JSON（单图）── */
  const handleExportJson = useCallback(() => {
    if (fieldMode && fieldResults.length === 0) {
      toast.info('暂无识别结果');
      return;
    }
    if (!fieldMode && !fullText) {
      toast.info('暂无识别结果');
      return;
    }
    const data = fieldMode
      ? { fields: fieldResults, image: selectedImage?.name }
      : { fullText, image: selectedImage?.name };
    downloadJson(data, 'ocr_result.json');
  }, [fieldMode, fieldResults, fullText, selectedImage]);

  /* ── 批量导出 CSV ── */
  const handleExportCsv = useCallback(() => {
    if (batchResults.length === 0) {
      toast.info('暂无批量识别结果');
      return;
    }
    const headers = ['图片名', ...fields.map((f) => f.name)];
    const rows = batchResults.map((r) => {
      const row = [r.imageName];
      fields.forEach((f) => {
        const field = r.fields.find((x) => x.fieldId === f.id);
        row.push(field?.text ?? '');
      });
      return row;
    });
    const csv = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      )
      .join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ocr_batch_result.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('已导出 CSV');
  }, [batchResults, fields]);

  /* ── 批量导出 JSON ── */
  const handleExportBatchJson = useCallback(() => {
    if (batchResults.length === 0) {
      toast.info('暂无批量识别结果');
      return;
    }
    const data = {
      fields: fields.map((f) => ({ id: f.id, name: f.name })),
      results: batchResults,
    };
    downloadJson(data, 'ocr_batch_result.json');
    toast.success('已导出 JSON');
  }, [batchResults, fields]);

  /* ── 表格单元格编辑 ── */
  const handleCellEdit = useCallback(
    (rowIdx: number, colIdx: number, value: string) => {
      setBatchResults((prev) => {
        const next = [...prev];
        const row = { ...next[rowIdx] };
        const newFields = [...row.fields];
        if (colIdx >= 0 && colIdx < newFields.length) {
          newFields[colIdx] = { ...newFields[colIdx], text: value };
        }
        row.fields = newFields;
        next[rowIdx] = row;
        return next;
      });
    },
    []
  );

  return (
    <div className="space-y-4 h-[calc(100vh-220px)] min-h-[500px] flex flex-col">
      {/* 顶部模式切换 + 操作栏 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Tabs value={mode} onValueChange={(v) => setMode(v as 'single' | 'batch')} className="w-auto">
          <TabsList>
            <TabsTrigger value="single" className="gap-1.5">
              <FileText className="size-3.5" />
              单图识别
            </TabsTrigger>
            <TabsTrigger value="batch" className="gap-1.5">
              <Layers className="size-3.5" />
              批量识别
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isRecognizing}
          >
            <Upload className="size-3.5 mr-1.5" />
            上传图片
          </Button>
          <Badge variant="outline">{images.length} 张</Badge>
        </div>
      </div>

      {/* 内容区：单图模式（与批量模式互斥，二选一渲染） */}
      {mode === 'single' && (
      <SingleModeView
        images={images}
        selectedId={selectedId}
        onSelect={(id) => {
          setSelectedId(id);
          setFullText('');
          setFieldResults([]);
          setTableResult(null);
        }}
        fields={fields}
        fieldMode={fieldMode}
        onFieldModeChange={setFieldMode}
        tableMode={tableMode}
        onTableModeChange={setTableMode}
        tableResult={tableResult}
        language={language}
        onLanguageChange={setLanguage}
        isRecognizing={isRecognizing}
        progress={progress}
        fullText={fullText}
        fieldResults={fieldResults}
        onRecognizeAll={handleRecognizeAll}
        onRecognizeFields={handleRecognizeFields}
        onRecognizeTable={handleRecognizeTable}
        onAddField={handleAddField}
        onAddFieldWithRect={handleAddFieldWithRect}
        onDeleteField={handleDeleteField}
        newFieldName={newFieldName}
        onNewFieldNameChange={setNewFieldName}
        onCopyAll={handleCopyAll}
        onExportJson={handleExportJson}
        onExportTableCsv={handleExportTableCsv}
        onExportTableJson={handleExportTableJson}
        onTableCellEdit={handleTableCellEdit}
        editingTableCell={editingTableCell}
        setEditingTableCell={setEditingTableCell}
        editingTableCellValue={editingTableCellValue}
        setEditingTableCellValue={setEditingTableCellValue}
      />
      )}

      {/* 内容区：批量模式（与单图模式互斥，二选一渲染） */}
      {mode === 'batch' && (
      <BatchModeView
        images={images}
        fields={fields}
        language={language}
        onLanguageChange={setLanguage}
        fieldMode={fieldMode}
        onFieldModeChange={setFieldMode}
        isRecognizing={isRecognizing}
        batchProgress={batchProgress}
        batchResults={batchResults}
        onBatchRecognize={handleBatchRecognize}
        onAddField={handleAddField}
        onDeleteField={handleDeleteField}
        newFieldName={newFieldName}
        onNewFieldNameChange={setNewFieldName}
        onExportCsv={handleExportCsv}
        onExportJson={handleExportBatchJson}
        editingCell={editingCell}
        setEditingCell={setEditingCell}
        editValue={editValue}
        setEditValue={setEditValue}
        onCellEdit={handleCellEdit}
      />
      )}
    </div>
  );
}

/* ── 从单张图片按字段识别（共用工具函数）── */
async function recognizeFieldsFromImage(
  url: string,
  imgW: number,
  imgH: number,
  fields: IOcrFieldTemplate[],
  language: string,
  onProgress?: (p: number) => void
): Promise<IOcrResult[]> {
  const result = await Tesseract.recognize(url, language, {
    logger: (m) => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number' && onProgress) {
        onProgress(Math.round(m.progress * 50));
      }
    },
  });

  const data = result.data as any;
  const words = (data.words || []) as Array<{
    text: string;
    confidence: number;
    bbox?: { x0: number; y0: number; x1: number; y1: number };
  }>;

  const results: IOcrResult[] = [];
  fields.forEach((field) => {
    const fieldX = field.x * imgW;
    const fieldY = field.y * imgH;
    const fieldW = field.width * imgW;
    const fieldH = field.height * imgH;

    const matchingWords = words.filter((w) => {
      const bbox = w.bbox as { x0: number; y0: number; x1: number; y1: number } | undefined;
      if (!bbox) return false;
      const cx = (bbox.x0 + bbox.x1) / 2;
      const cy = (bbox.y0 + bbox.y1) / 2;
      return cx >= fieldX && cx <= fieldX + fieldW && cy >= fieldY && cy <= fieldY + fieldH;
    });

    const text = matchingWords.map((w) => w.text).join(' ').trim();
    const confidence =
      matchingWords.length > 0
        ? matchingWords.reduce((s, w) => s + (w.confidence || 0), 0) / matchingWords.length
        : 0;

    results.push({
      fieldId: field.id,
      fieldName: field.name,
      text,
      confidence,
    });
  });

  return results;
}

/* ── 单图模式视图组件 ── */
interface SingleModeProps {
  images: IImageItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  fields: IOcrFieldTemplate[];
  fieldMode: boolean;
  onFieldModeChange: (v: boolean) => void;
  tableMode: boolean;
  onTableModeChange: (v: boolean) => void;
  tableResult: IOcrTableResult | null;
  language: string;
  onLanguageChange: (v: string) => void;
  isRecognizing: boolean;
  progress: number;
  fullText: string;
  fieldResults: IOcrResult[];
  onRecognizeAll: () => void;
  onRecognizeFields: () => void;
  onRecognizeTable: () => void;
  onAddField: () => void;
  onAddFieldWithRect: (x: number, y: number, w: number, h: number) => boolean;
  onDeleteField: (id: string) => void;
  newFieldName: string;
  onNewFieldNameChange: (v: string) => void;
  onCopyAll: () => void;
  onExportJson: () => void;
  onExportTableCsv: () => void;
  onExportTableJson: () => void;
  onTableCellEdit: (row: number, col: number, value: string) => void;
  editingTableCell: { row: number; col: number } | null;
  setEditingTableCell: (v: { row: number; col: number } | null) => void;
  editingTableCellValue: string;
  setEditingTableCellValue: (v: string) => void;
}

function SingleModeView(props: SingleModeProps) {
  const {
    images,
    selectedId,
    onSelect,
    fields,
    fieldMode,
    onFieldModeChange,
    tableMode,
    onTableModeChange,
    tableResult,
    language,
    onLanguageChange,
    isRecognizing,
    progress,
    fullText,
    fieldResults,
    onRecognizeAll,
    onRecognizeFields,
    onRecognizeTable,
    onAddField,
    onAddFieldWithRect,
    onDeleteField,
    newFieldName,
    onNewFieldNameChange,
    onCopyAll,
    onExportJson,
    onExportTableCsv,
    onExportTableJson,
    onTableCellEdit,
    editingTableCell,
    setEditingTableCell,
    editingTableCellValue,
    setEditingTableCellValue,
  } = props;

  const selectedImage = images.find((i) => i.id === selectedId) ?? null;

  // 可视化框选状态
  const [isDrawingField, setIsDrawingField] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const imgContainerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawingField || !imgContainerRef.current || !selectedImage) return;
    const rect = imgContainerRef.current.getBoundingClientRect();
    const imgEl = imgContainerRef.current.querySelector('img');
    if (!imgEl) return;
    const imgRect = imgEl.getBoundingClientRect();
    const x = (e.clientX - imgRect.left) / imgRect.width;
    const y = (e.clientY - imgRect.top) / imgRect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    setDrawStart({ x, y });
    setDrawCurrent({ x, y });
  }, [isDrawingField, selectedImage]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!drawStart || !imgContainerRef.current) return;
    const imgEl = imgContainerRef.current.querySelector('img');
    if (!imgEl) return;
    const imgRect = imgEl.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - imgRect.left) / imgRect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - imgRect.top) / imgRect.height));
    setDrawCurrent({ x, y });
  }, [drawStart]);

  const handleMouseUp = useCallback(() => {
    if (!drawStart || !drawCurrent || !newFieldName.trim()) {
      setDrawStart(null);
      setDrawCurrent(null);
      if (isDrawingField && !newFieldName.trim()) {
        toast.info('请先输入字段名称');
      }
      return;
    }
    const x = Math.min(drawStart.x, drawCurrent.x);
    const y = Math.min(drawStart.y, drawCurrent.y);
    const w = Math.abs(drawCurrent.x - drawStart.x);
    const h = Math.abs(drawCurrent.y - drawStart.y);
    if (w < 0.02 || h < 0.02) {
      // 太小忽略
      setDrawStart(null);
      setDrawCurrent(null);
      return;
    }
    const success = onAddFieldWithRect(x, y, w, h);
    if (success) {
      toast.success(`已添加字段：${newFieldName || '未命名'}`);
    }
    setDrawStart(null);
    setDrawCurrent(null);
    setIsDrawingField(false);
  }, [drawStart, drawCurrent, newFieldName, isDrawingField, onAddFieldWithRect]);

  const drawRect = drawStart && drawCurrent ? {
    x: Math.min(drawStart.x, drawCurrent.x) * 100,
    y: Math.min(drawStart.y, drawCurrent.y) * 100,
    w: Math.abs(drawCurrent.x - drawStart.x) * 100,
    h: Math.abs(drawCurrent.y - drawStart.y) * 100,
  } : null;

  // 可视化框选后更新最后添加的字段位置（通过修改 fields 回调实现）
  // 由于字段管理在父组件，这里简化：框选后直接通过 onAddField 加，
  // 然后用户可以在右侧列表看到新加字段，位置默认。
  // 完善版本应传 onAddFieldWithRect，但为了最小改动，我们在框选完成时直接更新字段。

  return (
    <div className="grid grid-cols-12 gap-4 flex-1 min-h-0">
      {/* 左侧：文件列表 */}
      <div className="col-span-2 flex flex-col gap-3 min-h-0">
        <div className="text-xs text-muted-foreground">{images.length} 张图片</div>
        <ScrollArea className="flex-1 border rounded-md">
          {images.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">暂无图片</div>
          ) : (
            <div className="p-1 space-y-0.5">
              {images.map((img) => (
                <button
                  key={img.id}
                  onClick={() => onSelect(img.id)}
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

      {/* 中间：图片预览 + 字段覆盖 */}
      <div className="col-span-6 flex flex-col gap-3 min-h-0">
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
          <div className="flex items-center gap-3">
             <div className="flex items-center gap-2">
               <Label htmlFor="field-mode-single" className="text-xs cursor-pointer">
                 字段模板
               </Label>
               <Switch
                 id="field-mode-single"
                 checked={fieldMode}
                 onCheckedChange={(v) => {
                   onFieldModeChange(v);
                   if (v) onTableModeChange(false);
                 }}
               />
             </div>
             <div className="flex items-center gap-2">
               <Label htmlFor="table-mode-single" className="text-xs cursor-pointer">
                 表格识别
               </Label>
               <Switch
                 id="table-mode-single"
                 checked={tableMode}
                 onCheckedChange={(v) => {
                   onTableModeChange(v);
                   if (v) onFieldModeChange(false);
                 }}
               />
             </div>
           </div>
        </div>

        <div
          ref={imgContainerRef}
          className={`flex-1 border rounded-md bg-muted/20 overflow-hidden relative flex items-center justify-center p-4 ${
            isDrawingField ? 'cursor-crosshair' : ''
          }`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {selectedImage ? (
            <div className="relative inline-block max-w-full max-h-full select-none">
              <Image
                src={selectedImage.url}
                alt="待识别"
                className="max-w-full max-h-[calc(100vh-320px)] object-contain block pointer-events-none"
                draggable={false}
              />
              {fieldMode && (
                <div className="absolute inset-0 pointer-events-none">
                  {fields.map((field) => (
                    <div
                      key={field.id}
                      className="absolute border-2 border-primary/70 bg-primary/10"
                      style={{
                        left: `${field.x * 100}%`,
                        top: `${field.y * 100}%`,
                        width: `${field.width * 100}%`,
                        height: `${field.height * 100}%`,
                      }}
                    >
                      <span className="bg-primary/80 text-white px-1 rounded text-[10px]">
                        {field.name}
                      </span>
                    </div>
                  ))}
                  {/* 绘制中的矩形 */}
                  {drawRect && (
                    <div
                      className="absolute border-2 border-dashed border-destructive bg-destructive/10"
                      style={{
                        left: `${drawRect.x}%`,
                        top: `${drawRect.y}%`,
                        width: `${drawRect.w}%`,
                        height: `${drawRect.h}%`,
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-muted-foreground">
              <ImageIcon className="size-12 opacity-30 mb-2" />
              <p className="text-sm">上传图片开始 OCR 识别</p>
            </div>
          )}
        </div>

        {isRecognizing && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>识别中...</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 右侧：设置 + 结果 */}
      <div className="col-span-4 flex flex-col gap-3 min-h-0">
        <Card>
          <CardContent className="p-3 space-y-3">
            <div className="text-sm font-medium">识别设置</div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">语言</label>
              <Select value={language} onValueChange={onLanguageChange}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="chi_sim+eng">中文简体 + 英文</SelectItem>
                  <SelectItem value="chi_tra+eng">中文繁体 + 英文</SelectItem>
                  <SelectItem value="eng">仅英文</SelectItem>
                  <SelectItem value="jpn+eng">日文 + 英文</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              首次使用会下载语言包（约 10-30MB），请耐心等待
            </p>
            <Button
              className="w-full"
              size="sm"
              onClick={tableMode ? onRecognizeTable : (fieldMode ? onRecognizeFields : onRecognizeAll)}
              disabled={!selectedImage || isRecognizing}
            >
              <FileText className="size-3.5 mr-1" />
              {isRecognizing ? '识别中...' : tableMode ? '表格识别' : fieldMode ? '按字段识别' : '全图识别'}
            </Button>
          </CardContent>
        </Card>

        {fieldMode && (
          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="text-sm font-medium flex items-center justify-between">
                <span>字段模板 ({fields.length})</span>
                <Button
                  size="sm"
                  variant={isDrawingField ? 'default' : 'secondary'}
                  className="h-6 px-2 text-xs"
                  onClick={() => setIsDrawingField(!isDrawingField)}
                  disabled={!selectedImage}
                >
                  {isDrawingField ? '取消框选' : '框选添加'}
                </Button>
              </div>
              <div className="flex gap-1">
                <Input
                  value={newFieldName}
                  onChange={(e) => onNewFieldNameChange(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), onAddField())}
                  placeholder={isDrawingField ? '输入字段名，然后在图上拖拽' : '字段名'}
                  className="h-8 text-sm flex-1"
                />
                <Button size="sm" variant="secondary" className="h-8 px-2" onClick={onAddField}>
                  <Plus className="size-3.5" />
                </Button>
              </div>
              {isDrawingField && (
                <p className="text-xs text-primary">
                  💡 在左侧图片上拖拽鼠标绘制字段区域
                </p>
              )}
              <ScrollArea className="max-h-32">
                <div className="space-y-1">
                  {fields.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center gap-1 text-xs p-1.5 rounded hover:bg-muted/60"
                    >
                      <span className="flex-1 truncate">{f.name}</span>
                      <span className="text-muted-foreground shrink-0">
                        {Math.round(f.width * 100)}×{Math.round(f.height * 100)}%
                      </span>
                      <button
                        className="text-destructive hover:opacity-70 shrink-0"
                        onClick={() => onDeleteField(f.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <p className="text-xs text-muted-foreground">
                可在左侧预览图上查看字段区域位置
              </p>
            </CardContent>
          </Card>
        )}

        <Card className="flex-1 min-h-0 flex flex-col">
          <CardContent className="p-3 space-y-2 flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">识别结果</div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  onClick={onCopyAll}
                  disabled={fieldMode ? fieldResults.length === 0 : !fullText}
                >
                  <Copy className="size-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  onClick={onExportJson}
                  disabled={fieldMode ? fieldResults.length === 0 : !fullText}
                >
                  <Download className="size-3.5" />
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1 border rounded-md p-2">
              {tableMode ? (
                !tableResult || tableResult.rows === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    点击"表格识别"开始
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{tableResult.rows} 行 × {tableResult.cols} 列</span>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs"
                          onClick={onExportTableCsv}
                        >
                          CSV
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs"
                          onClick={onExportTableJson}
                        >
                          JSON
                        </Button>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <Table className="text-xs">
                        <TableHeader>
                          <TableRow>
                            {tableResult.data[0]?.map((cell, ci) => (
                              <TableHead key={ci} className="whitespace-nowrap py-1.5 px-2">
                                列 {ci + 1}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tableResult.data.map((row, ri) => (
                            <TableRow key={ri}>
                              {row.map((cell, ci) => (
                                <TableCell key={ci} className="py-1.5 px-2">
                                  {editingTableCell?.row === ri && editingTableCell?.col === ci ? (
                                    <Input
                                      value={editingTableCellValue}
                                      onChange={(e) => setEditingTableCellValue(e.target.value)}
                                      onBlur={() => {
                                        onTableCellEdit(ri, ci, editingTableCellValue);
                                        setEditingTableCell(null);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          onTableCellEdit(ri, ci, editingTableCellValue);
                                          setEditingTableCell(null);
                                        }
                                        if (e.key === 'Escape') {
                                          setEditingTableCell(null);
                                        }
                                      }}
                                      className="h-6 text-xs px-1"
                                      autoFocus
                                    />
                                  ) : (
                                    <span
                                      className="cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 block"
                                      onClick={() => {
                                        setEditingTableCell({ row: ri, col: ci });
                                        setEditingTableCellValue(cell);
                                      }}
                                    >
                                      {cell || <span className="text-muted-foreground opacity-50">(空)</span>}
                                    </span>
                                  )}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      点击单元格可编辑 · 自动基于文本位置识别行列结构
                    </p>
                  </div>
                )
              ) : fieldMode ? (
                fieldResults.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    暂无识别结果
                  </div>
                ) : (
                  <div className="space-y-2">
                    {fieldResults.map((r) => (
                      <div key={r.fieldId} className="space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">{r.fieldName}</span>
                          <span className="text-[10px] text-muted-foreground">
                            置信度 {r.confidence.toFixed(1)}%
                          </span>
                        </div>
                        <div className="text-sm bg-muted/30 rounded px-2 py-1.5 whitespace-pre-wrap break-all">
                          {r.text || '(未识别到内容)'}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : fullText ? (
                <div className="text-sm whitespace-pre-wrap break-all leading-relaxed">
                  {fullText}
                </div>
              ) : (
                <div className="text-center text-sm text-muted-foreground py-8">
                  点击"全图识别"开始
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ── 批量模式视图组件 ── */
interface BatchModeProps {
  images: IImageItem[];
  fields: IOcrFieldTemplate[];
  language: string;
  onLanguageChange: (v: string) => void;
  fieldMode: boolean;
  onFieldModeChange: (v: boolean) => void;
  isRecognizing: boolean;
  batchProgress: { current: number; total: number };
  batchResults: IBatchOcrResult[];
  onBatchRecognize: () => void;
  onAddField: () => void;
  onDeleteField: (id: string) => void;
  newFieldName: string;
  onNewFieldNameChange: (v: string) => void;
  onExportCsv: () => void;
  onExportJson: () => void;
  editingCell: { row: number; col: number } | null;
  setEditingCell: (v: { row: number; col: number } | null) => void;
  editValue: string;
  setEditValue: (v: string) => void;
  onCellEdit: (row: number, col: number, value: string) => void;
}

function BatchModeView(props: BatchModeProps) {
  const {
    images,
    fields,
    language,
    onLanguageChange,
    isRecognizing,
    batchProgress,
    batchResults,
    onBatchRecognize,
    onAddField,
    onDeleteField,
    newFieldName,
    onNewFieldNameChange,
    onExportCsv,
    onExportJson,
    editingCell,
    setEditingCell,
    editValue,
    setEditValue,
    onCellEdit,
  } = props;

  const progressPct = batchProgress.total > 0
    ? Math.round((batchProgress.current / batchProgress.total) * 100)
    : 0;

  return (
    <div className="grid grid-cols-12 gap-4 flex-1 min-h-0">
      {/* 左侧：字段模板配置 */}
      <div className="col-span-3 flex flex-col gap-3 min-h-0">
        <Card>
          <CardContent className="p-3 space-y-3">
            <div className="text-sm font-medium">批量识别设置</div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">语言</label>
              <Select value={language} onValueChange={onLanguageChange}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="chi_sim+eng">中文简体 + 英文</SelectItem>
                  <SelectItem value="chi_tra+eng">中文繁体 + 英文</SelectItem>
                  <SelectItem value="eng">仅英文</SelectItem>
                  <SelectItem value="jpn+eng">日文 + 英文</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              size="sm"
              onClick={onBatchRecognize}
              disabled={images.length === 0 || fields.length === 0 || isRecognizing}
            >
              <Layers className="size-3.5 mr-1" />
              {isRecognizing
                ? `识别中 ${batchProgress.current}/${batchProgress.total}`
                : `批量识别 ${images.length} 张`}
            </Button>
            {isRecognizing && (
              <div className="space-y-1">
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="text-[10px] text-muted-foreground text-right">
                  {progressPct}%
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex-1 min-h-0 flex flex-col">
          <CardContent className="p-3 space-y-2 flex-1 min-h-0 flex flex-col">
            <div className="text-sm font-medium">字段模板 ({fields.length})</div>
            <div className="flex gap-1">
              <Input
                value={newFieldName}
                onChange={(e) => onNewFieldNameChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), onAddField())}
                placeholder="字段名"
                className="h-8 text-sm flex-1"
              />
              <Button size="sm" variant="secondary" className="h-8 px-2" onClick={onAddField}>
                <Plus className="size-3.5" />
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="space-y-1">
                {fields.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center gap-1 text-xs p-1.5 rounded hover:bg-muted/60"
                  >
                    <span className="flex-1 truncate">{f.name}</span>
                    <button
                      className="text-destructive hover:opacity-70 shrink-0"
                      onClick={() => onDeleteField(f.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <p className="text-[10px] text-muted-foreground">
              所有图片共用同一套字段模板
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 右侧：结果表格 */}
      <div className="col-span-9 flex flex-col gap-3 min-h-0">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">
            批量识别结果
            {batchResults.length > 0 && (
              <Badge variant="outline" className="ml-2">
                {batchResults.length} 张
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={onExportCsv}
              disabled={batchResults.length === 0}
            >
              <Download className="size-3.5 mr-1.5" />
              导出 CSV
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={onExportJson}
              disabled={batchResults.length === 0}
            >
              <Download className="size-3.5 mr-1.5" />
              导出 JSON
            </Button>
          </div>
        </div>

        <Card className="flex-1 min-h-0 flex flex-col">
          <CardContent className="p-0 flex-1 min-h-0 overflow-auto">
            {batchResults.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
                <Grid3X3 className="size-12 opacity-30 mb-3" />
                <p className="text-sm mb-1">暂无批量识别结果</p>
                <p className="text-xs text-muted-foreground">
                  上传图片并配置字段模板后，点击"批量识别"开始
                </p>
              </div>
            ) : (
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap sticky left-0 bg-card z-10">
                        图片名
                      </TableHead>
                      {fields.map((f) => (
                        <TableHead key={f.id} className="whitespace-nowrap">
                          {f.name}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batchResults.map((row, rowIdx) => (
                      <TableRow key={row.imageId}>
                        <TableCell className="font-medium sticky left-0 bg-card z-10 max-w-[200px]">
                          <span className="block truncate">{row.imageName}</span>
                        </TableCell>
                        {fields.map((f, colIdx) => {
                          const field = row.fields.find((x) => x.fieldId === f.id);
                          const isEditing =
                            editingCell?.row === rowIdx && editingCell?.col === colIdx;
                          return (
                            <TableCell key={f.id} className="min-w-[150px]">
                              {isEditing ? (
                                <Input
                                  autoFocus
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={() => {
                                    onCellEdit(rowIdx, colIdx, editValue);
                                    setEditingCell(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      onCellEdit(rowIdx, colIdx, editValue);
                                      setEditingCell(null);
                                    }
                                    if (e.key === 'Escape') {
                                      setEditingCell(null);
                                    }
                                  }}
                                  className="h-7 text-sm"
                                />
                              ) : (
                                <div
                                  className="cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 text-sm min-h-[28px] truncate"
                                  onClick={() => {
                                    setEditingCell({ row: rowIdx, col: colIdx });
                                    setEditValue(field?.text ?? '');
                                  }}
                                  title={field?.text || '点击编辑'}
                                >
                                  {field?.text || (
                                    <span className="text-muted-foreground text-xs">
                                      (空)
                                    </span>
                                  )}
                                </div>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-[10px] text-muted-foreground">
          提示：点击表格单元格可手动修正识别结果；修改后直接导出即包含修正内容
        </p>
      </div>
    </div>
  );
}
