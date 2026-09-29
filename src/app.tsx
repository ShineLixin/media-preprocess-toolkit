import { Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import HomePage from "@/pages/Home/HomePage";
import AnnotationToolsPage from "@/pages/Annotation/AnnotationToolsPage";
import MediaBatchPage from "@/pages/MediaBatch/MediaBatchPage";
import NotFoundPage from "@/pages/NotFoundPage/NotFoundPage";
import AudioToolsPage from "@/pages/Audio/AudioToolsPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="annotation" element={<AnnotationToolsPage />} />
        <Route path="media-batch" element={<MediaBatchPage />} />
        <Route path="audio" element={<AudioToolsPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
