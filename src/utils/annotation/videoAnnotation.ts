// 视频标注帧间插值工具 - 对矩形/多边形标注框做线性插值

import type {
  IAnnotationBox,
  IVideoFrameAnnotation,
  ITrackKeyframe,
  AnnotationShapeType,
} from '@/types/annotation';

/** 对单个跟踪目标的两个关键帧之间进行线性插值
 *  生成中间所有帧的标注框
 */
export function interpolateTrack(
  track: ITrackKeyframe
): Map<number, IAnnotationBox> {
  const result = new Map<number, IAnnotationBox>();
  const { startFrame, endFrame, startBox, endBox, shapeType, trackId, label } = track;

  if (endFrame <= startFrame) return result;

  for (let f = startFrame; f <= endFrame; f++) {
    const t = (f - startFrame) / (endFrame - startFrame);
    const box = interpolateBox(startBox, endBox, t, shapeType, trackId, label);
    result.set(f, box);
  }

  return result;
}

/** 单个标注框的线性插值 */
function interpolateBox(
  a: IAnnotationBox,
  b: IAnnotationBox,
  t: number,
  shapeType: AnnotationShapeType,
  trackId: string,
  label: string
): IAnnotationBox {
  const x = a.x + (b.x - a.x) * t;
  const y = a.y + (b.y - a.y) * t;
  const width = a.width + (b.width - a.width) * t;
  const height = a.height + (b.height - a.height) * t;

  let points: [number, number][] | undefined;
  if (shapeType === 'polygon' && a.points && b.points) {
    // 多边形插值：要求顶点数相同（简化：取较小数量，或用关键点）
    const n = Math.min(a.points.length, b.points.length);
    points = [];
    for (let i = 0; i < n; i++) {
      const ax = a.points[i][0] + (b.points[i][0] - a.points[i][0]) * t;
      const ay = a.points[i][1] + (b.points[i][1] - a.points[i][1]) * t;
      points.push([ax, ay]);
    }
  }

  return {
    id: `${trackId}_frame_${Math.round(t * 1000)}`,
    label,
    shapeType,
    x,
    y,
    width,
    height,
    points,
    color: a.color || b.color,
  };
}

/** 将所有 track 的插值结果合并到帧列表中
 *  返回按帧索引组织的完整标注
 */
export function mergeInterpolatedFrames(
  tracks: ITrackKeyframe[],
  totalFrames: number,
  frameWidth: number,
  frameHeight: number,
  fps: number
): IVideoFrameAnnotation[] {
  const frameMap = new Map<number, IAnnotationBox[]>();

  // 收集所有 track 的插值
  for (const track of tracks) {
    const interpolated = interpolateTrack(track);
    for (const [frameIdx, box] of interpolated) {
      if (!frameMap.has(frameIdx)) {
        frameMap.set(frameIdx, []);
      }
      frameMap.get(frameIdx)!.push(box);
    }
  }

  // 生成帧数组（只包含有标注的帧）
  const frames: IVideoFrameAnnotation[] = [];
  for (const [frameIdx, boxes] of frameMap) {
    frames.push({
      frameIndex: frameIdx,
      timestamp: frameIdx / fps,
      width: frameWidth,
      height: frameHeight,
      boxes,
    });
  }

  frames.sort((a, b) => a.frameIndex - b.frameIndex);
  return frames;
}

/** 检测两个多边形顶点数是否匹配，不匹配时使用最小外接矩形降级 */
export function canInterpolatePolygons(
  a: IAnnotationBox,
  b: IAnnotationBox
): boolean {
  if (a.shapeType !== 'polygon' || b.shapeType !== 'polygon') return false;
  if (!a.points || !b.points) return false;
  return a.points.length === b.points.length;
}

/** 生成帧时间戳映射表 */
export function generateFrameTimestampMap(
  totalFrames: number,
  fps: number
): { frameIndex: number; timestamp: number }[] {
  const map: { frameIndex: number; timestamp: number }[] = [];
  for (let i = 0; i < totalFrames; i++) {
    map.push({ frameIndex: i, timestamp: i / fps });
  }
  return map;
}
