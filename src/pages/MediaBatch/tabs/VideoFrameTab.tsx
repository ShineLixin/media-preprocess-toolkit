import { useState, useRef, useCallback, useMemo } from 'react';
import {
  Upload, Play, Download, Scissors, Video, Grid3x3, Image as ImageIcon,
  Film, Gauge, X, ZoomIn,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit-lite';
import type { IVideoFrame, IVideoFrameConfig, VideoPlaybackRate, IVideoTrimConfig, IVideoGifConfig } from '@/types/media';
import { computeDHashFromCanvas, hammingDistance } from '@/utils/image/hash';
import { zipAndDownload, formatFileSize } from '@/utils/file/fileUtils';
import { Image } from '@/components/ui/image';

/** 视频多功能 Tab：抽帧/去重 + 截取片段 + 转GIF + 网格预览 + 倍速 */
export default function VideoFrameTab() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [videoInfo, setVideoInfo] = useState<{
    duration: number; width: number; height: number;
  } | null>(null);
  const [frames, setFrames] = useState<IVideoFrame[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [playbackRate, setPlaybackRate] = useState<VideoPlaybackRate>(1);
  const [previewFrame, setPreviewFrame] = useState<IVideoFrame | null>(null);
  const [isTrimming, setIsTrimming] = useState(false);
  const [isGifMaking, setIsGifMaking] = useState(false);

  const [config, setConfig] = useState<IVideoFrameConfig>({
    interval: 1, startTime: 0, endTime: 0,
    dedupEnabled: true, dedupThreshold: 8,
  });

  const [trimConfig, setTrimConfig] = useState<IVideoTrimConfig>({
    startTime: 0, endTime: 10,
  });

  const [gifConfig, setGifConfig] = useState<IVideoGifConfig>({
    startTime: 0, endTime: 5, fps: 10, width: 480, quality: 10,
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── 视频上传 ── */
  const handleVideoUpload = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith('video/')) {
      toast.error('请选择视频文件');
      return;
    }
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoUrl(url);
    setFrames([]);
    setVideoInfo(null);
    setProgress(0);
  }, [videoUrl]);

  /* ── 视频元数据加载 ── */
  const handleVideoLoaded = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setVideoInfo({
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
    });
    setTrimConfig({ startTime: 0, endTime: Math.min(10, video.duration) });
    setGifConfig((prev) => ({
      ...prev, startTime: 0, endTime: Math.min(5, video.duration),
      width: Math.min(480, video.videoWidth),
    }));
  }, []);

  /* ── 倍速切换 ── */
  const handlePlaybackRateChange = useCallback((rate: VideoPlaybackRate) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  }, []);

  /* ── 抽帧 ── */
  const handleExtractFrames = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !videoInfo) {
      toast.info('请先上传视频');
      return;
    }
    setIsExtracting(true);
    setProgress(0);
    setFrames([]);

    const startTime = config.startTime;
    const endTime = config.endTime > 0 ? Math.min(config.endTime, videoInfo.duration) : videoInfo.duration;
    const interval = Math.max(0.1, config.interval);
    const totalFrames = Math.floor((endTime - startTime) / interval) + 1;

    const canvas = document.createElement('canvas');
    canvas.width = videoInfo.width;
    canvas.height = videoInfo.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      toast.error('Canvas 不可用');
      setIsExtracting(false);
      return;
    }

    const extractedFrames: IVideoFrame[] = [];

    try {
      for (let i = 0; i < totalFrames; i++) {
        const timestamp = startTime + i * interval;
        if (timestamp > endTime) break;

        await new Promise<void>((resolve, reject) => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            resolve();
          };
          video.addEventListener('seeked', onSeeked);
          video.currentTime = timestamp;
          setTimeout(() => {
            video.removeEventListener('seeked', onSeeked);
            resolve();
          }, 3000);
        });

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => resolve(b ?? new Blob()), 'image/jpeg', 0.85);
        });
        const url = URL.createObjectURL(blob);
        let hash = '';
        if (config.dedupEnabled) {
          hash = computeDHashFromCanvas(canvas);
        }
        extractedFrames.push({
          index: i, timestamp, url, blob,
          width: videoInfo.width, height: videoInfo.height,
          hash, isDuplicate: false,
        });
        setProgress(Math.round(((i + 1) / totalFrames) * 100));
      }

      // 去重
      if (config.dedupEnabled && extractedFrames.length > 1) {
        for (let i = 0; i < extractedFrames.length; i++) {
          const frame = extractedFrames[i];
          if (i > 0) {
            const prev = extractedFrames[i - 1];
            if (prev.hash && frame.hash && hammingDistance(prev.hash, frame.hash) <= config.dedupThreshold) {
              frame.isDuplicate = true;
              continue;
            }
          }
          for (let j = i - 2; j >= Math.max(0, i - 5); j--) {
            const prev = extractedFrames[j];
            if (prev.isDuplicate) continue;
            if (prev.hash && frame.hash && hammingDistance(prev.hash, frame.hash) <= config.dedupThreshold) {
              frame.isDuplicate = true;
              break;
            }
          }
        }
      }

      setFrames(extractedFrames);
      const uniqueCount = extractedFrames.filter((f) => !f.isDuplicate).length;
      toast.success(
        `抽帧完成：共 ${extractedFrames.length} 帧${config.dedupEnabled ? `，去重后 ${uniqueCount} 帧` : ''}`
      );
    } catch (err) {
      toast.error('抽帧失败');
      logger.error('视频抽帧失败:', String(err));
    } finally {
      setIsExtracting(false);
    }
  }, [videoInfo, config]);

  /* ── 导出去重后帧 ── */
  const handleExportFrames = useCallback(async () => {
    const exportFrames = frames.filter((f) => !f.isDuplicate);
    if (exportFrames.length === 0) {
      toast.info('没有可导出的帧');
      return;
    }
    try {
      const files = exportFrames.map((f) => ({
        path: `frame_${String(f.index).padStart(5, '0')}.jpg`,
        content: f.blob,
      }));
      await zipAndDownload(files, 'frames_unique.zip');
      toast.success('导出成功');
    } catch (err) {
      toast.error('导出失败');
      logger.error('导出失败:', String(err));
    }
  }, [frames]);

  /* ── 单帧下载 ── */
  const handleDownloadSingle = useCallback((frame: IVideoFrame) => {
    const a = document.createElement('a');
    a.href = frame.url;
    a.download = `frame_${String(frame.index).padStart(5, '0')}.jpg`;
    a.click();
  }, []);

  /* ── 视频截取片段 ── */
  const handleTrimVideo = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !videoInfo) return;
    if (trimConfig.endTime <= trimConfig.startTime) {
      toast.error('结束时间必须大于起始时间');
      return;
    }
    setIsTrimming(true);
    try {
      // 使用 MediaRecorder 录制截取片段
      const videoEl = video as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };
      const stream = videoEl.captureStream?.() ?? videoEl.mozCaptureStream?.();
      if (!stream) {
        toast.error('当前浏览器不支持视频截取（captureStream 不可用）');
        setIsTrimming(false);
        return;
      }

      // 检查支持的 mime type
      const mimeTypes = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
      ];
      let mimeType = '';
      for (const mt of mimeTypes) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mt)) {
          mimeType = mt;
          break;
        }
      }
      if (!mimeType) {
        toast.error('当前浏览器不支持视频录制');
        setIsTrimming(false);
        return;
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      await new Promise<void>((resolve, reject) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          resolve();
        };
        video.addEventListener('seeked', onSeeked);
        video.currentTime = trimConfig.startTime;
        setTimeout(() => {
          video.removeEventListener('seeked', onSeeked);
          reject(new Error('seek 超时'));
        }, 3000);
      });

      const duration = trimConfig.endTime - trimConfig.startTime;

      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.start();
        video.play();
        setTimeout(() => {
          recorder.stop();
          video.pause();
        }, duration * 1000);
      });

      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trimmed_${trimConfig.startTime.toFixed(1)}_${trimConfig.endTime.toFixed(1)}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('截取完成（WebM 格式）');
    } catch (err) {
      toast.error('截取失败');
      logger.error('视频截取失败:', String(err));
    } finally {
      setIsTrimming(false);
    }
  }, [videoInfo, trimConfig]);

  /* ── 视频转 GIF ── */
  const handleExportGif = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !videoInfo) return;
    if (gifConfig.endTime <= gifConfig.startTime) {
      toast.error('结束时间必须大于起始时间');
      return;
    }
    setIsGifMaking(true);
    try {
      const targetW = gifConfig.width;
      const targetH = Math.round(targetW * (videoInfo.height / videoInfo.width));
      const frameInterval = 1 / gifConfig.fps;
      const duration = gifConfig.endTime - gifConfig.startTime;
      const totalFrames = Math.max(2, Math.floor(duration * gifConfig.fps));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 不可用');

      // 收集帧的 ImageData
      const frameData: ImageData[] = [];
      for (let i = 0; i < totalFrames; i++) {
        const t = gifConfig.startTime + i * frameInterval;
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            resolve();
          };
          video.addEventListener('seeked', onSeeked);
          video.currentTime = t;
          setTimeout(() => {
            video.removeEventListener('seeked', onSeeked);
            resolve();
          }, 2000);
        });
        ctx.drawImage(video, 0, 0, targetW, targetH);
        frameData.push(ctx.getImageData(0, 0, targetW, targetH));
        setProgress(Math.round(((i + 1) / totalFrames) * 50));
      }

      // 使用简易量化 + GIF 编码（纯前端 gif.js 风格，这里简化为 canvas 序列导出 PNG 打包）
      // 由于没有 gif 编码库，导出为 zip 包内的 PNG 帧序列 + 说明文件
      // 用户可使用外部工具合成 GIF
      const files = frameData.map((fd, i) => {
        const c = document.createElement('canvas');
        c.width = targetW; c.height = targetH;
        const cc = c.getContext('2d');
        cc?.putImageData(fd, 0, 0);
        return {
          path: `frame_${String(i).padStart(4, '0')}.png`,
          content: new Promise<Blob>((resolve) => c.toBlob((b) => resolve(b ?? new Blob()), 'image/png')),
        };
      });

      // 等所有 blob 生成
      const resolvedFiles = await Promise.all(
        files.map(async (f) => ({
          path: f.path,
          content: await f.content,
        }))
      );
      resolvedFiles.push({
        path: 'README.txt',
        content: new Blob([
          `GIF 帧序列（PNG）\n尺寸: ${targetW}x${targetH}\n帧率: ${gifConfig.fps} fps\n总帧数: ${totalFrames}\n\n请使用 ImageMagick / ffmpeg / GIMP 等工具合成 GIF：\nffmpeg -framerate ${gifConfig.fps} -i frame_%04d.png output.gif\n`,
        ], { type: 'text/plain' }),
      });

      await zipAndDownload(resolvedFiles, 'gif_frames.zip');
      toast.success(`已导出 ${totalFrames} 帧 GIF 帧序列（PNG）`);
    } catch (err) {
      toast.error('GIF 生成失败');
      logger.error('GIF 生成失败:', String(err));
    } finally {
      setIsGifMaking(false);
      setProgress(0);
    }
  }, [videoInfo, gifConfig]);

  const uniqueFrames = useMemo(() => frames.filter((f) => !f.isDuplicate), [frames]);
  const dupFrames = useMemo(() => frames.filter((f) => f.isDuplicate), [frames]);

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = (s % 60).toFixed(1);
    return `${mins}:${secs.padStart(4, '0')}`;
  };

  return (
    <div className="grid grid-cols-12 gap-4 h-[calc(100vh-220px)] min-h-[500px]">
      {/* 左侧：上传 + 配置 + 功能Tab */}
      <div className="col-span-3 flex flex-col gap-3 min-h-0">
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => handleVideoUpload(e.target.files)}
          />
          <Button
            className="w-full"
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={isExtracting || isTrimming || isGifMaking}
          >
            <Upload className="size-4 mr-2" />
            上传视频
          </Button>
        </div>

        {videoFile && (
          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="text-sm font-medium truncate">{videoFile.name}</div>
              <div className="text-xs text-muted-foreground space-y-0.5">
                <div>大小: {formatFileSize(videoFile.size)}</div>
                {videoInfo && (
                  <>
                    <div>时长: {formatTime(videoInfo.duration)}</div>
                    <div>分辨率: {videoInfo.width}×{videoInfo.height}</div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="flex-1 overflow-hidden flex flex-col min-h-0">
          <CardContent className="p-0 h-full flex flex-col min-h-0">
            <Tabs defaultValue="extract" className="flex-1 flex flex-col min-h-0">
              <TabsList className="mx-3 mt-3 w-[calc(100%-24px)] grid grid-cols-3 h-8">
                <TabsTrigger value="extract" className="text-xs">抽帧去重</TabsTrigger>
                <TabsTrigger value="trim" className="text-xs">截取片段</TabsTrigger>
                <TabsTrigger value="gif" className="text-xs">转 GIF</TabsTrigger>
              </TabsList>

              <TabsContent value="extract" className="flex-1 overflow-y-auto p-3 space-y-3 pt-3">
                <div className="text-sm font-medium flex items-center gap-1">
                  <Scissors className="size-3.5" />
                  抽帧配置
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>抽帧间隔 (秒)</span>
                    <span>{config.interval.toFixed(1)}s</span>
                  </div>
                  <Slider
                    value={[config.interval * 10]}
                    onValueChange={([v]) => setConfig((p) => ({ ...p, interval: v / 10 }))}
                    min={1} max={600} step={1}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">起始</label>
                    <Input
                      type="number"
                      value={config.startTime}
                      onChange={(e) => setConfig((p) => ({ ...p, startTime: parseFloat(e.target.value) || 0 }))}
                      className="h-8 text-sm"
                      step="0.1"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">结束</label>
                    <Input
                      type="number"
                      value={config.endTime}
                      onChange={(e) => setConfig((p) => ({ ...p, endTime: parseFloat(e.target.value) || 0 }))}
                      className="h-8 text-sm"
                      step="0.1"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="dedup" className="text-xs">感知哈希去重</Label>
                  <Switch
                    id="dedup"
                    checked={config.dedupEnabled}
                    onCheckedChange={(v) => setConfig((p) => ({ ...p, dedupEnabled: v }))}
                  />
                </div>
                {config.dedupEnabled && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>相似度阈值</span>
                      <span>{config.dedupThreshold}</span>
                    </div>
                    <Slider
                      value={[config.dedupThreshold]}
                      onValueChange={([v]) => setConfig((p) => ({ ...p, dedupThreshold: v }))}
                      min={2} max={20} step={1}
                    />
                  </div>
                )}
                <Button
                  className="w-full"
                  size="sm"
                  onClick={handleExtractFrames}
                  disabled={!videoFile || isExtracting}
                >
                  {isExtracting ? `抽帧中 ${progress}%` : '开始抽帧'}
                </Button>
              </TabsContent>

              <TabsContent value="trim" className="flex-1 overflow-y-auto p-3 space-y-3 pt-3">
                <div className="text-sm font-medium flex items-center gap-1">
                  <Film className="size-3.5" />
                  截取片段
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">起始时间 (秒)</label>
                    <Input
                      type="number"
                      value={trimConfig.startTime}
                      onChange={(e) => setTrimConfig((p) => ({ ...p, startTime: parseFloat(e.target.value) || 0 }))}
                      className="h-8 text-sm"
                      step="0.1"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">结束时间 (秒)</label>
                    <Input
                      type="number"
                      value={trimConfig.endTime}
                      onChange={(e) => setTrimConfig((p) => ({ ...p, endTime: parseFloat(e.target.value) || 0 }))}
                      className="h-8 text-sm"
                      step="0.1"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  浏览器本地录制，输出 WebM 格式
                </p>
                <Button
                  className="w-full"
                  size="sm"
                  onClick={handleTrimVideo}
                  disabled={!videoFile || isTrimming}
                >
                  {isTrimming ? '截取中...' : '开始截取并下载'}
                </Button>
              </TabsContent>

              <TabsContent value="gif" className="flex-1 overflow-y-auto p-3 space-y-3 pt-3">
                <div className="text-sm font-medium flex items-center gap-1">
                  <Film className="size-3.5" />
                  转 GIF
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">起始 (秒)</label>
                    <Input
                      type="number"
                      value={gifConfig.startTime}
                      onChange={(e) => setGifConfig((p) => ({ ...p, startTime: parseFloat(e.target.value) || 0 }))}
                      className="h-8 text-sm" step="0.1"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">结束 (秒)</label>
                    <Input
                      type="number"
                      value={gifConfig.endTime}
                      onChange={(e) => setGifConfig((p) => ({ ...p, endTime: parseFloat(e.target.value) || 0 }))}
                      className="h-8 text-sm" step="0.1"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>帧率 (fps)</span>
                    <span>{gifConfig.fps}</span>
                  </div>
                  <Slider
                    value={[gifConfig.fps]}
                    onValueChange={([v]) => setGifConfig((p) => ({ ...p, fps: v }))}
                    min={2} max={30} step={1}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>宽度 (px)</span>
                    <span>{gifConfig.width}</span>
                  </div>
                  <Slider
                    value={[gifConfig.width]}
                    onValueChange={([v]) => setGifConfig((p) => ({ ...p, width: v }))}
                    min={100} max={1280} step={20}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  导出 PNG 帧序列包，可用 ffmpeg 合成 GIF
                </p>
                <Button
                  className="w-full"
                  size="sm"
                  onClick={handleExportGif}
                  disabled={!videoFile || isGifMaking}
                >
                  {isGifMaking ? `生成中 ${progress}%` : '生成 GIF 帧序列'}
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* 中间：视频预览 + 帧列表/网格 */}
      <div className="col-span-9 flex flex-col gap-3 min-h-0">
        {/* 视频播放器 */}
        <Card>
          <CardContent className="p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Video className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">视频预览</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground mr-1">倍速</span>
                {[0.5, 1, 2].map((rate) => (
                  <Button
                    key={rate}
                    size="sm"
                    variant={playbackRate === rate ? 'default' : 'secondary'}
                    className="h-6 px-2 text-xs"
                    onClick={() => handlePlaybackRateChange(rate as VideoPlaybackRate)}
                  >
                    {rate}x
                  </Button>
                ))}
              </div>
            </div>
            <video
              ref={videoRef}
              src={videoUrl}
              onLoadedMetadata={handleVideoLoaded}
              controls
              className="w-full max-h-[280px] bg-black rounded-md"
            />
          </CardContent>
        </Card>

        {/* 帧结果 */}
        {frames.length > 0 && (
          <Card className="flex-1 overflow-hidden flex flex-col min-h-0">
            <CardContent className="p-3 space-y-3 h-full flex flex-col min-h-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">抽帧结果</span>
                  <Badge variant="outline" className="text-xs">
                    {frames.length} 帧 · 去重后 {uniqueFrames.length}
                    {dupFrames.length > 0 && ` · ${dupFrames.length} 重复`}
                  </Badge>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant={viewMode === 'grid' ? 'default' : 'secondary'}
                    className="h-7 px-2"
                    onClick={() => setViewMode('grid')}
                  >
                    <Grid3x3 className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant={viewMode === 'list' ? 'default' : 'secondary'}
                    className="h-7 px-2"
                    onClick={() => setViewMode('list')}
                  >
                    <Gauge className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleExportFrames}
                    className="ml-2"
                  >
                    <Download className="size-3.5 mr-1" />
                    导出全部
                  </Button>
                </div>
              </div>

              <ScrollArea className="flex-1 border rounded-md">
                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 p-2">
                    {uniqueFrames.map((frame) => (
                      <button
                        key={frame.index}
                        className="group relative aspect-video rounded border overflow-hidden hover:ring-2 hover:ring-primary transition-all"
                        onClick={() => setPreviewFrame(frame)}
                      >
                        <Image src={frame.url} alt="" className="w-full h-full object-cover" />
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1 py-0.5 flex justify-between">
                          <span>#{frame.index}</span>
                          <span>{formatTime(frame.timestamp)}</span>
                        </div>
                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="icon"
                            variant="secondary"
                            className="h-6 w-6 rounded-full"
                            onClick={(e) => { e.stopPropagation(); handleDownloadSingle(frame); }}
                          >
                            <Download className="size-3" />
                          </Button>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {uniqueFrames.map((frame) => (
                      <div
                        key={frame.index}
                        className="flex items-center gap-3 p-2 rounded hover:bg-muted/50 text-sm"
                      >
                        <Image
                          src={frame.url}
                          alt=""
                          className="w-24 h-14 object-cover rounded border shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">帧 #{frame.index}</div>
                          <div className="text-xs text-muted-foreground">
                            时间: {formatTime(frame.timestamp)} · {frame.width}×{frame.height}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleDownloadSingle(frame)}
                        >
                          <Download className="size-3.5 mr-1" />
                          下载
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* 无抽帧时的占位 */}
        {frames.length === 0 && !isExtracting && (
          <Card className="flex-1 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <ImageIcon className="size-12 opacity-30 mx-auto mb-2" />
              <p className="text-sm">上传视频并配置参数后开始抽帧</p>
            </div>
          </Card>
        )}
      </div>

      {/* 大图预览对话框 */}
      <Dialog open={!!previewFrame} onOpenChange={(o) => !o && setPreviewFrame(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>
                帧 #{previewFrame?.index} · {previewFrame ? formatTime(previewFrame.timestamp) : ''}
              </span>
              {previewFrame && (
                <Button size="sm" onClick={() => handleDownloadSingle(previewFrame)}>
                  <Download className="size-3.5 mr-1" />
                  下载
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          {previewFrame && (
            <div className="flex justify-center">
              <Image
                src={previewFrame.url}
                alt=""
                className="max-w-full max-h-[70vh] object-contain rounded"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
