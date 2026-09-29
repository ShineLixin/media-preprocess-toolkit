import { useState, useRef, useEffect, useCallback, memo } from 'react';
import type { IAnnotationBox, AnnotationShapeType } from '@/types/annotation';
import { getBboxFromPoints } from '@/utils/annotation/formats';

interface AnnotationCanvasProps {
  imageUrl: string;
  boxes: IAnnotationBox[];
  readOnly?: boolean;
  fitView?: boolean;
  selectedBoxId?: string | null;
  /** 当前绘制工具：矩形/多边形/无 */
  drawTool?: AnnotationShapeType | 'none';
  onSelectBox?: (id: string | null) => void;
  onAddBox?: (box: Omit<IAnnotationBox, 'id' | 'color'>) => void;
  onUpdateBox?: (id: string, patch: Partial<IAnnotationBox>) => void;
  onDeleteBox?: (id: string) => void;
}

/** 拖拽模式 */
type DragMode =
  | 'none'
  | 'move-box'         // 移动整个标注（矩形/多边形）
  | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br' // 矩形四向缩放
  | 'move-vertex'      // 移动多边形顶点
  | 'add-vertex';      // 添加多边形顶点

function AnnotationCanvas({
  imageUrl,
  boxes,
  readOnly = false,
  fitView = false,
  selectedBoxId = null,
  drawTool = 'rectangle',
  onSelectBox,
  onAddBox,
  onUpdateBox,
  onDeleteBox,
}: AnnotationCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });

  const viewRef = useRef({ scale: 1, offsetX: 0, offsetY: 0 });

  // 矩形绘制态
  const rectDrawRef = useRef({
    isDrawing: false, startX: 0, startY: 0, curX: 0, curY: 0,
  });

  // 多边形绘制态：点列表（画布坐标）
  const polyDrawRef = useRef<{
    isDrawing: boolean;
    points: [number, number][]; // 画布坐标下的点
  }>({ isDrawing: false, points: [] });

  // 拖拽态
  const dragRef = useRef<{
    mode: DragMode;
    boxId: string | null;
    vertexIndex: number;       // move-vertex 模式下的顶点索引
    startX: number;
    startY: number;
    origBox: IAnnotationBox | null;
    origPoints: [number, number][] | null;
  }>({
    mode: 'none', boxId: null, vertexIndex: -1,
    startX: 0, startY: 0, origBox: null, origPoints: null,
  });

  const panRef = useRef({
    isPanning: false, startX: 0, startY: 0,
    origOffsetX: 0, origOffsetY: 0,
  });
  const [, forceRender] = useState(0);

  /* ── 加载图片 ── */
  useEffect(() => {
    setImgLoaded(false);
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
      setImgLoaded(true);
    };
    img.src = imageUrl;
    // 切换图片时清空多边形绘制态
    polyDrawRef.current = { isDrawing: false, points: [] };
    rectDrawRef.current = { isDrawing: false, startX: 0, startY: 0, curX: 0, curY: 0 };
  }, [imageUrl]);

  /* ── 自适应视图 ── */
  useEffect(() => {
    if (!imgLoaded || !fitView || !containerRef.current || !canvasRef.current) return;
    const container = containerRef.current;
    const cw = container.clientWidth, ch = container.clientHeight;
    if (cw === 0 || ch === 0 || imgSize.w === 0) return;
    const scale = Math.min(cw / imgSize.w, ch / imgSize.h) * 0.95;
    viewRef.current.scale = scale;
    viewRef.current.offsetX = (cw - imgSize.w * scale) / 2;
    viewRef.current.offsetY = (ch - imgSize.h * scale) / 2;
    render();
  }, [imgLoaded, fitView, imgSize.w, imgSize.h]);

  /* ── 坐标转换 ── */
  const screenToImage = useCallback((sx: number, sy: number) => {
    const { scale, offsetX, offsetY } = viewRef.current;
    return { x: (sx - offsetX) / scale, y: (sy - offsetY) / scale };
  }, []);

  const imageToScreen = useCallback((ix: number, iy: number) => {
    const { scale, offsetX, offsetY } = viewRef.current;
    return { x: ix * scale + offsetX, y: iy * scale + offsetY };
  }, []);

  /* ── 渲染函数 ── */
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const container = containerRef.current;
    if (!canvas || !ctx || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const cw = container.clientWidth, ch = container.clientHeight;
    canvas.width = cw * dpr; canvas.height = ch * dpr;
    canvas.style.width = `${cw}px`; canvas.style.height = `${ch}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, 0, cw, ch);

    const { scale, offsetX, offsetY } = viewRef.current;

    // 底图
    if (imageRef.current && imgLoaded) {
      ctx.drawImage(imageRef.current, offsetX, offsetY, imgSize.w * scale, imgSize.h * scale);
    }

    // 标注
    boxes.forEach((box) => {
      const color = box.color ?? '#22c55e';
      const isSelected = box.id === selectedBoxId;
      const lineWidth = isSelected ? 2.5 : 1.5;

      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.fillStyle = `${color}20`;

      if (box.shapeType === 'polygon' && box.points && box.points.length > 0) {
        // 多边形
        ctx.beginPath();
        const pts = box.points;
        const first = imageToScreen(pts[0][0], pts[0][1]);
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < pts.length; i++) {
          const p = imageToScreen(pts[i][0], pts[i][1]);
          ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 标签（取外接矩形左上）
        const bbox = getBboxFromPoints(pts);
        const sx = offsetX + bbox.x * scale;
        const sy = offsetY + bbox.y * scale;
        ctx.font = `${isSelected ? 12 : 11}px -apple-system, sans-serif`;
        const label = `${box.label} (多边形)`;
        const textW = ctx.measureText(label).width + 8;
        ctx.fillStyle = color;
        ctx.fillRect(sx, sy - 18, textW, 18);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, sx + 4, sy - 5);

        // 选中时显示所有顶点
        if (isSelected) {
          for (let i = 0; i < pts.length; i++) {
            const p = imageToScreen(pts[i][0], pts[i][1]);
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }
      } else {
        // 矩形
        const x = offsetX + box.x * scale, y = offsetY + box.y * scale;
        const w = box.width * scale, h = box.height * scale;
        ctx.strokeRect(x, y, w, h);
        ctx.fillRect(x, y, w, h);

        ctx.font = `${isSelected ? 12 : 11}px -apple-system, sans-serif`;
        const label = box.label;
        const textW = ctx.measureText(label).width + 8;
        ctx.fillStyle = color;
        ctx.fillRect(x, y - 18, textW, 18);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, x + 4, y - 5);

        if (isSelected) {
          const handles = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]];
          handles.forEach(([hx, hy]) => {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(hx - 4, hy - 4, 8, 8);
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(hx - 4, hy - 4, 8, 8);
          });
        }
      }
    });

    // 矩形绘制中
    if (rectDrawRef.current.isDrawing) {
      const { startX, startY, curX, curY } = rectDrawRef.current;
      const x = Math.min(startX, curX), y = Math.min(startY, curY);
      const w = Math.abs(curX - startX), h = Math.abs(curY - startY);
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }

    // 多边形绘制中
    if (polyDrawRef.current.isDrawing && polyDrawRef.current.points.length > 0) {
      const pts = polyDrawRef.current.points;
      ctx.strokeStyle = '#3b82f6';
      ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i][0], pts[i][1]);
      }
      // 最后一个点到起点用虚线
      ctx.stroke();
      ctx.setLineDash([]);

      // 顶点
      for (let i = 0; i < pts.length; i++) {
        ctx.fillStyle = i === 0 ? '#22c55e' : '#ffffff';
        ctx.beginPath();
        ctx.arc(pts[i][0], pts[i][1], 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }, [boxes, selectedBoxId, imgLoaded, imgSize.w, imgSize.h, imageToScreen]);

  useEffect(() => { render(); }, [render]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => render());
    ro.observe(container);
    return () => ro.disconnect();
  }, [render]);

  /* ── 命中检测 ── */
  const hitTest = useCallback(
    (sx: number, sy: number): {
      boxId: string | null;
      handle: string | null;          // 矩形 4 角
      vertexIndex: number;            // 多边形顶点索引
      hitType: 'box' | 'vertex' | 'edge' | null;
    } => {
      const { scale, offsetX, offsetY } = viewRef.current;
      const VERTEX_HIT_RADIUS = 8;

      for (let i = boxes.length - 1; i >= 0; i--) {
        const box = boxes[i];

        if (box.shapeType === 'polygon' && box.points && box.points.length >= 3) {
          // 先检测顶点（选中态才有顶点）
          if (box.id === selectedBoxId) {
            for (let vi = 0; vi < box.points.length; vi++) {
              const p = box.points[vi];
              const px = offsetX + p[0] * scale;
              const py = offsetX + p[1] * scale; // 注：以下修正
            }
            // 上面写法有误，重写
          }
          const pts = box.points;
          let hitVertex = -1;
          if (box.id === selectedBoxId) {
            for (let vi = 0; vi < pts.length; vi++) {
              const vx = offsetX + pts[vi][0] * scale;
              const vy = offsetY + pts[vi][1] * scale;
              const dx = sx - vx, dy = sy - vy;
              if (dx * dx + dy * dy <= VERTEX_HIT_RADIUS * VERTEX_HIT_RADIUS) {
                hitVertex = vi;
                break;
              }
            }
          }
          if (hitVertex >= 0) {
            return { boxId: box.id, handle: null, vertexIndex: hitVertex, hitType: 'vertex' };
          }
          // 点是否在多边形内
          if (pointInPolygon(sx - offsetX, sy - offsetY, pts, scale)) {
            return { boxId: box.id, handle: null, vertexIndex: -1, hitType: 'box' };
          }
        } else {
          // 矩形
          const x = offsetX + box.x * scale, y = offsetY + box.y * scale;
          const w = box.width * scale, h = box.height * scale;
          const handleSize = 8;
          if (box.id === selectedBoxId) {
            const handles = [
              { name: 'resize-tl', hx: x, hy: y },
              { name: 'resize-tr', hx: x + w, hy: y },
              { name: 'resize-bl', hx: x, hy: y + h },
              { name: 'resize-br', hx: x + w, hy: y + h },
            ];
            for (const hd of handles) {
              if (
                sx >= hd.hx - handleSize && sx <= hd.hx + handleSize &&
                sy >= hd.hy - handleSize && sy <= hd.hy + handleSize
              ) {
                return { boxId: box.id, handle: hd.name, vertexIndex: -1, hitType: 'vertex' };
              }
            }
          }
          if (sx >= x && sx <= x + w && sy >= y && sy <= y + h) {
            return { boxId: box.id, handle: null, vertexIndex: -1, hitType: 'box' };
          }
        }
      }
      return { boxId: null, handle: null, vertexIndex: -1, hitType: null };
    },
    [boxes, selectedBoxId]
  );

  /* ── 鼠标事件：mousedown ── */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;

      // 中键或 Alt+左键 = 平移
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        panRef.current = {
          isPanning: true, startX: sx, startY: sy,
          origOffsetX: viewRef.current.offsetX, origOffsetY: viewRef.current.offsetY,
        };
        return;
      }

      if (readOnly) return;

      // 多边形绘制中：点击添加顶点
      if (polyDrawRef.current.isDrawing && drawTool === 'polygon') {
        polyDrawRef.current.points.push([sx, sy]);
        render();
        return;
      }

      const hit = hitTest(sx, sy);

      // 选中多边形顶点 → 开始拖拽顶点
      if (hit.hitType === 'vertex' && hit.boxId && hit.vertexIndex >= 0) {
        const box = boxes.find((b) => b.id === hit.boxId);
        if (box?.shapeType === 'polygon' && box.points) {
          dragRef.current = {
            mode: 'move-vertex',
            boxId: hit.boxId,
            vertexIndex: hit.vertexIndex,
            startX: sx, startY: sy,
            origBox: { ...box },
            origPoints: box.points.map((p) => [...p] as [number, number]),
          };
          return;
        }
      }

      // 选中矩形角点 → resize
      if (hit.handle && hit.boxId) {
        const box = boxes.find((b) => b.id === hit.boxId);
        dragRef.current = {
          mode: hit.handle as DragMode,
          boxId: hit.boxId,
          vertexIndex: -1,
          startX: sx, startY: sy,
          origBox: box ? { ...box } : null,
          origPoints: null,
        };
        return;
      }

      // 命中框 → 选中并准备移动
      if (hit.boxId) {
        onSelectBox?.(hit.boxId);
        const box = boxes.find((b) => b.id === hit.boxId);
        dragRef.current = {
          mode: 'move-box',
          boxId: hit.boxId,
          vertexIndex: -1,
          startX: sx, startY: sy,
          origBox: box ? { ...box } : null,
          origPoints: box?.points ? box.points.map((p) => [...p] as [number, number]) : null,
        };
        return;
      }

      // 空白区域 → 开始绘制
      if (drawTool === 'rectangle' && onAddBox) {
        onSelectBox?.(null);
        rectDrawRef.current = { isDrawing: true, startX: sx, startY: sy, curX: sx, curY: sy };
      } else if (drawTool === 'polygon' && onAddBox) {
        onSelectBox?.(null);
        polyDrawRef.current = { isDrawing: true, points: [[sx, sy]] };
      } else {
        onSelectBox?.(null);
      }
    },
    [readOnly, hitTest, boxes, onSelectBox, onAddBox, drawTool, render]
  );

  /* ── 鼠标事件：mousemove ── */
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;

      // 平移
      if (panRef.current.isPanning) {
        viewRef.current.offsetX = panRef.current.origOffsetX + (sx - panRef.current.startX);
        viewRef.current.offsetY = panRef.current.origOffsetY + (sy - panRef.current.startY);
        render();
        return;
      }

      // 矩形绘制
      if (rectDrawRef.current.isDrawing) {
        rectDrawRef.current.curX = sx;
        rectDrawRef.current.curY = sy;
        render();
        return;
      }

      // 多边形顶点拖拽 / 整体移动 / 矩形 resize
      if (dragRef.current.mode !== 'none' && dragRef.current.boxId) {
        const { mode, startX, startY, origBox, origPoints, vertexIndex } = dragRef.current;
        const { scale } = viewRef.current;
        const dx = (sx - startX) / scale;
        const dy = (sy - startY) / scale;

        if (mode === 'move-vertex' && origPoints && vertexIndex >= 0) {
          // 移动单个顶点
          const newPoints = origPoints.map((p, i) =>
            i === vertexIndex ? [p[0] + dx, p[1] + dy] as [number, number] : [...p] as [number, number]
          );
          const bbox = getBboxFromPoints(newPoints);
          onUpdateBox?.(dragRef.current.boxId!, {
            points: newPoints,
            x: bbox.x, y: bbox.y,
            width: bbox.width, height: bbox.height,
          });
        } else if (mode === 'move-box' && origBox) {
          // 整体平移
          if (origBox.shapeType === 'polygon' && origPoints) {
            const newPoints = origPoints.map((p) => [p[0] + dx, p[1] + dy] as [number, number]);
            onUpdateBox?.(dragRef.current.boxId!, {
              points: newPoints,
              x: origBox.x + dx, y: origBox.y + dy,
            });
          } else {
            onUpdateBox?.(dragRef.current.boxId!, { x: origBox.x + dx, y: origBox.y + dy });
          }
        } else if (origBox && origBox.shapeType === 'rectangle') {
          // 矩形 resize
          let newBox: Partial<IAnnotationBox> = {};
          switch (mode) {
            case 'resize-tl':
              newBox = {
                x: origBox.x + dx, y: origBox.y + dy,
                width: origBox.width - dx, height: origBox.height - dy,
              };
              break;
            case 'resize-tr':
              newBox = {
                y: origBox.y + dy,
                width: origBox.width + dx, height: origBox.height - dy,
              };
              break;
            case 'resize-bl':
              newBox = {
                x: origBox.x + dx,
                width: origBox.width - dx, height: origBox.height + dy,
              };
              break;
            case 'resize-br':
              newBox = { width: origBox.width + dx, height: origBox.height + dy };
              break;
          }
          if (newBox.width !== undefined && newBox.width < 2) newBox.width = 2;
          if (newBox.height !== undefined && newBox.height < 2) newBox.height = 2;
          onUpdateBox?.(dragRef.current.boxId!, newBox);
        }
        return;
      }

      if (readOnly) return;

      // 鼠标样式
      const hit = hitTest(sx, sy);
      if (hit.hitType === 'vertex') {
        canvas.style.cursor = 'move';
      } else if (hit.handle) {
        const map: Record<string, string> = {
          'resize-tl': 'nwse-resize', 'resize-br': 'nwse-resize',
          'resize-tr': 'nesw-resize', 'resize-bl': 'nesw-resize',
        };
        canvas.style.cursor = map[hit.handle] ?? 'default';
      } else if (hit.boxId) {
        canvas.style.cursor = 'move';
      } else if (drawTool === 'polygon' || drawTool === 'rectangle') {
        canvas.style.cursor = 'crosshair';
      } else {
        canvas.style.cursor = 'default';
      }
    },
    [render, hitTest, readOnly, onUpdateBox, drawTool]
  );

  /* ── 鼠标事件：mouseup ── */
  const handleMouseUp = useCallback(
    (_e: React.MouseEvent<HTMLCanvasElement>) => {
      if (panRef.current.isPanning) { panRef.current.isPanning = false; return; }

      if (rectDrawRef.current.isDrawing) {
        const { startX, startY, curX, curY } = rectDrawRef.current;
        rectDrawRef.current.isDrawing = false;
        const { scale } = viewRef.current;
        const imgP1 = screenToImage(startX, startY);
        const imgP2 = screenToImage(curX, curY);
        const w = Math.abs(imgP2.x - imgP1.x), h = Math.abs(imgP2.y - imgP1.y);
        if (w > 5 && h > 5 && onAddBox) {
          onAddBox({
            label: 'object',
            shapeType: 'rectangle',
            x: Math.min(imgP1.x, imgP2.x),
            y: Math.min(imgP1.y, imgP2.y),
            width: w,
            height: h,
          });
        }
        render();
        return;
      }

      if (dragRef.current.mode !== 'none') {
        dragRef.current.mode = 'none';
        dragRef.current.boxId = null;
        dragRef.current.origBox = null;
        dragRef.current.origPoints = null;
        dragRef.current.vertexIndex = -1;
      }
    },
    [onAddBox, render, screenToImage]
  );

  /* ── 双击：闭合多边形 ── */
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!polyDrawRef.current.isDrawing) return;
      if (readOnly) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const pts = polyDrawRef.current.points;
      if (pts.length < 3) {
        // 不足3个点，取消绘制
        polyDrawRef.current = { isDrawing: false, points: [] };
        render();
        return;
      }
      // 转成图片像素坐标
      const { scale } = viewRef.current;
      const imgPts: [number, number][] = pts.map((p) => {
        const img = screenToImage(p[0], p[1]);
        return [img.x, img.y];
      });
      const bbox = getBboxFromPoints(imgPts);
      polyDrawRef.current = { isDrawing: false, points: [] };
      onAddBox?.({
        label: 'object',
        shapeType: 'polygon',
        x: bbox.x, y: bbox.y,
        width: bbox.width, height: bbox.height,
        points: imgPts,
      });
      e.preventDefault();
      render();
    },
    [onAddBox, render, screenToImage]
  );

  /* ── 滚轮缩放 ── */
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const { scale, offsetX, offsetY } = viewRef.current;
      const newScale = Math.max(0.1, Math.min(10, scale * delta));
      viewRef.current.offsetX = sx - ((sx - offsetX) / scale) * newScale;
      viewRef.current.offsetY = sy - ((sy - offsetY) / scale) * newScale;
      viewRef.current.scale = newScale;
      render();
    },
    [render]
  );

  /* ── 键盘：删除 / 取消多边形绘制 / Esc ── */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (readOnly) return;
      if (e.key === 'Escape') {
        if (polyDrawRef.current.isDrawing) {
          polyDrawRef.current = { isDrawing: false, points: [] };
          render();
          return;
        }
        if (rectDrawRef.current.isDrawing) {
          rectDrawRef.current.isDrawing = false;
          render();
          return;
        }
        onSelectBox?.(null);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedBoxId && onDeleteBox) {
        // 避免在输入框内触发
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
        e.preventDefault();
        onDeleteBox(selectedBoxId);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [readOnly, selectedBoxId, onDeleteBox, onSelectBox, render]);

  useEffect(() => { render(); }, [boxes, render]);

  return (
    <div ref={containerRef} className="w-full h-full relative select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
      />
      {!imgLoaded && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground bg-background/50">
          加载中...
        </div>
      )}
    </div>
  );
}

/** 射线法判断点是否在多边形内（points 为图片坐标，需先转 scale） */
function pointInPolygon(
  testX: number, testY: number,
  points: [number, number][],
  scale: number
): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i][0] * scale, yi = points[i][1] * scale;
    const xj = points[j][0] * scale, yj = points[j][1] * scale;
    const intersect =
      yi > testY !== yj > testY &&
      testX < ((xj - xi) * (testY - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export default memo(AnnotationCanvas);
