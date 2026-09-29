import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Upload,
  Play,
  Pause,
  Scissors,
  Volume2,
  AudioWaveform,
  FileAudio,
  Download,
  Settings2,
  Grid3X3,
  Music,
  Trash2,
  SkipBack,
  SkipForward,
  Zap,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import {
  decodeAudioFile,
  computePeakDb,
  computeRmsDb,
  processAudio,
  getSupportedAudioFormats,
  audioBufferToWav,
} from '@/utils/audio/audioProcessor';
import { generateWaveformPeaks, drawWaveform, getRatioFromClick } from '@/utils/audio/waveform';
import type {
  IAudioItem,
  IAudioProcessChain,
  NormalizeMode,
  AudioOutputFormat,
} from '@/types/media';
import { downloadBlob as downloadFile } from '@/utils/file/fileUtils';
import JSZip from 'jszip';
import { logger } from '@lark-apaas/client-toolkit-lite';

const defaultProcessChain: IAudioProcessChain = {
  trim: { enabled: false, startTime: 0, endTime: 0 },
  normalize: { enabled: false, mode: 'peak', targetDb: -1 },
  noiseReduction: {
    enabled: false,
    highPassFreq: 80,
    lowPassFreq: 8000,
    noiseGateThreshold: -50,
  },
  format: { enabled: false, format: 'wav', quality: 0.8 },
};

export default function AudioToolsPage() {
  const [activeTab, setActiveTab] = useState('single');
  const [audioItems, setAudioItems] = useState<IAudioItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState(0);
  const [processedResult, setProcessedResult] = useState<{
    blob: Blob;
    url: string;
    peakDbBefore: number;
    peakDbAfter: number;
    rmsDbBefore: number;
    rmsDbAfter: number;
  } | null>(null);

  const [processChain, setProcessChain] = useState<IAudioProcessChain>(defaultProcessChain);

  // 播放相关
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  // 波形相关
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<ReturnType<typeof generateWaveformPeaks> | null>(null);
  const [waveformWidth, setWaveformWidth] = useState(800);
  const [zoom, setZoom] = useState(1); // 时间缩放倍数
  const waveformContainerRef = useRef<HTMLDivElement>(null);

  // 选区
  const [selection, setSelection] = useState<[number, number] | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectStart, setSelectStart] = useState<number | null>(null);

  const selectedItem = audioItems.find((i) => i.id === selectedId) ?? null;

  // 初始化 AudioContext
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  // 上传音频文件
  const handleUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const newItems: IAudioItem[] = [];
      const ctx = getAudioContext();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('audio/') && !/\.(wav|mp3|m4a|ogg|flac|aac)$/i.test(file.name)) {
          continue;
        }
        const url = URL.createObjectURL(file);
        const ext = file.name.split('.').pop()?.toLowerCase() || 'wav';

        try {
          const buffer = await decodeAudioFile(file, ctx);
          newItems.push({
            id: Math.random().toString(36).slice(2, 10),
            file,
            name: file.name,
            url,
            duration: buffer.duration,
            sampleRate: buffer.sampleRate,
            channels: buffer.numberOfChannels,
            format: ext,
            audioBuffer: buffer,
          });
        } catch {
          // 解码失败的仍然加入，但 audioBuffer 为 null
          newItems.push({
            id: Math.random().toString(36).slice(2, 10),
            file,
            name: file.name,
            url,
            duration: 0,
            sampleRate: 0,
            channels: 0,
            format: ext,
            audioBuffer: null,
          });
        }
      }

      setAudioItems((prev) => [...prev, ...newItems]);
      if (newItems.length > 0 && !selectedId) {
        setSelectedId(newItems[0].id);
        setDuration(newItems[0].duration);
        // 设置裁剪默认结束时间
        if (newItems[0].duration > 0) {
          setProcessChain((prev) => ({
            ...prev,
            trim: { ...prev.trim, endTime: newItems[0].duration },
          }));
        }
      }
      toast.success(`已加载 ${newItems.length} 个音频文件`);
    },
    [getAudioContext, selectedId]
  );

  // 选中音频时生成波形
  useEffect(() => {
    if (!selectedItem || !selectedItem.audioBuffer || !waveformContainerRef.current) return;

    const containerWidth = waveformContainerRef.current.clientWidth || 800;
    const targetWidth = Math.max(containerWidth * zoom, containerWidth);
    setWaveformWidth(targetWidth);

    const newPeaks = generateWaveformPeaks(selectedItem.audioBuffer, Math.floor(targetWidth));
    setPeaks(newPeaks);
    setDuration(selectedItem.duration);

    // 重置选区
    setSelection(null);
    setProcessedResult(null);
    setCurrentTime(0);
  }, [selectedItem, zoom]);

  // 绘制波形
  useEffect(() => {
    if (!waveformCanvasRef.current || !peaks || !waveformContainerRef.current) return;
    const w = waveformContainerRef.current.clientWidth;
    drawWaveform(waveformCanvasRef.current, peaks, {
      width: waveformWidth,
      height: 120,
      waveColor: 'hsl(215 12% 65%)',
      progressColor: 'hsl(28 90% 50%)',
      cursorColor: 'hsl(28 90% 50%)',
      selectionColor: 'hsla(28, 90%, 50%, 0.15)',
      showCursor: true,
      cursorPos: duration > 0 ? currentTime / duration : 0,
      selection,
    });
  }, [peaks, waveformWidth, currentTime, duration, selection]);

  // 播放控制
  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const seekTo = useCallback(
    (ratio: number) => {
      const audio = audioRef.current;
      if (!audio || duration <= 0) return;
      audio.currentTime = ratio * duration;
      setCurrentTime(ratio * duration);
    },
    [duration]
  );

  // 波形点击定位
  const handleWaveformClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!waveformCanvasRef.current) return;
      const ratio = getRatioFromClick(e, waveformCanvasRef.current);
      seekTo(ratio);
    },
    [seekTo]
  );

  // 波形拖拽选区（Shift + 拖拽 = 选区；普通点击 = 定位）
  const handleWaveformMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!waveformCanvasRef.current) return;
      if (e.shiftKey) {
        // Shift + 点击开始选区
        const ratio = getRatioFromClick(e, waveformCanvasRef.current);
        setIsSelecting(true);
        setSelectStart(ratio);
        setSelection([ratio, ratio]);
      } else {
        handleWaveformClick(e);
      }
    },
    [handleWaveformClick]
  );

  const handleWaveformMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isSelecting || !waveformCanvasRef.current || selectStart === null) return;
      const ratio = getRatioFromClick(e, waveformCanvasRef.current);
      const start = Math.min(selectStart, ratio);
      const end = Math.max(selectStart, ratio);
      setSelection([start, end]);
    },
    [isSelecting, selectStart]
  );

  const handleWaveformMouseUp = useCallback(() => {
    if (isSelecting && selection) {
      // 更新裁剪配置为选区时间
      if (selection[1] - selection[0] > 0.001) {
        setProcessChain((prev) => ({
          ...prev,
          trim: {
            ...prev.trim,
            enabled: true,
            startTime: selection[0] * duration,
            endTime: selection[1] * duration,
          },
        }));
        toast.success(`已设置裁剪范围：${formatTime(selection[0] * duration)} - ${formatTime(selection[1] * duration)}`);
      }
    }
    setIsSelecting(false);
    setSelectStart(null);
  }, [isSelecting, selection, duration]);

  // 处理单段音频
  const handleProcess = useCallback(async () => {
    if (!selectedItem || !selectedItem.audioBuffer) {
      toast.info('请先选择音频文件');
      return;
    }
    setIsProcessing(true);
    setProcessProgress(0);
    setProcessedResult(null);

    try {
      const ctx = getAudioContext();
      const peakBefore = computePeakDb(selectedItem.audioBuffer);
      const rmsBefore = computeRmsDb(selectedItem.audioBuffer);

      // 模拟进度
      let progress = 0;
      const interval = setInterval(() => {
        progress += 5;
        if (progress > 90) progress = 90;
        setProcessProgress(progress);
      }, 50);

      const { buffer, blob } = await processAudio(selectedItem.audioBuffer, processChain, ctx);
      clearInterval(interval);

      const peakAfter = computePeakDb(buffer);
      const rmsAfter = computeRmsDb(buffer);
      const url = URL.createObjectURL(blob);

      setProcessedResult({
        blob,
        url,
        peakDbBefore: peakBefore,
        peakDbAfter: peakAfter,
        rmsDbBefore: rmsBefore,
        rmsDbAfter: rmsAfter,
      });
      setProcessProgress(100);
      toast.success('处理完成');
    } catch (err) {
      toast.error('处理失败');
      logger.error(err);
    } finally {
      setIsProcessing(false);
    }
  }, [selectedItem, processChain, getAudioContext]);

  // 批量处理
  const handleBatchProcess = useCallback(async () => {
    if (audioItems.length === 0) return;
    setIsProcessing(true);
    setProcessProgress(0);

    try {
      const ctx = getAudioContext();
      const zip = new JSZip();
      const total = audioItems.length;

      for (let i = 0; i < total; i++) {
        const item = audioItems[i];
        if (!item.audioBuffer) continue;

        const { blob } = await processAudio(item.audioBuffer, processChain, ctx);
        const baseName = item.name.replace(/\.[^.]+$/, '');
        const ext = processChain.format.enabled ? processChain.format.format : 'wav';
        zip.file(`${baseName}_processed.${ext}`, blob);
        setProcessProgress(Math.round(((i + 1) / total) * 100));
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      downloadFile(zipBlob, `audio_processed_${Date.now()}.zip`);
      toast.success(`批量处理完成：${total} 个文件`);
    } catch (err) {
      toast.error('批量处理失败');
      logger.error(err);
    } finally {
      setIsProcessing(false);
    }
  }, [audioItems, processChain, getAudioContext]);

  // 导出当前处理结果
  const handleExport = useCallback(() => {
    if (!processedResult || !selectedItem) return;
    const baseName = selectedItem.name.replace(/\.[^.]+$/, '');
    const ext = processChain.format.enabled ? processChain.format.format : 'wav';
    downloadFile(processedResult.blob, `${baseName}_processed.${ext}`);
  }, [processedResult, selectedItem, processChain.format]);

  // 删除音频
  const handleDelete = useCallback((id: string) => {
    setAudioItems((prev) => prev.filter((i) => i.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setPeaks(null);
      setProcessedResult(null);
    }
  }, [selectedId]);

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const supportedFormats = getSupportedAudioFormats();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">音频工具</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            波形可视化 · 裁剪 · 音量归一化 · 降噪 · 格式转换 · 批量处理
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="file"
            accept="audio/*"
            multiple
            className="hidden"
            id="audio-upload"
            onChange={(e) => handleUpload(e.target.files)}
          />
          <Button variant="secondary" size="sm" onClick={() => document.getElementById('audio-upload')?.click()}>
            <Upload className="size-3.5 mr-1.5" />
            上传音频
          </Button>
          <Badge variant="outline">{audioItems.length} 个文件</Badge>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4 h-[calc(100vh-220px)] min-h-[600px]">
        {/* 左侧文件列表 */}
        <Card className="col-span-3 flex flex-col min-h-0">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Music className="size-4" />
              音频列表
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 p-2 pt-0">
            <ScrollArea className="h-full">
              {audioItems.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  <FileAudio className="size-10 mx-auto mb-2 opacity-30" />
                  <p>上传音频开始处理</p>
                  <p className="text-xs mt-1 opacity-60">支持 WAV / MP3 / M4A / OGG</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {audioItems.map((item) => (
                    <div
                      key={item.id}
                      className={`group flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs ${
                        selectedId === item.id
                          ? 'bg-accent text-accent-foreground'
                          : 'hover:bg-muted/60'
                      }`}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <FileAudio className="size-3.5 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{item.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {item.duration > 0 ? formatTime(item.duration) : '--:--'} · {item.format.toUpperCase()}
                        </div>
                      </div>
                      <button
                        className="opacity-0 group-hover:opacity-100 text-destructive hover:opacity-70 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(item.id);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* 中间波形 + 预览区 */}
        <Card className="col-span-6 flex flex-col min-h-0">
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <AudioWaveform className="size-4" />
                波形预览
                {selectedItem && (
                  <Badge variant="outline" className="ml-2 font-normal">
                    {selectedItem.sampleRate} Hz · {selectedItem.channels}ch
                  </Badge>
                )}
              </CardTitle>
              {selectedItem && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                  <Select
                    value={String(playbackRate)}
                    onValueChange={(v) => {
                      const rate = parseFloat(v);
                      setPlaybackRate(rate);
                      if (audioRef.current) audioRef.current.playbackRate = rate;
                    }}
                  >
                    <SelectTrigger className="h-7 w-16 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0.5">0.5x</SelectItem>
                      <SelectItem value="1">1x</SelectItem>
                      <SelectItem value="1.5">1.5x</SelectItem>
                      <SelectItem value="2">2x</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 p-4 flex flex-col gap-3">
            {/* 波形画布 */}
            <div
              ref={waveformContainerRef}
              className="border rounded-md bg-muted/20 p-3 relative overflow-x-auto flex-shrink-0"
              style={{ height: 140 }}
            >
              {peaks ? (
                <canvas
                  ref={waveformCanvasRef}
                  className="cursor-pointer block"
                  style={{ width: waveformWidth, height: 120 }}
                  onClick={handleWaveformMouseDown}
                  onMouseMove={handleWaveformMouseMove}
                  onMouseUp={handleWaveformMouseUp}
                  onMouseLeave={handleWaveformMouseUp}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  选择音频查看波形
                </div>
              )}
            </div>

            {/* 播放控制 */}
            <div className="flex items-center justify-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => seekTo(Math.max(0, (currentTime - 5) / duration))}
                disabled={!selectedItem}
              >
                <SkipBack className="size-4" />
              </Button>
              <Button
                size="icon"
                className="h-10 w-10"
                onClick={togglePlay}
                disabled={!selectedItem}
              >
                {isPlaying ? <Pause className="size-5" /> : <Play className="size-5 ml-0.5" />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => seekTo(Math.min(1, (currentTime + 5) / duration))}
                disabled={!selectedItem}
              >
                <SkipForward className="size-4" />
              </Button>
            </div>

            {/* 缩放控制 */}
            {selectedItem && (
              <div className="flex items-center gap-3 text-xs">
                <span className="text-muted-foreground shrink-0">时间缩放</span>
                <Slider
                  value={[zoom]}
                  min={1}
                  max={8}
                  step={0.5}
                  onValueChange={([v]) => setZoom(v)}
                  className="flex-1"
                />
                <span className="tabular-nums w-10 text-right">{zoom.toFixed(1)}x</span>
                <span className="text-muted-foreground text-[10px]">
                  · 按住 Shift 拖拽选区
                </span>
              </div>
            )}

            {/* 处理进度 */}
            {isProcessing && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>处理中...</span>
                  <span>{processProgress}%</span>
                </div>
                <Progress value={processProgress} className="h-1.5" />
              </div>
            )}

            {/* 处理结果对比 */}
            {processedResult && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="border rounded-md p-3 space-y-2 bg-muted/20"
              >
                <div className="text-sm font-medium flex items-center gap-2">
                  <Zap className="size-4 text-primary" />
                  处理结果
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-muted-foreground mb-1">峰值响度（处理前）</div>
                    <div className="text-sm font-mono tabular-nums">
                      {isFinite(processedResult.peakDbBefore)
                        ? `${processedResult.peakDbBefore.toFixed(1)} dBFS`
                        : '-∞ dBFS'}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">峰值响度（处理后）</div>
                    <div className="text-sm font-mono tabular-nums text-primary">
                      {isFinite(processedResult.peakDbAfter)
                        ? `${processedResult.peakDbAfter.toFixed(1)} dBFS`
                        : '-∞ dBFS'}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">RMS 响度（处理前）</div>
                    <div className="text-sm font-mono tabular-nums">
                      {isFinite(processedResult.rmsDbBefore)
                        ? `${processedResult.rmsDbBefore.toFixed(1)} dBFS`
                        : '-∞ dBFS'}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">RMS 响度（处理后）</div>
                    <div className="text-sm font-mono tabular-nums text-primary">
                      {isFinite(processedResult.rmsDbAfter)
                        ? `${processedResult.rmsDbAfter.toFixed(1)} dBFS`
                        : '-∞ dBFS'}
                    </div>
                  </div>
                </div>
                <audio ref={audioRef} src={processedResult.url} />
                <div className="flex items-center gap-2 pt-2 border-t">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const audio = audioRef.current;
                      if (!audio) return;
                      if (audio.paused) audio.play();
                      else audio.pause();
                    }}
                  >
                    <Play className="size-3.5 mr-1" />
                    试听处理后
                  </Button>
                  <Button size="sm" onClick={handleExport}>
                    <Download className="size-3.5 mr-1" />
                    导出
                  </Button>
                </div>
              </motion.div>
            )}

            {/* 隐藏的音频元素（用于播放原始文件） */}
            <audio
              ref={audioRef}
              src={selectedItem?.url}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
            />
          </CardContent>
        </Card>

        {/* 右侧参数面板 */}
        <Card className="col-span-3 flex flex-col min-h-0">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Settings2 className="size-4" />
              处理参数
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 p-3 overflow-y-auto space-y-4">
            {/* 裁剪 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <Scissors className="size-3.5" />
                  音频裁剪
                </Label>
                <Switch
                  checked={processChain.trim.enabled}
                  onCheckedChange={(v) =>
                    setProcessChain((prev) => ({
                      ...prev,
                      trim: { ...prev.trim, enabled: v },
                    }))
                  }
                />
              </div>
              {processChain.trim.enabled && (
                <div className="space-y-2 pl-4 text-xs">
                  <div className="space-y-1">
                    <div className="flex justify-between text-muted-foreground">
                      <span>起始时间</span>
                      <span className="tabular-nums">{formatTime(processChain.trim.startTime)}</span>
                    </div>
                    <Slider
                      value={[processChain.trim.startTime]}
                      min={0}
                      max={duration || 1}
                      step={0.01}
                      onValueChange={([v]) =>
                        setProcessChain((prev) => ({
                          ...prev,
                          trim: { ...prev.trim, startTime: v },
                        }))
                      }
                      disabled={duration === 0}
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-muted-foreground">
                      <span>结束时间</span>
                      <span className="tabular-nums">{formatTime(processChain.trim.endTime)}</span>
                    </div>
                    <Slider
                      value={[processChain.trim.endTime]}
                      min={0}
                      max={duration || 1}
                      step={0.01}
                      onValueChange={([v]) =>
                        setProcessChain((prev) => ({
                          ...prev,
                          trim: { ...prev.trim, endTime: v },
                        }))
                      }
                      disabled={duration === 0}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 音量归一化 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <Volume2 className="size-3.5" />
                  音量归一化
                </Label>
                <Switch
                  checked={processChain.normalize.enabled}
                  onCheckedChange={(v) =>
                    setProcessChain((prev) => ({
                      ...prev,
                      normalize: { ...prev.normalize, enabled: v },
                    }))
                  }
                />
              </div>
              {processChain.normalize.enabled && (
                <div className="space-y-2 pl-4 text-xs">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">模式</Label>
                    <Select
                      value={processChain.normalize.mode}
                      onValueChange={(v) =>
                        setProcessChain((prev) => ({
                          ...prev,
                          normalize: { ...prev.normalize, mode: v as NormalizeMode },
                        }))
                      }
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="peak">峰值归一化</SelectItem>
                        <SelectItem value="rms">RMS 归一化</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-muted-foreground">
                      <span>目标响度</span>
                      <span className="tabular-nums">{processChain.normalize.targetDb.toFixed(1)} dB</span>
                    </div>
                    <Slider
                      value={[processChain.normalize.targetDb]}
                      min={-30}
                      max={0}
                      step={0.5}
                      onValueChange={([v]) =>
                        setProcessChain((prev) => ({
                          ...prev,
                          normalize: { ...prev.normalize, targetDb: v },
                        }))
                      }
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 降噪 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <AudioWaveform className="size-3.5" />
                  简易降噪
                </Label>
                <Switch
                  checked={processChain.noiseReduction.enabled}
                  onCheckedChange={(v) =>
                    setProcessChain((prev) => ({
                      ...prev,
                      noiseReduction: { ...prev.noiseReduction, enabled: v },
                    }))
                  }
                />
              </div>
              {processChain.noiseReduction.enabled && (
                <div className="space-y-2 pl-4 text-xs">
                  <div className="space-y-1">
                    <div className="flex justify-between text-muted-foreground">
                      <span>高通滤波</span>
                      <span className="tabular-nums">{processChain.noiseReduction.highPassFreq} Hz</span>
                    </div>
                    <Slider
                      value={[processChain.noiseReduction.highPassFreq]}
                      min={0}
                      max={500}
                      step={10}
                      onValueChange={([v]) =>
                        setProcessChain((prev) => ({
                          ...prev,
                          noiseReduction: { ...prev.noiseReduction, highPassFreq: v },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-muted-foreground">
                      <span>低通滤波</span>
                      <span className="tabular-nums">{processChain.noiseReduction.lowPassFreq} Hz</span>
                    </div>
                    <Slider
                      value={[processChain.noiseReduction.lowPassFreq]}
                      min={500}
                      max={20000}
                      step={100}
                      onValueChange={([v]) =>
                        setProcessChain((prev) => ({
                          ...prev,
                          noiseReduction: { ...prev.noiseReduction, lowPassFreq: v },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-muted-foreground">
                      <span>噪声门限</span>
                      <span className="tabular-nums">{processChain.noiseReduction.noiseGateThreshold} dB</span>
                    </div>
                    <Slider
                      value={[processChain.noiseReduction.noiseGateThreshold]}
                      min={-80}
                      max={-20}
                      step={1}
                      onValueChange={([v]) =>
                        setProcessChain((prev) => ({
                          ...prev,
                          noiseReduction: { ...prev.noiseReduction, noiseGateThreshold: v },
                        }))
                      }
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 格式转换 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <FileAudio className="size-3.5" />
                  格式转换
                </Label>
                <Switch
                  checked={processChain.format.enabled}
                  onCheckedChange={(v) =>
                    setProcessChain((prev) => ({
                      ...prev,
                      format: { ...prev.format, enabled: v },
                    }))
                  }
                />
              </div>
              {processChain.format.enabled && (
                <div className="space-y-2 pl-4 text-xs">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">输出格式</Label>
                    <Select
                      value={processChain.format.format}
                      onValueChange={(v) =>
                        setProcessChain((prev) => ({
                          ...prev,
                          format: { ...prev.format, format: v as AudioOutputFormat },
                        }))
                      }
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {supportedFormats.map((f) => (
                          <SelectItem key={f} value={f}>
                            {f.toUpperCase()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">
                      仅显示当前浏览器支持的格式
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* 操作按钮 */}
            <div className="space-y-2 pt-2 border-t">
              <Button
                className="w-full"
                size="sm"
                onClick={activeTab === 'single' ? handleProcess : handleBatchProcess}
                disabled={!selectedItem || isProcessing}
              >
                {isProcessing ? (
                  '处理中...'
                ) : activeTab === 'single' ? (
                  <>
                    <Zap className="size-3.5 mr-1" />
                    处理当前音频
                  </>
                ) : (
                  <>
                    <Grid3X3 className="size-3.5 mr-1" />
                    批量处理全部
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
