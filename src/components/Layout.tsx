import { Outlet } from 'react-router-dom';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import AppSidebar from '@/components/AppSidebar';

export const Layout = () => {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col min-w-0 overflow-x-hidden">
        <header className="sticky top-0 z-40 w-full bg-background/80 backdrop-blur-md border-b border-border/30">
          <div className="flex h-14 items-center gap-3 px-4">
            <SidebarTrigger />
            <div className="text-sm text-muted-foreground">
              所有处理均在浏览器本地完成，数据不会上传服务器
            </div>
          </div>
        </header>
        <main className="flex-1 w-full overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
};
