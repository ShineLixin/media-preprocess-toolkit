# 多媒体预处理工具平台（Media Preprocessing Toolkit）

> 纯浏览器前端的多媒体图像 / 音视频与数据预处理工具平台。**无需后端服务器，所有处理均在浏览器本地完成**，数据不上传，可部署为公开网页供他人访问使用。

当前版本：**v1.3.0 (P2)**

---

## 目录

- [功能总览](#功能总览)
- [技术栈](#技术栈)
- [环境要求](#环境要求)
- [安装与运行](#安装与运行)
- [使用指南](#使用指南)
- [本地部署](#本地部署)
- [部署为公网网站](#部署为公网网站)
- [GitHub Pages 自动部署](#github-pages本仓库已配置自动部署)
- [常见问题（FAQ）](#常见问题faq)
- [版本记录](#版本记录)

---

## 功能总览

### 模块一：标注辅助工具（CV 计算机视觉数据集方向）

| 子功能 | 说明 |
|---|---|
| **格式互转** | VOC XML ↔ COCO JSON ↔ YOLO txt ↔ LabelMe JSON 四种格式双向批量转换；上传标注文件自动识别格式，可视化叠加框预览校验，批量导出 ZIP |
| **标注质检** | 自动检测漏标、标注框大小异常、宽高比异常、未知类别，输出质检报告（统计概览 + 问题分布 + 明细表） |
| **数据集统计** | 概览卡片（图片数 / 标注框数 / 类别数 / 平均每图目标数）+ 类别分布、框面积直方图、宽高比分布、每图目标数分布图，支持类别筛选 |
| **数据增强（标注同步）** | 水平/垂直翻转、90°/180°/270°/任意角度旋转、亮度/对比度/饱和度、高斯模糊、随机噪声共 8 种变换；标注框坐标自动同步更新；可见度阈值过滤；批量预览 + ZIP 导出 |
| **数据集切分** | train / val / test 按比例切分，支持随机种子与按类别分层采样；导出 YOLO 目录结构（含 data.yaml）或 COCO 单文件 JSON |
| **模型自动标注** | 浏览器端轻量目标检测模型推理（权重按需下载 + 本地缓存），候选框进复核画布；失败自动回退边缘检测方案；支持 AI 模型 / 边缘检测双模式 |
| **单图标注 / 复核编辑** | 矩形 + 多边形（分割）双模式：绘制、拖拽顶点、双击闭合、删除、平移；类别管理与属性编辑；导出兼容 LabelMe points / COCO segmentation / VOC·YOLO 最小外接矩形 |
| **视频标注（帧间插值跟踪）** | 逐帧浏览标注；起止关键帧标注同一目标后一键生成中间帧线性插值框；逐帧导出 YOLO 格式 + 帧时间戳映射表 |
| **数据集版本管理** | 版本快照本地保存（含 pipeline 参数，结果可复现）；版本列表、双版本差异对比（新增/删除图片、标注变化、类别分布）、历史版本导出 |
| **语义检索** | 文件名关键词 + 类别 + 标注框数量 / 面积 / 宽高比区间多条件组合检索；网格展示，一键导出命中图片与标注 |

### 模块二：多媒体批处理工具

| 子功能 | 说明 |
|---|---|
| **视频抽帧 + 去重** | 按间隔抽帧，基于 dHash 感知哈希自动去除重复 / 近似帧；实时进度与统计 |
| **视频截取 / 转 GIF / 倍速** | 起止时间截取片段（本地编码导出）；视频转 GIF（起止时间 / 帧率 / 宽度）；0.5x–2x 倍速预览；抽帧结果网格预览（大图 / 单帧 / 批量下载） |
| **图片批量增强** | 亮度 / 对比度 / 饱和度 / 锐化 / 降噪调节；左右并列与滑动对比预览；批量 ZIP 导出 |
| **裁剪 / 缩放 / 格式转换** | 可视化拖拽裁剪框；等比缩放（contain / cover / stretch）；输出 JPG / PNG / WebP / AVIF（按浏览器能力） |
| **水印叠加** | 文字水印（内容 / 字号 / 颜色 / 透明度 / 位置 / 旋转）+ 图片水印（上传 / 透明度 / 位置 / 缩放）；9 种位置 + 平铺 |
| **批量重命名** | 前缀、后缀、起始序号、序号位数、保留原文件名等组合模板 |
| **畸变校正（基础）** | 径向畸变模型（k1 / k2），桶形 / 枕形校正，预设方案快速应用 |
| **OCR 识别** | tesseract.js 浏览器端本地识别；中英日多语言；单图 / 批量双模式；可视化框选版式模板（固定版式票据识别）；表格识别（行列聚类 → 表格预览 + 单元格修正）；CSV / JSON 导出 |

### 模块三：音频工具（P2 新增）

| 子功能 | 说明 |
|---|---|
| **波形可视化** | Canvas 波形渲染，时间缩放（1–8x）、点击定位播放、播放速度调节 |
| **音频裁剪** | Shift + 拖拽选区，实时同步参数 |
| **音量归一化** | 峰值 / RMS 双模式，目标响度可调，处理前后响度对比 |
| **简易降噪** | 高通 / 低通滤波 + 噪声门限三级可调，处理前后试听对比 |
| **格式转换** | WAV / OGG（按浏览器能力动态显示支持项） |
| **批量处理** | 多文件应用同一处理链（裁剪 / 归一化 / 降噪 / 转格式），ZIP 批量导出 |

---

## 技术栈

| 项 | 版本 | 说明 |
|---|---|---|
| React | 19.x | UI 框架 |
| TypeScript | ~5.9 | 类型系统 |
| Vite | 8.x | 构建工具（Rolldown 内核） |
| React Router | 7.x | 路由 |
| Tailwind CSS | 4.x | 原子化 CSS |
| shadcn/ui | new-york | UI 组件库（Radix 基础） |
| tesseract.js | 7.x | 浏览器端 OCR |
| jszip | 3.10.x | ZIP 打包导出 |
| echarts / recharts | 6.x / 2.15.x | 图表可视化 |

> 纯前端静态应用，**无后端依赖**，所有处理（图片 / 视频 / 音频 / OCR / 标注）均在浏览器本地完成。

---

## 环境要求

| 项 | 要求 |
|---|---|
| Node.js | **≥ 20.19**（推荐 20 LTS 或 22 LTS；**Node 18 不可用**，Rolldown 需要 `styleText` API） |
| npm | ≥ 9 |
| 浏览器 | Chrome / Edge 100+、Firefox 100+、Safari 16+（不支持 IE） |

---

## 安装与运行

```bash
# 1. 安装依赖（务必带上 optional，否则 Rolldown 原生 binding 可能缺失）
npm install --include=optional

# 2. 开发模式（默认端口 5173）
npm run dev
# 浏览器访问 http://localhost:5173

# 3. 生产构建（平台部署用）
npm run build
# 产物输出：dist/output/（平台部署上传此目录）

# 4. 本地预览（直接预览 Vite 原始产物，不经过 scripts/build.sh 的平台目录拆解）
npx vite build --outDir dist/client && npx vite preview --outDir dist/client
# 浏览器访问 http://localhost:4173
```

构建产物结构：

```
dist/
├── output/                    # 主 HTML + 资源（部署上传此目录）
│   ├── index.html
│   └── assets/                # JS / CSS / 静态资源
├── output_resource/           # 资源文件
├── output_static/             # 静态文件
└── output_capabilities/       # 能力声明
```

---

## 使用指南

### 1. 格式互转（VOC / COCO / YOLO / LabelMe）

1. 进入「标注辅助工具 → 格式互转」
2. 上传标注文件（单文件或多文件，格式自动识别）
3. 选择目标格式 → 点击转换
4. 在预览区点击图片查看叠加的标注框，核对坐标与类别
5. 导出 ZIP

### 2. 数据增强（标注同步）

1. 进入「标注辅助工具 → 数据增强」
2. 上传图片 + 对应标注文件（VOC / COCO / YOLO / LabelMe 均可）
3. 勾选需要的变换（翻转 / 旋转 / 颜色 / 模糊 / 噪声），设置每张增强数量与可见度阈值
4. 预览增强结果（标注框已同步变换）
5. 导出 ZIP（保留原标注格式）

### 3. 数据集切分

1. 进入「标注辅助工具 → 数据集切分」
2. 设置 train / val / test 比例与随机种子（可选分层采样）
3. 生成后查看切分统计（饼图 + 类别分布对比）
4. 导出：YOLO 目录结构（images/ labels/ + data.yaml）或 COCO 单文件 JSON

### 4. 模型自动标注与人工复核

1. 进入「标注辅助工具 → 预标注」，选择「AI 模型」模式
2. 首次使用自动下载模型权重（可本地缓存，之后离线可用）
3. 上传图片 → 推理生成候选框（含进度与统计）
4. 在复核画布中增删改框、调整类别 → 导出
5. 模型加载失败时自动回退「边缘检测」模式

### 5. 单图标注 / 多边形绘制

- 矩形模式：拖拽绘制，拖动调整，选中删除
- 多边形模式：点击打点 → 双击闭合；拖拽顶点微调；Delete 删除顶点；整体平移
- 导出时 VOC / YOLO 自动取最小外接矩形，LabelMe / COCO 保留完整多边形

### 6. 视频抽帧 / 截取 / 转 GIF

1. 「多媒体批处理 → 视频处理」上传视频
2. 抽帧：设置间隔秒数 → 抽取 → dHash 自动去重 → 网格预览（点击看大图、单帧 / 批量下载）
3. 截取：拖动起止时间 → 导出片段（WebM）
4. 转 GIF：设置起止时间 / 帧率 / 宽度 → 导出

### 7. 图片批量处理（增强 / 水印 / 裁剪 / 格式）

1. 「多媒体批处理 → 图片处理」上传多张图片
2. 选择处理项：增强参数（亮度 / 对比度 / 饱和度 / 锐化 / 降噪）、水印（文字 / 图片）、裁剪框、缩放模式、目标格式、重命名规则
3. 对比预览（原图 vs 处理后）→ 批量导出 ZIP

### 8. OCR（单图 / 批量 / 版式模板 / 表格）

1. 「多媒体批处理 → OCR」上传图片
2. 单图模式：选择语言（中 / 英 / 日）→ 识别 → 复制 / 导出
3. 批量模式：多张图片共用同一版式字段模板 → 表格汇总 → 单元格修正 → 导出 CSV / JSON
4. 版式模板：在图片上拖拽框选字段区域并命名，保存后用于固定版式票据识别（更快更准）
5. 表格识别：对含表格图片自动结构化 → 表格预览 → 修正 → 导出

### 9. 音频工具

1. 进入「音频工具」模块，上传 WAV / MP3 / M4A / OGG
2. 波形区：缩放（1–8x）、点击定位、调速播放
3. 处理链：裁剪（Shift 拖选）→ 归一化（峰值 / RMS）→ 降噪（高通 / 低通 / 门限）→ 格式转换
4. 批量处理：多文件应用同一处理链 → ZIP 导出

### 10. 视频标注（帧间插值）

1. 「标注辅助工具 → 视频标注」上传视频
2. 逐帧浏览（帧步进 / 播放 / 跳转）
3. 在起始帧与结束帧对同一目标（ID 关联）分别标注
4. 一键插值生成中间帧标注，逐帧微调
5. 导出：逐帧 YOLO 标注 + 帧时间戳映射表

### 11. 版本管理与语义检索

- 版本管理：保存当前数据集快照（自动记录增强 / 切分配置）→ 查看版本列表 → 对比两版本差异 → 从历史版本导出
- 语义检索：组合条件（文件名 / 类别 / 框数量 / 面积 / 宽高比）→ 网格结果 → 导出命中项

---

## 本地部署

### Ubuntu（Nginx）

```bash
# 构建
npm install --include=optional && npm run build

# 安装 Nginx
sudo apt update && sudo apt install nginx -y

# 创建站点目录并上传 dist/output/ 内容
sudo mkdir -p /var/www/mediatool
# 将 dist/output/ 下所有文件上传到 /var/www/mediatool/
```

创建 `/etc/nginx/sites-available/mediatool`：

```nginx
server {
    listen 80;
    server_name your-domain.com;          # 改成你的域名 / IP
    root /var/www/mediatool;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;
    gzip_min_length 1024;

    location / {
        try_files $uri $uri/ /index.html;   # SPA 路由回退
    }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/mediatool /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### Windows

- 开发：`npm install --include=optional && npm run dev` → `http://localhost:5173`
- 临时托管（最简单）：进入构建产物目录执行 `python -m http.server 8080` → `http://localhost:8080`
- 长期托管：Nginx for Windows（配置同上）或 IIS（需 URL Rewrite 实现 SPA 回退）

> **不要直接双击 index.html**：`file://` 协议下 Web Worker、Tesseract OCR、AudioContext、Blob URL 等会因跨域 / API 限制不可用，必须走本地静态服务器。

---

## 部署为公网网站

| 平台 | 特点 | 免费额度 |
|---|---|---|
| Vercel | 自动部署、全球 CDN、HTTPS | 个人免费 |
| Netlify | 拖拽上传即可 | 个人免费 |
| Cloudflare Pages | 速度快 | 免费 |
| GitHub Pages | 绑定仓库自动部署 | 免费 |

上传 `dist/output/` 目录内容即可。**公网必须 HTTPS**：`AudioContext` 等 API 在非 localhost 的 HTTP 环境下会被浏览器禁用。

---

## GitHub Pages（本仓库已配置自动部署）

本仓库 `main` 分支已配置 GitHub Actions 自动部署到 GitHub Pages，推送即上线：

- 工作流：`.github/workflows/deploy-pages.yml`
- 访问地址：<https://shinelixin.github.io/media-preprocess-toolkit/>
- 触发方式：推送到 `main` 分支；或在仓库 Actions 页面手动 `Run workflow`

### 为什么不能直接用 `npm run build` 的产物

`npm run build`（`scripts/build.sh`）产出的是**妙搭平台部署产物**，依赖平台运行时：

| 依赖项 | 说明 |
|---|---|
| `{{appName}}` / `{{appDescription}}` / `{{appAvatar}}` 占位符 | 由部署运行时（vefaas）调平台 API 拿应用信息后做 HBS 替换；脱离平台会原样显示 `{{appName}}` |
| slardar 埋点 + viewContext | 注入 4 个平台外链脚本与 `{{userId}}` / `{{tenantId}}` 占位符 |
| AppContainer 水印 | 非离线产物会挂载平台 Safety 徽标 / 品牌水印 |

GitHub Pages 上没有这层运行时，因此工作流改用平台官方的**离线产物构建目标**（等价于 `miaoda app export-standalone`）：

```bash
NODE_ENV=production \
MIAODA_BUILD_TARGET=standalone \
ASSETS_CDN_PATH=/media-preprocess-toolkit \
npx vite build --outDir dist --emptyOutDir
```

| 环境变量 | 作用 |
|---|---|
| `NODE_ENV=production` | 必须显式设置，preset 以它判断 dev/prod（未设置会按 dev 模式构建，产物不可用） |
| `MIAODA_BUILD_TARGET=standalone` | 离线产物：跳过占位符注入 / slardar / viewContext / 老浏览器 polyfill / 水印；产物改为 iife 经典脚本；并把 `BrowserRouter` 自动替换为 `HashRouter` |
| `ASSETS_CDN_PATH=/media-preprocess-toolkit` | 资源前缀 = 仓库子路径。Vite `base` 取此值，否则 `index.html` 引用的 `/assets/*.js` 会请求站点根目录而 404 |

> **HashRouter 的收益**：路由地址形如 `https://shinelixin.github.io/media-preprocess-toolkit/#/annotation`，静态托管无需 404 回退配置，直接打开/刷新任意子路径都能正常渲染。

### 首次部署前置条件

仓库 **Settings → Pages → Build and deployment → Source** 需为 **GitHub Actions**（工作流中的 `actions/configure-pages` 已带 `enablement: true`，通常会自动开启；若 Actions 报权限错误，手动切换一次即可）。

### 本地复现 Pages 构建

```bash
NODE_ENV=production MIAODA_BUILD_TARGET=standalone ASSETS_CDN_PATH=/media-preprocess-toolkit \
  npx vite build --outDir dist --emptyOutDir
npx vite preview --outDir dist
# 访问 http://localhost:4173/media-preprocess-toolkit/
```

> 生产环境完整文档要求 Node.js ≥ 20.19（本机若为 Node 18 会报 `styleText` 不存在）；CI 使用 Node 22。

---

## 常见问题（FAQ）

| 问题 | 原因 | 解决 |
|---|---|---|
| `npm run dev` / `build` 报 `does not provide an export named 'styleText'` | Node 版本过低（<20.12） | 升级 Node 至 ≥20.19（推荐 20 LTS / 22 LTS） |
| `Cannot find native binding` / 找不到 `@rolldown/binding-linux-x64-gnu` | npm 可选依赖安装不完整（npm/cli#4828） | `rm -rf node_modules package-lock.json && npm install --include=optional`；仍缺失则 `npm install @rolldown/binding-linux-x64-gnu --save-optional --force` |
| `cleanup triggered by SIGTERM` | dev 进程被终止（多为启动失败或端口占用） | 先修复依赖；查 `lsof -i:5173`，占用则 `npm run dev -- --port 5174` |
| 双击 index.html 功能不可用 | `file://` 协议限制 | 用静态服务器（`npm run preview` / `python -m http.server` / Nginx） |
| 公网访问部分功能不可用 | HTTP 环境 | 必须 HTTPS（Vercel / Netlify / Cloudflare Pages 自带） |
| OCR 首次识别慢 / 加载模型失败 | tesseract.js 需下载 Worker 与语言模型 | 确保 `.worker.js` / `.wasm` 文件可访问（部分平台需手动配 `application/wasm` MIME）；首次加载数秒属正常 |
| 版本快照丢失 / 保存失败 | localStorage 容量上限（5–10MB） | 版本管理只存元数据不含图片，正常不会超限；大量图片请分批处理 |
| 大视频 / 大批量图片卡顿 | CPU 密集型操作（纯本地处理） | 分批处理，建议单批 ≤200 张图、视频 ≤500MB |
| 构建警告 `chunks are larger than 500 kB` | 主包体积大（echarts / tesseract） | 正常提示，不影响运行；后续可做路由级代码分割优化 |
| GitHub Pages 页面标题显示字面量 `{{appName}}` | 用了平台产物（`npm run build`）而非离线产物 | 用 `MIAODA_BUILD_TARGET=standalone` 构建（工作流已内置） |
| GitHub Pages 打开后白屏、控制台 `/assets/*.js` 404 | 资源前缀不对（站点在 `/<repo>/` 子路径下） | 构建时设置 `ASSETS_CDN_PATH=/<repo>`，与仓库名一致 |
| GitHub Pages 直接访问 `/#/annotation` 报 404 | 用 BrowserRouter 构建 | 用 standalone 构建（自动切 HashRouter）；自建 Server 则需配 SPA 回退 |

---

## 版本记录

| 版本 | 内容 |
|---|---|
| v1.0.0 (MVP) | 平台骨架 + 标注辅助（格式互转 / 质检 / Canny 预标注 / 单图复核）+ 多媒体批处理（抽帧去重 / 增强 / 裁剪缩放 / 畸变 / OCR） |
| v1.1.0 (P0) | 数据集统计、数据增强（标注同步）、数据集切分、OCR 批量识别、导航升级 |
| v1.2.0 (P1) | 模型自动标注、多边形（分割）标注、视频截取 / 转 GIF / 网格预览 / 倍速、水印 / 批量重命名 / WebP·AVIF、OCR 表格识别 + 可视化框选模板 |
| v1.3.0 (P2) | 音频工具模块（波形 / 裁剪 / 归一化 / 降噪 / 转格式 / 批量）、视频标注帧间插值、数据集版本管理、语义检索 |

---

## 项目结构（简要）

```
├── index.html                  # 入口 HTML（页面标题 / favicon / description）
├── package.json                # 依赖声明
├── vite.config.ts              # Vite 配置
├── DEPLOYMENT.md               # 部署与使用指南（本文档）
├── .github/workflows/
│   └── deploy-pages.yml        # GitHub Pages 自动部署（离线产物构建）
├── scripts/
│   ├── dev.mjs                 # 开发启动脚本
│   └── build.sh                # 构建脚本
└── src/
    ├── index.tsx               # 应用入口（BrowserRouter）
    ├── app.tsx                 # 路由配置
    ├── components/             # 布局 + shadcn/ui 组件
    ├── pages/
    │   ├── Home/               # 平台首页
    │   ├── Annotation/         # 标注辅助模块（10 个子功能 Tab）
    │   ├── MediaBatch/         # 多媒体批处理模块（OCR / 视频 / 图片）
    │   ├── Audio/              # 音频工具模块
    │   └── NotFoundPage/
    ├── utils/                  # 标注格式 / 质检 / 增强 / 切分 / 音频 / 图片 / hash / OCR
    ├── types/                  # TypeScript 类型
    ├── hooks/                  # 自定义 hooks
    └── lib/                    # 通用工具
```

新增工具模块时：在 `pages/` 下建页面目录 → 在 `app.tsx` 注册路由 → 在 `AppSidebar.tsx` 加入导航 → 在 `HomePage.tsx` 增加工具卡片即可。
