import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import VideoFrameTab from './tabs/VideoFrameTab';
import ImageEnhanceTab from './tabs/ImageEnhanceTab';
import CropResizeTab from './tabs/CropResizeTab';
import DistortionTab from './tabs/DistortionTab';
import OCRTab from './tabs/OCRTab';
import WatermarkTab from './tabs/WatermarkTab';

const TAB_DEFAULT = 'frame';

export default function MediaBatchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(urlTab || TAB_DEFAULT);

  useEffect(() => {
    if (urlTab) {
      setActiveTab(urlTab);
    }
  }, [urlTab]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSearchParams({ tab: value }, { replace: true });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">多媒体批处理工具</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              视频抽帧去重 · 图片增强 · 水印叠加 · 裁剪缩放格式转换 · 畸变校正 · OCR 识别
            </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
              <TabsList className="mb-4 flex-wrap h-auto">
                <TabsTrigger value="frame">视频抽帧</TabsTrigger>
                <TabsTrigger value="enhance">图片增强</TabsTrigger>
                <TabsTrigger value="transform">裁剪/缩放/格式</TabsTrigger>
                <TabsTrigger value="distortion">畸变校正</TabsTrigger>
                <TabsTrigger value="watermark">水印/重命名/格式</TabsTrigger>
                <TabsTrigger value="ocr">OCR 识别</TabsTrigger>
              </TabsList>

              <TabsContent value="frame" className="mt-0">
                <VideoFrameTab />
              </TabsContent>

              <TabsContent value="enhance" className="mt-0">
                <ImageEnhanceTab />
              </TabsContent>

              <TabsContent value="transform" className="mt-0">
                <CropResizeTab />
              </TabsContent>

              <TabsContent value="distortion" className="mt-0">
                <DistortionTab />
              </TabsContent>

              <TabsContent value="watermark" className="mt-0">
                <WatermarkTab />
              </TabsContent>

              <TabsContent value="ocr" className="mt-0">
                <OCRTab />
              </TabsContent>
            </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
