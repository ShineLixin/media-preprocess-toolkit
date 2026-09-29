import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Tags, PictureInPicture2, Shield, Zap, Layers, ArrowRight, Music } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const FEATURES = [
  {
    icon: Shield,
    title: '本地处理',
    desc: '所有计算在浏览器本地完成，数据不出设备，保障隐私安全',
  },
  {
    icon: Zap,
    title: '即开即用',
    desc: '无需安装任何软件，打开网页即可使用，支持部署为公开站点',
  },
  {
    icon: Layers,
    title: '模块化设计',
    desc: '工具模块化组织，可按需扩展新增功能，结构清晰易维护',
  },
];

const TOOLS = [
  {
    path: '/annotation',
    icon: Tags,
    title: '标注辅助工具',
    desc: 'CV 数据集格式互转、统计分析、数据增强、切分、质检、AI 自动标注、多边形编辑器、视频标注插值、版本管理、语义检索',
    color: 'from-blue-500/10 to-cyan-500/10',
    iconColor: 'text-blue-600',
    features: [
      'VOC / COCO / YOLO / LabelMe 格式互转（含多边形）',
      'AI 模型自动标注 · 边缘检测回退 · 本地缓存',
      '多边形分割标注 · 顶点拖拽 · 整体平移',
      '数据增强（标注同步）· 数据集切分',
      '视频标注 · 帧间线性插值 · 逐帧微调',
      '数据集版本管理 · 快照 · 版本对比',
      '语义检索 · 文件名/类别/属性多条件过滤',
      '批量质检 · 可视化标注编辑器',
    ],
  },
  {
    path: '/media-batch',
    icon: PictureInPicture2,
    title: '多媒体批处理',
    desc: '视频抽帧去重/截取/GIF、图片批量增强/水印/重命名、裁剪缩放格式转换、OCR 识别',
    color: 'from-purple-500/10 to-pink-500/10',
    iconColor: 'text-purple-600',
    features: [
      '视频抽帧去重 · 截取片段 · 转 GIF · 倍速预览',
      '文字/图片水印 · 9 种位置 · 平铺 · 旋转',
      '批量重命名 · 前缀/后缀/序号/原名组合',
      '图片增强 / 裁剪 / 缩放 / JPG·PNG·WebP·AVIF',
      'OCR 表格识别 · 固定版式模板 · 批量导出',
    ],
  },
  {
    path: '/audio',
    icon: Music,
    title: '音频工具',
    desc: '波形可视化、音频裁剪、音量归一化、简易降噪、格式转换、批量处理，Web Audio API 纯本地处理',
    color: 'from-orange-500/10 to-amber-500/10',
    iconColor: 'text-orange-600',
    features: [
      '波形可视化 · 时间缩放 · 点击定位播放',
      '选区裁剪 · Shift 拖拽选择片段',
      '峰值 / RMS 双模式音量归一化',
      '高通/低通滤波 · 噪声门限降噪',
      'WAV / OGG 格式转换 · 批量处理',
    ],
  },
];

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-16">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="rounded-2xl bg-gradient-to-br from-primary/5 via-background to-secondary/10 border border-border/50 p-8 md:p-12"
      >
        <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4">
              <Shield className="size-3.5" />
              v1.3.0 P2 · 纯前端 · 本地处理 · 零服务器依赖
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
              多媒体图像音频预处理工具平台
            </h1>
            <p className="text-muted-foreground text-base md:text-lg leading-relaxed mb-6">
              面向 CV 算法工程师、多媒体内容从业者和音视频创作者的浏览器端工具箱。
              支持标注格式互转、数据集质检、视频抽帧去重、图片批量增强、OCR 识别、
              音频波形处理与降噪等能力，全部在本地运行，数据不上传。
            </p>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" onClick={() => navigate('/annotation')}>
              开始使用
              <ArrowRight className="size-4 ml-1" />
            </Button>
            <Button size="lg" variant="secondary" onClick={() => navigate('/media-batch')}>
              多媒体批处理
            </Button>
            <Button size="lg" variant="secondary" onClick={() => navigate('/audio')}>
              音频工具
            </Button>
          </div>
        </div>
      </motion.section>

      {/* 特性 */}
      <section>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 + i * 0.1 }}
            >
              <Card className="h-full border-border/50">
                <CardHeader>
                  <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                    <f.icon className="size-5 text-primary" />
                  </div>
                  <CardTitle className="text-base">{f.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{f.desc}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* 工具模块 */}
      <section>
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">工具模块</h2>
            <p className="text-sm text-muted-foreground mt-1">
              选择一个工具开始使用，后续将持续扩展更多能力
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {TOOLS.map((tool, i) => {
            const Icon = tool.icon;
            return (
              <motion.div
                key={tool.path}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 + i * 0.1 }}
                whileHover={{ y: -4 }}
              >
                <Card
                  className={`h-full cursor-pointer hover:shadow-md transition-all border-border/50 bg-gradient-to-br ${tool.color}`}
                  onClick={() => navigate(tool.path)}
                >
                  <CardHeader>
                    <div className="flex items-start gap-3">
                      <div className="size-11 rounded-lg bg-card border border-border/60 flex items-center justify-center shrink-0">
                        <Icon className={`size-5 ${tool.iconColor}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg mb-1">{tool.title}</CardTitle>
                        <CardDescription className="text-sm">{tool.desc}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {tool.features.map((feat) => (
                        <li key={feat} className="text-sm text-muted-foreground flex items-center gap-2">
                          <span className="size-1.5 rounded-full bg-primary shrink-0" />
                          {feat}
                        </li>
                      ))}
                    </ul>
                    <Button variant="ghost" className="mt-4 w-full justify-between" size="sm">
                      进入工具
                      <ArrowRight className="size-4" />
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* 底部说明 */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.6 }}
        className="text-center text-xs text-muted-foreground pb-4"
      >
        <p>本工具平台完全在浏览器本地运行，不收集任何用户数据 · 开源可部署</p>
      </motion.section>
    </div>
  );
}
