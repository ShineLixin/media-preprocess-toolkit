import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import FormatConvertTab from './tabs/FormatConvertTab';
import QualityCheckTab from './tabs/QualityCheckTab';
import PreAnnotateTab from './tabs/PreAnnotateTab';
import StatsTab from './tabs/StatsTab';
import AugmentTab from './tabs/AugmentTab';
import SplitTab from './tabs/SplitTab';
import VideoAnnotationTab from './tabs/VideoAnnotationTab';
import VersionManagerTab from './tabs/VersionManagerTab';
import SemanticSearchTab from './tabs/SemanticSearchTab';

const TAB_DEFAULT = 'format';

export default function AnnotationToolsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(urlTab || TAB_DEFAULT);

  // URL tab 参数变化 → 同步到 state
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
          <h1 className="text-xl font-semibold tracking-tight">标注辅助工具</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            CV 数据集格式互转 · 质检统计 · 数据增强 · 切分 · 预标注 · 视频标注 · 版本管理 · 语义检索
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="format">格式互转</TabsTrigger>
              <TabsTrigger value="stats">数据集统计</TabsTrigger>
              <TabsTrigger value="augment">数据增强</TabsTrigger>
              <TabsTrigger value="split">数据集切分</TabsTrigger>
              <TabsTrigger value="quality">标注质检</TabsTrigger>
              <TabsTrigger value="preannotate">预标注 & 编辑</TabsTrigger>
              <TabsTrigger value="video">视频标注</TabsTrigger>
              <TabsTrigger value="version">版本管理</TabsTrigger>
              <TabsTrigger value="search">语义检索</TabsTrigger>
            </TabsList>

            <TabsContent value="format" className="mt-0">
              <FormatConvertTab />
            </TabsContent>

            <TabsContent value="stats" className="mt-0">
              <StatsTab />
            </TabsContent>

            <TabsContent value="augment" className="mt-0">
              <AugmentTab />
            </TabsContent>

            <TabsContent value="split" className="mt-0">
              <SplitTab />
            </TabsContent>

            <TabsContent value="quality" className="mt-0">
              <QualityCheckTab />
            </TabsContent>

            <TabsContent value="preannotate" className="mt-0">
              <PreAnnotateTab />
            </TabsContent>

            <TabsContent value="video" className="mt-0">
              <VideoAnnotationTab />
            </TabsContent>

            <TabsContent value="version" className="mt-0">
              <VersionManagerTab images={[]} format="yolo" />
            </TabsContent>

            <TabsContent value="search" className="mt-0">
              <SemanticSearchTab images={[]} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
