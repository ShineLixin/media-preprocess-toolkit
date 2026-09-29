import { useState } from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarFooter,
} from '@/components/ui/sidebar';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  Tags,
  PictureInPicture2,
  ArrowLeftRight,
  BarChart3,
  Wand2,
  SplitSquareVertical,
  ShieldCheck,
  Pencil,
  Film,
  ImageIcon,
  ScanLine,
  FileText,
  ChevronDown,
  Cpu,
  Droplets,
  Grid3X3,
  Music,
  AudioWaveform,
  Scissors,
  Volume2,
  GitBranch,
  Search,
  Video,
} from 'lucide-react';

const NAV_GROUPS = [
  {
    key: 'annotation',
    path: '/annotation',
    label: '标注辅助工具',
    icon: Tags,
    children: [
      { path: '/annotation?tab=format', label: '格式互转', icon: ArrowLeftRight },
      { path: '/annotation?tab=stats', label: '数据集统计', icon: BarChart3 },
      { path: '/annotation?tab=augment', label: '数据增强', icon: Wand2 },
      { path: '/annotation?tab=split', label: '数据集切分', icon: SplitSquareVertical },
      { path: '/annotation?tab=quality', label: '标注质检', icon: ShieldCheck },
      { path: '/annotation?tab=preannotate', label: '自动标注 & 编辑器', icon: Pencil },
      { path: '/annotation?tab=video', label: '视频标注（插值）', icon: Video },
      { path: '/annotation?tab=version', label: '版本管理', icon: GitBranch },
      { path: '/annotation?tab=search', label: '语义检索', icon: Search },
    ],
  },
  {
    key: 'audio',
    path: '/audio',
    label: '音频工具',
    icon: Music,
    children: [
      { path: '/audio', label: '波形 & 裁剪 & 降噪', icon: AudioWaveform },
      { path: '/audio#normalize', label: '音量归一化', icon: Volume2 },
      { path: '/audio#trim', label: '音频裁剪', icon: Scissors },
    ],
  },
  {
    key: 'media-batch',
    path: '/media-batch',
    label: '多媒体批处理',
    icon: PictureInPicture2,
    children: [
      { path: '/media-batch?tab=frame', label: '视频抽帧 & 截取', icon: Film },
      { path: '/media-batch?tab=enhance', label: '图片增强', icon: ImageIcon },
      { path: '/media-batch?tab=watermark', label: '水印 & 重命名 & 格式', icon: Droplets },
      { path: '/media-batch?tab=transform', label: '裁剪缩放转换', icon: ScanLine },
      { path: '/media-batch?tab=ocr', label: 'OCR 识别', icon: FileText },
    ],
  },
];

export default function AppSidebar() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    annotation: true,
    'media-batch': true,
    audio: true,
  });

  const fullPath = pathname + search;

  const toggleGroup = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-3 group-data-[state=collapsed]:px-0 group-data-[state=collapsed]:justify-center">
          <div className="size-8 shrink-0 rounded-md bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
            MT
          </div>
          <div className="flex-1 min-w-0 group-data-[state=collapsed]:hidden">
            <div className="text-sm font-semibold truncate">MediaTool Kit</div>
            <div className="text-xs text-muted-foreground truncate">多媒体预处理平台</div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="p-2">
          <SidebarMenu>
            {/* 首页 */}
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip="首页"
                isActive={pathname === '/'}
              >
                <NavLink to="/" end className="flex items-center gap-2">
                  <Home className="size-4 shrink-0" />
                  <span className="group-data-[state=collapsed]:hidden">首页</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {/* 工具分组 */}
            {NAV_GROUPS.map((group) => {
              const Icon = group.icon;
              const isGroupActive = pathname.startsWith(group.path);
              const isExpanded = expanded[group.key];

              return (
                <SidebarMenuItem key={group.key}>
                  <SidebarMenuButton
                    tooltip={group.label}
                    isActive={isGroupActive}
                    onClick={() => toggleGroup(group.key)}
                    className="cursor-pointer"
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="flex-1 truncate group-data-[state=collapsed]:hidden">
                      {group.label}
                    </span>
                    <ChevronDown
                      className={`size-3.5 shrink-0 transition-transform group-data-[state=collapsed]:hidden ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </SidebarMenuButton>

                  {/* 子菜单 */}
                  {isExpanded && (
                    <SidebarMenuSub className="group-data-[state=collapsed]:hidden">
                      {group.children.map((child) => {
                        const ChildIcon = child.icon;
                        // 匹配路径 + tab 参数
                        const childBase = child.path.split('?')[0];
                        const childTab = new URLSearchParams(child.path.split('?')[1] || '').get('tab');
                        const currentTab = new URLSearchParams(search).get('tab');
                        const isChildActive =
                          pathname === childBase &&
                          (childTab === null || currentTab === childTab);

                        return (
                          <SidebarMenuSubItem key={child.path}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={isChildActive}
                              onClick={(e) => {
                                // 阻止默认的 SidebarMenuSubButton 行为，手动导航
                                e.preventDefault();
                                navigate(child.path);
                              }}
                            >
                              <span
                                className="flex items-center gap-2 w-full cursor-pointer"
                                onClick={() => navigate(child.path)}
                              >
                                <ChildIcon className="size-3.5 shrink-0" />
                                <span className="truncate text-xs">{child.label}</span>
                              </span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        );
                      })}
                    </SidebarMenuSub>
                  )}
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="px-2 py-2 text-xs text-muted-foreground group-data-[state=collapsed]:hidden">
          <div>v1.3.0 P2</div>
          <div className="mt-0.5">纯前端 · 本地处理 · 隐私安全</div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
