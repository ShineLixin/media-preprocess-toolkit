# 多媒体预处理工具平台（Media Preprocessing Toolkit）

纯浏览器前端的多媒体图像 / 音视频与标注数据预处理工具平台：**无需后端服务器，所有处理均在浏览器本地完成**，数据不出本机。

- **标注辅助工具**：VOC / COCO / YOLO / LabelMe 四种格式双向批量互转、标注质检（漏标 / 框尺寸异常 / 未知类别）、预标注生成与可视化标注编辑
- **多媒体批处理**：视频抽帧 + 感知哈希去重、图片批量增强、裁剪缩放与格式转换、畸变校正、OCR 固定版式识别

> 📖 完整的功能说明、安装运行、本地与公网部署指南见 [DEPLOYMENT.md](./DEPLOYMENT.md)
> 🌐 在线演示（GitHub Pages 自动部署）：https://shinelixin.github.io/media-preprocess-toolkit/
> 🛠 下方为本项目的技术规范（技术栈、目录结构、主题变量等约定）。

---

# 项目技术规范

## 技术栈

- 前端: React 19 + TypeScript
- 样式: Tailwind CSS v4
- UI 组件: shadcn/ui `import { Button } from "@/components/ui/button";`
- 图标: lucide-react `import { SearchIcon } from "lucide-react";`
- 图表: echarts-for-react `import ReactECharts from "echarts-for-react";`
- 动画: framer-motion `import { motion } from "framer-motion";`
- 路由: react-router-dom `import { Link, useNavigate } from "react-router-dom";`

---

## 目录结构

```
src/
├── index.tsx            # 入口（勿修改）
├── app.tsx              # 路由配置（仅在 <Routes> 内增删 <Route>）
├── index.css            # 全局样式 + 主题变量
├── components/          # 基础 UI 组件（禁止存放业务组件）
│   ├── layout.tsx       # 全局布局容器（含 <Outlet />）
│   └── ui/              # shadcn/ui 内置组件（勿修改）
├── pages/               # 页面模块（每个页面一个目录）
│   ├── <PageName>/      # 页面目录示例
│   │   ├── PageName.tsx        # 页面入口文件与目录同名
│   │   └── components/         # 页面专属组件
│   └── NotFoundPage/
│       └── NotFoundPage.tsx
├── hooks/               # 自定义 Hooks
└── lib/                 # 工具函数（cn() 等）

shared/
└── static/              # 静态资源
    ├── data/            # 数据文件（JSON）
    └── images/          # 图片资源
```

---

## 模板初始状态

- `app.tsx` 首页路由指向平台内置的 `<Welcome />` 组件
- 开发时需将 `index` 路由替换为业务首页，并在 `pages/` 下创建对应页面目录
- `layout.tsx` 为空壳容器（仅 `<Outlet />`），需根据需求实现导航和布局

---

## 禁止修改的文件

| 文件 | 原因 |
|------|------|
| `src/index.tsx` | Provider 层级 + 样式引入，由模板管理 |
| `src/components/ui/*` | shadcn/ui 内置组件，版本锁定 |

---

## 文件放置规则

| 内容类型 | 放置位置 |
|---------|---------|
| 新页面 | `src/pages/<PageName>/PageName.tsx` |
| 页面专属组件 | `src/pages/<PageName>/components/` |
| 自定义 Hooks | `src/hooks/` |
| 工具函数 | `src/lib/` |
| 静态数据文件 | `shared/static/data/` |
| 静态图片 | `shared/static/images/` |

---

## 导入路径

```typescript
// @/ 别名 → src/
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

// @shared/ 别名 → shared/
import heroImage from "@shared/static/images/hero.png";
import configData from "@shared/static/config.json";
```

---

## 路由配置

- 新增页面需在 `src/app.tsx` 的 `<Routes>` 内注册 `<Route>`
- `BrowserRouter` 已在 `index.tsx` 中配置，`app.tsx` 中**禁止**再包裹 Router

---

## 主题变量

主题色定义在 `src/index.css`，通过 `:root` CSS 变量 + `@theme inline` 注册到 Tailwind。

| 用途 | Tailwind 类 | CSS 变量 |
|------|------------|----------|
| 页面背景 | `bg-background` | `--background` |
| 主文本 | `text-foreground` | `--foreground` |
| 卡片背景 | `bg-card` | `--card` |
| 次要文本 | `text-muted-foreground` | `--muted-foreground` |
| 主色 | `bg-primary` / `text-primary` | `--primary` |
| 强调色 | `bg-accent` | `--accent` |
| 边框 | `border-border` | `--border` |
| 危险色 | `text-destructive` | `--destructive` |
| 图表色 | `bg-chart-1` ~ `bg-chart-5` | `--chart-1` ~ `--chart-5` |

HSL 格式使用**空格分隔**：`--primary: hsl(150 60% 40%);`
