import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Plus,
  Trash2,
  Download,
  Film,
  Target,
  Save,
  ChevronLeft,
  ChevronRight,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { toast } from 'sonner';
import {
  mergeInterpolatedFrames,
  generateFrameTimestampMap,
} from '@/utils/annotation/videoAnnotation';
import type {
  IVideoAnnotationProject,
  ITrackKeyframe,
  IAnnotationBox,
  AnnotationShapeType,
  AnnotationFormat,
} from '@/types/annotation';
import {
  boxesToYoloTxt,
  imagesToCocoJson,
  boxesToLabelMeJson,
  boxesToVocXml,
} from '@/utils/annotation/formats';
import { logger } from '@lark-apaas/client-toolkit-lite';

export default function VideoAnnotationTab() {
  const [project, setProject] = useState<IVideoAnnotationProject | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState('object');
  const [newTrackName, setNewTrackName] = useState('');
  const [shapeType, setShapeType] = useState<AnnotationShapeType>('rectangle');
  const [isDrawing, setIsDrawing] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const playIntervalRef = useRef<number | null>(null);

  // 上传视频
  const handleVideoUpload = useCallback(
    async (file: File) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.src = url;
      video.muted = true;

      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error('视频加载失败'));
      });

      const fps = 25; // 假设 25fps，简化处理
      const totalFrames = Math.floor(video.duration * fps);

      const newProject: IVideoAnnotationProject = {
        id: Math.random().toString(36).slice(2, 10),
        name: file.name,
        videoUrl: url,
        videoName: file.name,
        duration: video.duration,
        fps,
        width: video.videoWidth,
        height: video.videoHeight,
        totalFrames,
        frames: [],
        tracks: [],
        categories: ['object', 'person', 'vehicle'],
      };

      setProject(newProject);
      setCurrentFrame(0);
      toast.success(`视频加载成功：${totalFrames} 帧 @ ${fps}fps`);
    },
    []
  );

  // 跳转到指定帧
  const seekToFrame = useCallback(
    (frameIdx: number) => {
      if (!project || !videoRef.current) return;
      const clamped = Math.max(0, Math.min(project.totalFrames - 1, frameIdx));
      const time = clamped / project.fps;
      videoRef.current.currentTime = time;
      setCurrentFrame(clamped);
    },
    [project]
  );

  // 播放/暂停（按帧步进）
  const togglePlay = useCallback(() => {
    if (!project) return;
    if (isPlaying) {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      playIntervalRef.current = window.setInterval(() => {
        setCurrentFrame((prev) => {
          if (!project) return prev;
          if (prev >= project.totalFrames - 1) {
            if (playIntervalRef.current) {
              clearInterval(playIntervalRef.current);
              playIntervalRef.current = null;
            }
            setIsPlaying(false);
            return prev;
          }
          const next = prev + 1;
          if (videoRef.current) {
            videoRef.current.currentTime = next / project.fps;
          }
          return next;
        });
      }, 1000 / project.fps);
    }
  }, [project, isPlaying]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    };
  }, []);

  // 创建新跟踪目标
  const handleAddTrack = useCallback(() => {
    if (!project) return;
    const name = newTrackName.trim() || `track_${project.tracks.length + 1}`;
    const trackId = Math.random().toString(36).slice(2, 10);
    const newBox: IAnnotationBox = {
      id: `${trackId}_start`,
      label: activeCategory,
      shapeType,
      x: project.width * 0.3,
      y: project.height * 0.3,
      width: project.width * 0.2,
      height: project.height * 0.2,
    };
    const newTrack: ITrackKeyframe = {
      trackId,
      label: activeCategory,
      shapeType,
      startFrame: currentFrame,
      endFrame: currentFrame,
      startBox: newBox,
      endBox: newBox,
    };
    setProject({
      ...project,
      tracks: [...project.tracks, newTrack],
    });
    setActiveTrackId(trackId);
    setNewTrackName('');
    toast.success(`已创建跟踪目标：${name}`);
  }, [project, currentFrame, activeCategory, shapeType, newTrackName]);

  // 设置当前帧为结束关键帧
  const handleSetEndKeyframe = useCallback(() => {
    if (!project || !activeTrackId) return;
    const track = project.tracks.find((t) => t.trackId === activeTrackId);
    if (!track) return;
    if (currentFrame <= track.startFrame) {
      toast.error('结束帧必须在起始帧之后');
      return;
    }
    const endBox: IAnnotationBox = {
      ...track.startBox,
      id: `${track.trackId}_end`,
    };
    const updated = project.tracks.map((t) =>
      t.trackId === activeTrackId ? { ...t, endFrame: currentFrame, endBox } : t
    );
    setProject({ ...project, tracks: updated });
    toast.success('已设置结束关键帧');
  }, [project, activeTrackId, currentFrame]);

  // 运行插值
  const handleInterpolate = useCallback(() => {
    if (!project || project.tracks.length === 0) {
      toast.info('请先创建跟踪目标');
      return;
    }
    const validTracks = project.tracks.filter((t) => t.endFrame > t.startFrame);
    if (validTracks.length === 0) {
      toast.info('请为跟踪目标设置起始和结束关键帧');
      return;
    }
    const frames = mergeInterpolatedFrames(
      validTracks,
      project.totalFrames,
      project.width,
      project.height,
      project.fps
    );
    setProject({ ...project, frames });
    toast.success(`插值完成：生成 ${frames.length} 帧标注`);
  }, [project]);

  // 导出标注
  const handleExport = useCallback(async () => {
    if (!project || project.frames.length === 0) {
      toast.info('暂无标注可导出');
      return;
    }
    try {
      const format: AnnotationFormat = 'yolo';
      const frameImages = project.frames.map((f) => ({
        id: `frame_${f.frameIndex}`,
        name: `frame_${f.frameIndex.toString().padStart(6, '0')}.jpg`,
        url: '',
        width: f.width,
        height: f.height,
        boxes: f.boxes,
        format,
      }));

      // 生成时间戳映射表
      const timestampMap = generateFrameTimestampMap(project.totalFrames, project.fps);
      const mapJson = JSON.stringify(timestampMap, null, 2);

      // 按格式导出（简化：直接生成内容）
      let content = '';
      let filename = '';
      if (format === 'yolo') {
        const lines: string[] = [];
        for (const img of frameImages) {
          const txt = boxesToYoloTxt(img.boxes, img.width, img.height, project.categories);
          lines.push(`# ${img.name}`);
          lines.push(txt);
          lines.push('');
        }
        content = lines.join('\n');
        filename = 'video_annotations_yolo.txt';
      } else if (format === 'coco') {
        content = imagesToCocoJson(frameImages, project.categories);
        filename = 'video_annotations_coco.json';
      }

      // 下载
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      toast.success(`导出 ${project.frames.length} 帧标注（${format.toUpperCase()} 格式）`);
      logger.info('时间戳映射:', String(mapJson));
    } catch (err) {
      toast.error('导出失败');
    }
  }, [project]);

  // 绘制画布叠加标注框
  useEffect(() => {
    if (!canvasRef.current || !project) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    canvasRef.current.width = project.width;
    canvasRef.current.height = project.height;
    ctx.clearRect(0, 0, project.width, project.height);

    // 绘制当前帧的所有标注
    const frameBoxes = project.frames.find((f) => f.frameIndex === currentFrame)?.boxes || [];

    for (const box of frameBoxes) {
      ctx.strokeStyle = box.color || '#f97316';
      ctx.lineWidth = 2;
      if (box.shapeType === 'polygon' && box.points && box.points.length > 2) {
        ctx.beginPath();
        ctx.moveTo(box.points[0][0], box.points[0][1]);
        for (let i = 1; i < box.points.length; i++) {
          ctx.lineTo(box.points[i][0], box.points[i][1]);
        }
        ctx.closePath();
        ctx.stroke();
      } else {
        ctx.strokeRect(box.x, box.y, box.width, box.height);
      }
      ctx.fillStyle = box.color || '#f97316';
      ctx.fillRect(box.x, box.y - 20, 80, 20);
      ctx.fillStyle = '#fff';
      ctx.font = '12px sans-serif';
      ctx.fillText(box.label, box.x + 4, box.y - 6);
    }

    // 绘制当前活动 track 的关键帧框
    if (activeTrackId) {
      const track = project.tracks.find((t) => t.trackId === activeTrackId);
      if (track) {
        const box = currentFrame <= track.startFrame
          ? track.startBox
          : currentFrame >= track.endFrame
            ? track.endBox
            : null; // 中间帧插值后在 frameBoxes 里已有
        if (box && currentFrame === track.startFrame) {
          ctx.strokeStyle = '#22c55e';
          ctx.lineWidth = 3;
          ctx.setLineDash([5, 5]);
          ctx.strokeRect(box.x, box.y, box.width, box.height);
          ctx.setLineDash([]);
        }
        if (box && currentFrame === track.endFrame) {
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 3;
          ctx.setLineDash([5, 5]);
          ctx.strokeRect(box.x, box.y, box.width, box.height);
          ctx.setLineDash([]);
        }
      }
    }
  }, [project, currentFrame, activeTrackId]);

  if (!project) {
    return (
      <div className="h-[calc(100vh-280px)] min-h-[500px] flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center space-y-4">
            <Film className="size-12 mx-auto text-muted-foreground opacity-50" />
            <div className="space-y-1">
              <h3 className="font-medium">视频标注（帧间插值）</h3>
              <p className="text-sm text-muted-foreground">
                上传视频后逐帧标注，支持帧间线性插值生成中间帧标注
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleVideoUpload(file);
              }}
            />
            <Button onClick={() => fileInputRef.current?.click()} className="w-full">
              <Upload className="size-4 mr-2" />
              上传视频
            </Button>
            <p className="text-xs text-muted-foreground">
              支持 MP4 / WebM / MOV 等浏览器可播放格式
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-12 gap-4 h-[calc(100vh-280px)] min-h-[500px]">
      {/* 左侧：跟踪目标列表 */}
      <Card className="col-span-3 flex flex-col min-h-0">
        <CardHeader className="py-3 px-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="size-4" />
            跟踪目标 ({project.tracks.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 p-2 pt-0 space-y-3">
          {/* 添加新目标 */}
          <div className="space-y-2">
            <Input
              value={newTrackName}
              onChange={(e) => setNewTrackName(e.target.value)}
              placeholder="目标名称（可选）"
              className="h-7 text-xs"
            />
            <div className="flex gap-1">
              <Select value={activeCategory} onValueChange={setActiveCategory}>
                <SelectTrigger className="h-7 text-xs flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {project.categories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={shapeType} onValueChange={(v) => setShapeType(v as AnnotationShapeType)}>
                <SelectTrigger className="h-7 text-xs w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rectangle">矩形</SelectItem>
                  <SelectItem value="polygon">多边形</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" className="w-full h-7" onClick={handleAddTrack}>
              <Plus className="size-3.5 mr-1" />
              添加目标
            </Button>
          </div>

          <div className="text-xs text-muted-foreground border-t pt-2">目标列表</div>
          <ScrollArea className="flex-1 -mx-2 px-2">
            <div className="space-y-1">
              {project.tracks.map((track) => (
                <div
                  key={track.trackId}
                  className={`p-2 rounded text-xs cursor-pointer ${
                    activeTrackId === track.trackId
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-muted/60'
                  }`}
                  onClick={() => setActiveTrackId(track.trackId)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium truncate">{track.label}</span>
                    <Badge variant="outline" className="text-[10px] h-4 px-1">
                      {track.shapeType}
                    </Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    帧 {track.startFrame} → {track.endFrame}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* 中间：视频 + 画布 */}
      <Card className="col-span-6 flex flex-col min-h-0">
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">
              {project.videoName}
              <Badge variant="outline" className="ml-2 font-normal">
                {project.width}×{project.height} · {project.fps}fps
              </Badge>
            </CardTitle>
            <div className="text-xs text-muted-foreground">
              帧 {currentFrame + 1} / {project.totalFrames} · {(currentFrame / project.fps).toFixed(2)}s
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 p-4 flex flex-col gap-3">
          {/* 视频 + 叠加画布 */}
          <div className="flex-1 border rounded-md bg-muted/20 flex items-center justify-center overflow-hidden relative">
            <video
              ref={videoRef}
              src={project.videoUrl}
              className="max-w-full max-h-full block"
              muted
              playsInline
            />
            <canvas
              ref={canvasRef}
              className="absolute top-0 left-0 w-full h-full pointer-events-none"
              style={{ objectFit: 'contain' }}
            />
          </div>

          {/* 帧控制 */}
          <div className="flex items-center justify-center gap-2">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => seekToFrame(0)}>
              <SkipBack className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => seekToFrame(currentFrame - 1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button size="icon" className="h-10 w-10" onClick={togglePlay}>
              {isPlaying ? <Pause className="size-5" /> : <Play className="size-5 ml-0.5" />}
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => seekToFrame(currentFrame + 1)}>
              <ChevronRight className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => seekToFrame(project.totalFrames - 1)}>
              <SkipForward className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 右侧：操作 + 插值 */}
      <Card className="col-span-3 flex flex-col min-h-0">
        <CardHeader className="py-3 px-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="size-4" />
            操作
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 p-3 space-y-3 text-xs overflow-y-auto">
          {/* 关键帧设置 */}
          <div className="space-y-2">
            <div className="text-xs font-medium">关键帧操作</div>
            <div className="grid grid-cols-2 gap-1">
              <Button
                size="sm"
                variant="secondary"
                className="h-7 text-xs"
                disabled={!activeTrackId}
                onClick={() => toast.info('起始帧已在创建目标时自动设置')}
              >
                起始帧 ✓
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="h-7 text-xs"
                disabled={!activeTrackId}
                onClick={handleSetEndKeyframe}
              >
                设为结束帧
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              选中目标后，在起始帧创建目标，跳转到结束帧后点击"设为结束帧"
            </p>
          </div>

          {/* 插值 */}
          <div className="space-y-2 pt-2 border-t">
            <Button size="sm" className="w-full h-8" onClick={handleInterpolate}>
              <Zap className="size-3.5 mr-1" />
              运行帧间插值
            </Button>
            <div className="text-[10px] text-muted-foreground">
              已标注帧：{project.frames.length} / {project.totalFrames}
            </div>
          </div>

          {/* 导出 */}
          <div className="space-y-2 pt-2 border-t">
            <div className="text-xs font-medium">导出</div>
            <Select defaultValue="yolo">
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yolo">YOLO txt</SelectItem>
                <SelectItem value="coco">COCO JSON</SelectItem>
                <SelectItem value="voc">VOC XML</SelectItem>
                <SelectItem value="labelme">LabelMe JSON</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="secondary" className="w-full h-7" onClick={handleExport}>
              <Download className="size-3.5 mr-1" />
              导出逐帧标注
            </Button>
            <p className="text-[10px] text-muted-foreground">
              同时导出帧时间戳映射表
            </p>
          </div>

          {/* 提示 */}
          <div className="pt-2 border-t space-y-1">
            <div className="text-xs font-medium">使用说明</div>
            <ol className="text-[10px] text-muted-foreground space-y-1 list-decimal pl-4">
              <li>上传视频，选择类别和形状</li>
              <li>在起始帧添加跟踪目标</li>
              <li>跳转到结束帧，调整标注框位置</li>
              <li>点击"设为结束帧"保存</li>
              <li>点击"运行帧间插值"生成中间帧</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
