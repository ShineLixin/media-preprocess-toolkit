# 多媒体图像预处理工具平台 - 需求拆解文档

## 产品概述

- **产品类型**: 纯前端多媒体数据处理工具平台
- **场景类型**: <scene_type>prototype-app</scene_type>
- **目标用户**: CV 算法工程师、数据标注员、多媒体内容处理从业者
- **核心价值**: 在浏览器本地完成图像/音视频与标注数据的预处理工作，无需后端服务器，保护数据隐私，开箱即用
- **界面语言**: 中文
- **主题偏好**: 浅色
- **导航模式**: 路径导航
- **导航布局**: Sidebar（左侧导航，平台型工具多模块切换）

---

## 页面结构总览

> **说明**：平台型工具，采用 Sidebar + 内容区布局。第一版 MVP 包含 1 个首页 + 2 个工具模块页，每个模块内以 Tab 形式组织子功能，不拆分独立路由页面（避免页面过多）。

| 页面名称 | 文件名 | 路由 | 页面类型 | 入口来源 |
|---------|-------|------|---------|---------|
| 平台首页 | `HomePage.tsx` | `/` | 一级 | 导航 |
| 标注辅助工具 | `AnnotationToolsPage.tsx` | `/annotation` | 一级 | 导航 |
| 多媒体批处理工具 | `MediaBatchPage.tsx` | `/media-batch` | 一级 | 导航 |

> **页面类型说明**：三个均为一级页面，直接出现在 Sidebar 导航中。模块内的子功能（格式互转/质检/预标注等）通过页内 Tab 切换，不单独成页。

---

## 页面布局建议

### 平台首页（`/`）

- **布局模式**: 单栏卡片网格布局
- **视觉重心**: 工具模块卡片展示，让用户快速找到所需工具
- **结果承载区**: 无（首页为导航入口页）；初始态直接展示所有工具模块卡片

### 标注辅助工具页（`/annotation`）

- **布局模式**: 左右分栏（主从布局），页顶 Tab 切换子功能
  - 格式互转 Tab：左侧上传区 + 文件列表，右侧预览区（图片 + 标注框叠加）
  - 标注质检 Tab：左侧上传区 + 质检配置，右侧质检报告 + 问题样本列表
  - 预标注 & 标注编辑 Tab：左侧图片列表 + 类别管理，中央画布区（标注绘制/复核），右侧属性面板
- **视觉重心**: 画布预览区（标注是核心交互，占最大面积）
- **结果承载区**: 右侧预览区 / 质检报告区 / 画布属性面板；初始态为空状态，提示上传文件或选择图片

### 多媒体批处理工具页（`/media-batch`）

- **布局模式**: 左右分栏（主从布局），页顶 Tab 切换子功能
  - 视频抽帧 Tab：左侧视频上传 + 参数配置，右侧抽帧结果缩略图列表 + 去重统计
  - 图片增强 Tab：左侧上传列表 + 参数调节，右侧原图/处理后对比预览
  - 裁剪缩放 Tab：左侧上传列表 + 参数配置，右侧预览 + 批量导出
  - 畸变校正 Tab：左侧上传 + 参数，右侧校正前后对比
  - OCR 识别 Tab：左侧上传图片，右侧识别结果表格 + 导出
- **视觉重心**: 右侧结果预览/对比区
- **结果承载区**: 右侧结果面板（缩略图列表 / 对比视图 / 结果表格）；初始态为空状态，提示上传文件

---

## 插件规划

本项目所有处理均在浏览器本地完成（用户明确要求"无需后端服务器，所有处理在浏览器本地完成"），OCR 使用 Tesseract.js 浏览器端库，预标注使用 ONNX/Transformers.js 或边缘检测算法，均为前端本地能力，**不涉及服务端 AI 插件**。

---

## 导航配置

- **导航布局**: Sidebar（左侧固定）
- **导航项**（仅一级页面）:

| 导航文字 | 路由 | 图标(可选) |
|---------|------|-----------|
| 首页 | `/` | Home |
| 标注辅助工具 | `/annotation` | Tag / Annotation |
| 多媒体批处理 | `/media-batch` | Picture / Video |

> 导航顶部放置平台 Logo/名称（如"MediaTool Kit"），底部可放版本号信息。后续新增工具模块直接在 Sidebar 追加即可。

---

## 数据来源声明

| 数据/操作 | 来源类型 | 实现要求 | mock 兜底 |
|---|---|---|---|
| 标注文件上传（VOC/COCO/YOLO/LabelMe） | real-file | `<input type="file" webkitdirectory>` 或多文件选择，FileReader 解析 XML/JSON/TXT | 初始 1-2 张示例图 + 对应标注文件（source='mock'） |
| 图片文件上传（标注/批处理） | real-file | File API + `URL.createObjectURL` / Image 对象加载 | 初始示例图片 1 张（source='mock'） |
| 视频文件上传（抽帧） | real-file | File API + `<video>` 元素 + canvas 抽帧 | 无（视频文件较大，不放 mock） |
| 标注框数据（绘制/编辑/保存） | local-persist | 当前会话内存 state + 可选 localStorage 草稿缓存 | 无 |
| 格式转换结果导出 | import-export | JSZip 打包 + Blob + `a.click` 下载 | 无 |
| 质检结果报告 | local-persist | 内存 state 生成，可导出 JSON | 无 |
| 图片批量处理结果导出 | import-export | JSZip 打包处理后图片 + Blob 下载 | 无 |
| OCR 识别结果 | real-plugin / 本地库 | 使用 Tesseract.js 浏览器端本地识别（非平台插件） | 失败提示（toast "OCR 模型加载失败"） |
| 预标注结果 | local-persist | 边缘检测/轮廓算法 或 ONNX 本地推理生成，内存存储 | 无 |
| 工具使用偏好（上次参数） | local-persist | localStorage 存储各工具参数配置 | 无 |

> **说明**：OCR 使用 Tesseract.js（纯前端本地运行），不属于平台 plugin 体系，故类型标记为本地库能力，兜底为加载失败提示。预标注 MVP 版本优先用边缘检测/轮廓算法实现（纯 canvas 本地计算），不依赖外部模型文件，确保首版即可跑通。

---

## 功能列表

### 页面: 平台首页（`HomePage.tsx`）

- **页面目标**: 展示平台所有工具模块，作为统一入口
- **功能点**:
  - **工具卡片展示**: 以卡片网格形式展示各工具模块（标注辅助工具、多媒体批处理），卡片含图标、名称、简短描述，点击跳转对应工具页
  - **平台简介**: 顶部 Hero 区域展示平台名称、核心理念（"纯前端、本地处理、隐私安全"）
  - **快速入口**: 可选最近使用工具快捷入口（localStorage 记录访问历史）

### 页面: 标注辅助工具（`AnnotationToolsPage.tsx`）

- **页面目标**: 提供 CV 数据集标注格式转换、质检、预标注及可视化编辑能力
- **页内 Tab**: 格式互转 / 标注质检 / 预标注 & 标注编辑
- **功能点**:

  **Tab 1 - 格式互转**:
  - **批量上传**: 支持上传图片文件夹 + 标注文件（VOC XML / COCO JSON / YOLO txt / LabelMe JSON），自动识别格式
  - **格式转换**: 选择目标格式，四种格式间双向批量转换，转换逻辑封装为独立 utils（VOC↔COCO↔YOLO↔LabelMe 坐标与类别映射）
  - **可视化校验**: 点击任意图片，在右侧预览区叠加显示标注框（不同类别不同颜色），支持缩放查看
  - **批量导出**: 转换后的标注文件 + 图片打包为 ZIP 下载

  **Tab 2 - 标注质检**:
  - **数据集上传**: 上传图片 + 标注文件，选择标注格式
  - **自动质检**: 前端规则检测 — 脏样本（标注文件缺失/图片损坏）、漏标（无标注框的图片）、标注框大小异常（面积过小/过大、宽高比异常）、类别错误（类别名不在预设类别列表中）
  - **质检报告**: 输出统计概览（总样本数、问题样本数、各类问题分布）+ 问题样本列表（可点击查看详情）
  - **报告导出**: 质检结果导出为 JSON

  **Tab 3 - 预标注 & 标注编辑**:
  - **图片加载与浏览**: 左侧图片列表，点击加载到中央画布
  - **标注绘制交互**: 基于 react-konva 或 canvas 实现矩形框绘制，支持拖拽调整大小/位置、删除标注框
  - **类别编辑**: 右侧属性面板编辑选中标注框的类别，支持类别列表管理（新增/删除类别）
  - **预标注生成**: MVP 用边缘检测(Canny) + 轮廓提取算法生成候选矩形框占位，用户一键采纳/调整
  - **标注保存/导出**: 单张或批量导出为选定格式（VOC/COCO/YOLO/LabelMe）

### 页面: 多媒体批处理工具（`MediaBatchPage.tsx`）

- **页面目标**: 提供视频抽帧、图片批量增强、裁剪缩放、畸变校正、OCR 识别等多媒体批处理能力
- **页内 Tab**: 视频抽帧 / 图片增强 / 裁剪缩放 / 畸变校正 / OCR 识别
- **功能点**:

  **Tab 1 - 视频抽帧 + 去重**:
  - **视频上传**: 支持上传本地视频文件，显示视频基本信息（时长、分辨率、帧率）
  - **抽帧配置**: 设置抽帧间隔（秒/帧间隔），可选起止时间范围
  - **帧提取**: 利用 `<video>` + canvas `drawImage` 逐帧提取为 ImageData
  - **感知哈希去重**: 计算每帧 pHash/dHash，汉明距离阈值判定重复帧，自动去重
  - **结果展示与导出**: 展示去重前后帧数对比、缩略图列表，支持批量导出为 ZIP

  **Tab 2 - 图片批量增强**:
  - **批量上传**: 支持多图上传，左侧文件列表
  - **参数调节**: 亮度、对比度、饱和度、锐化、降噪滑块调节，实时预览效果
  - **对比预览**: 左右分屏对比原图与处理后效果（拖动分割线）
  - **批量应用与导出**: 参数应用到所有图片，批量导出处理后图片为 ZIP

  **Tab 3 - 图片批量裁剪/缩放/格式转换**:
  - **批量上传**: 多图上传 + 列表管理
  - **裁剪配置**: 固定尺寸 / 比例裁剪，可选居中裁剪或自定义区域（单图预览时可拖选）
  - **缩放配置**: 按百分比 / 固定宽高 / 长边等多种缩放模式
  - **格式转换**: 支持 JPG / PNG / WebP 格式互换，可调质量
  - **批量导出**: 打包下载

  **Tab 4 - 畸变校正（基础）**:
  - **图片上传**: 单图或批量上传
  - **校正参数**: 桶形/枕形畸变系数滑块，实时预览校正效果
  - **批量应用**: 参数应用到全部图片，批量导出

  **Tab 5 - OCR 固定版式识别**:
  - **图片上传**: 上传票据/文档图片
  - **Tesseract.js 集成**: 浏览器端加载中文+英文识别模型，本地 OCR 识别
  - **固定版式字段提取**: MVP 支持简单模板（用户可在图上拖拽选择区域并命名字段），识别后按区域提取文本填充到结果表格
  - **结果导出**: 识别结果导出为 JSON / CSV

---

## 数据共享配置

| 存储键名 | 数据说明 | 使用页面 |
|---------|---------|---------|
| `__global_mediatool_recentTools` | 最近使用的工具记录，类型 `string[]`（路由路径数组） | 首页 |
| `__global_mediatool_categoryList` | 全局类别列表，类型 `string[]` | 标注辅助工具页（各 Tab 共享） |
| `__global_mediatool_annotationDraft` | 标注编辑草稿，类型 `IAnnotationDraft` | 标注辅助工具页（刷新恢复） |

```ts
interface IAnnotationBox {
  id: string;
  label: string;
  x: number;      // 左上角 x（相对图片像素坐标）
  y: number;      // 左上角 y
  width: number;
  height: number;
  color?: string;
}

interface IAnnotationImage {
  id: string;
  name: string;
  url: string;    // objectURL 或 base64
  width: number;
  height: number;
  boxes: IAnnotationBox[];
  format: 'voc' | 'coco' | 'yolo' | 'labelme';
}

interface IAnnotationDraft {
  images: IAnnotationImage[];
  currentImageId: string | null;
  categories: string[];
}
```

---

## 技术选型建议（供实现参考）

- **框架**: React 18 + TypeScript + Vite
- **UI 组件库**: Ant Design 5（Sidebar Layout、Table、Upload、Slider、Tabs、Modal 等开箱即用）
- **路由**: React Router v6
- **标注画布**: react-konva（比 fabric.js 更贴合 React 心智，矩形框绘制/拖拽/选中成熟）
- **图片处理**: Canvas API 原生 + `browser-image-compression`（压缩） + `pica`（高质量缩放，可选）
- **感知哈希**: 自实现 pHash/dHash（基于 canvas 像素采样 + 离散余弦变换简化版）
- **OCR**: `tesseract.js` v5（浏览器端 Web Worker 识别）
- **视频抽帧**: 原生 `<video>` + `canvas.drawImage` + `requestVideoFrameCallback`
- **文件打包**: `jszip`
- **XML 解析**: 原生 `DOMParser` / `XMLSerializer`
- **边缘检测**: 自实现 Canny 边缘检测 + `findContours`（基于 canvas ImageData，MVP 可用简化版）
- **状态管理**: React Context + useReducer（轻量够用，无需 Redux）
- **代码组织**: 按功能模块分包（`src/pages/annotation/`、`src/pages/media-batch/`、`src/utils/` 下按领域分子目录），便于后续新增模块

---

## 项目目录结构建议（供 Code Agent 参考）

```
src/
├── components/          # 通用组件
│   ├── Layout/          # Sidebar + Header 布局
│   ├── ImageCanvas/     # 通用图片画布（可复用标注预览）
│   └── FileUploader/    # 通用文件上传组件
├── pages/
│   ├── Home/            # 首页
│   ├── Annotation/      # 标注辅助工具
│   │   ├── tabs/
│   │   │   ├── FormatConvertTab.tsx
│   │   │   ├── QualityCheckTab.tsx
│   │   │   └── PreAnnotateTab.tsx
│   │   └── utils/       # 格式转换、质检算法
│   └── MediaBatch/      # 多媒体批处理
│       ├── tabs/
│       │   ├── VideoFrameTab.tsx
│       │   ├── ImageEnhanceTab.tsx
│       │   ├── CropResizeTab.tsx
│       │   ├── DistortionTab.tsx
│       │   └── OCRTab.tsx
│       └── utils/       # 图片处理、哈希、OCR 封装
├── utils/
│   ├── annotation/      # 标注格式解析与转换（voc/coco/yolo/labelme）
│   ├── image/           # 通用图片处理函数
│   ├── hash/            # 感知哈希算法
│   └── file/            # 文件下载、ZIP 打包等
├── types/               # 全局 TypeScript 类型定义
├── hooks/               # 自定义 hooks
├── App.tsx
├── main.tsx
└── router.tsx

-------

<scene_type>prototype-app</scene_type>

# UI 设计指南

## 1. 设计推导依据

- **参考意图**: Free Direction —— 用户仅给出功能需求与技术栈，无视觉参考，自主建立视觉系统。
- **核心情绪 / 应用类型**: 面向计算机视觉与多媒体从业者的浏览器本地工具集，强调精准、克制、可信赖、高密度信息可操作。
- **独特记忆点**: 画布周边的细刻度描边 + 琥珀色标注框作为工具语义锚点，区别于通用 SaaS 蓝。

## 2. Art Direction

- **方向名**: 精密工作台
- **Design Style**: Swiss Minimalist + Light Toolkit —— 网格秩序、中性基底、单色强调；功能优先，装饰压到最低。
- **DNA 参数**: 圆角 subtle (`rounded-md`) / 阴影 subtle (`shadow-sm`) / 间距 compact → standard (`gap-3`/`p-4` 起) / 字体方向 无衬线+等宽混排 / 装饰手法 细刻度线、单像素边框、低饱和琥珀强调。
- **应用类型**: Tool —— 左侧导航 + 右侧工作区，画布与控制面板左右分栏。

## 3. Color System

**色彩关系**: 冷灰工作台底 + 深墨正文 + 琥珀色主交互（标注框/CTA/激活态）+ 极浅灰反馈底。
**配色设计理由**: 冷灰背景降低长时间注视疲劳；深墨正文保证高密度可读性；琥珀色作为标注工具的语义色（与常见 BBox 可视化黄/橙一致），同时区别于默认 SaaS 蓝；accent 用近中性灰承接 hover 与选中，不抢主行动。
**主色推导**: 从"标注框/选框"这一核心交互语义出发，选取低饱和琥珀橙作为 primary，既呼应计算机视觉领域 BBox 的传统可视化色彩，又保持工具的专业克制感，避免高饱和橙的告警气质。
**使用比例**: 65% 中性 / 28% 辅助 / 7% primary；primary 仅用于主按钮、激活 tab、标注框选中态、关键进度；其余交互反馈交由 accent 与 border。

| 角色 | CSS 变量 | Tailwind Class | HSL 值 | 设计说明 |
|---|---|---|---|---|
| bg | `--background` | `bg-background` | hsl(210 14% 96%) | 页面工作台背景，冷调浅灰 |
| card | `--card` | `bg-card` | hsl(0 0% 100%) | 卡片、面板、表单承载面 |
| text | `--foreground` | `text-foreground` | hsl(215 25% 15%) | 标题与正文，深墨灰 |
| textMuted | `--muted-foreground` | `text-muted-foreground` | hsl(215 12% 45%) | 辅助说明、占位符、元信息 |
| primary | `--primary` | `bg-primary` / `text-primary` | hsl(28 90% 50%) | 琥珀橙，主交互与标注语义色 |
| primaryForeground | `--primary-foreground` | `text-primary-foreground` | hsl(30 40% 98%) | primary 上的文字，奶白 |
| accent | `--accent` | `bg-accent` | hsl(210 12% 92%) | hover/focus 浅底、选中底、骨架屏 |
| accentForeground | `--accent-foreground` | `text-accent-foreground` | hsl(215 20% 25%) | accent 上的文字与图标 |
| border | `--border` | `border-border` | hsl(210 10% 85%) | 输入框、卡片、菜单边界 |

**语义色提示**:
- 成功: hsl(142 55% 38%) —— bg hsl(142 50% 94%) / border hsl(142 45% 80%) / text hsl(142 60% 28%)；饱和度与 primary 对齐，偏冷绿
- 警告: hsl(42 90% 55%) —— bg hsl(45 90% 94%) / border hsl(42 85% 75%) / text hsl(35 80% 30%)；与 primary 同色系偏亮
- 错误: hsl(0 75% 55%) —— bg hsl(0 70% 95%) / border hsl(0 65% 80%) / text hsl(0 70% 40%)；饱和度略低于 primary，避免刺眼

## 4. 字体与节奏

- **font-display**: IBM Plex Sans —— 字形紧凑、数字与符号辨识度高，适合工具产品标题与数据展示。
- **font-body**: Noto Sans SC —— 中文正文清晰，长时间阅读低疲劳；代码/路径/类别名用 IBM Plex Mono 内联。
- **字号**: H1 text-3xl；H2 text-xl；body text-sm ~ text-base；muted text-xs ~ text-sm。
- **圆角**: 中 —— `rounded-md` 为主，按钮与卡片统一；画布与工具面板用 `rounded-none` 到 `rounded-sm` 强化精密感。

## 5. 全局布局契约

- **Reference Layout Use**: 按需求结构推导
- **Page / Section Order**: 首页工具导航 → 标注辅助模块（格式互转 / 标注质检 / 预标注辅助）→ 多媒体批处理模块（抽帧去重 / 批量增强 / 裁剪缩放 / 畸变校正 / OCR）
- **Standard Content Zone**: Tool max-w-[1400px] + `mx-auto`；工具工作区可扩展至视口宽度。
- **Shell / Frame Alignment**: 左侧导航 240px 固定，内容区独立滚动；画布类页面内容区占满剩余视口宽度。
- **Padding & Rhythm**: `px-4 md:px-6 py-4 md:py-6`，垂直节奏 8px 倍数，工具面板内部 `gap-3`。
- **Full-bleed Zones**: 标注画布、视频预览、图片对比区可占满内容区宽度，不受 max-w 限制。
- **Local Narrowing**: 设置表单、质检报告正文可局部收窄至 `max-w-3xl`。
- **Overflow Strategy**: 文件列表、类别表格、时间轴使用 `overflow-x-auto`；画布区支持缩放平移。
- **Flexibility Boundary**: 允许移动端导航折叠为顶部栏、画布全屏；不允许改变主色、圆角语言和卡片阴影强度。

## 6. 视觉与动效

- **装饰**: 细刻度描边、单像素分割线、极轻网格底纹（仅画布区）
- **阴影/边界**: 轻 —— 面板 `shadow-sm` + 1px border；弹窗 `shadow-md`；画布无阴影
- **动效**: 克制 —— hover 背景色过渡 150ms；按钮按下轻微缩放；画布标注框选中有 2px 描边动画；避免淡入淡出等装饰性动效

## 7. 组件原则

- 按钮、输入、下拉、复选框必须有 Default / Hover / Active / Focus-visible / Disabled 五态。
- Primary 按钮仅用于"开始转换""导出""保存标注"等关键行动；次级操作用 outline + border。
- 工具 tab 用 accent 底表示选中，不用 primary 填充；侧边导航当前项用左侧 3px primary 竖条 + 文字加粗。
- 空状态、加载态、错误态用同色系插画/图标，保持中性克制，不引入额外品牌色。

## 8. Image Direction

- **Image Role**: 无强制图片需求，优先通过排版、刻度描边和标注框语义建立视觉记忆点。
- **Image Art Direction**: 无强制图片需求；若后续需 Hero 图或模块封面，采用"深色工作台 + 叠层标注框 + 细网格"的近景特写风格。
- **Image Prompt Keywords**: 无
- **Image Avoidance**: 无

## 9. Anti-patterns

- **Split personality**: 首页用卡片大圆角、工具页用直角；全站统一 `rounded-md` 基础语言。
- **Default SaaS drift**: 回到默认蓝色主按钮 + 紫色渐变 hero；坚持琥珀色标注语义 + 冷灰工作台。
- **Primary everywhere**: 主按钮、tab、icon、边框、链接全用 primary；按 65-28-7 比例收紧 primary 用量。
- **Canvas chaos**: 标注画布堆叠渐变、阴影、装饰；画布保持纯白/浅灰底 + 细边框 + 极简控件。
- **Invisible interaction**: 只做 hover 不做 focus-visible；每个可交互元素都有键盘可见轮廓。
- **Status color overload**: 成功/警告/错误色饱和度过高喧宾夺主；语义色饱和度与 primary 对齐 ±15%。