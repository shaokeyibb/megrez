'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';

// 动态导入客户端组件，避免在构建时执行 useChat
const InterviewRoomClient = dynamic(
  () => import('./interview-room-client').then(mod => ({ default: mod.InterviewRoomClient })),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col h-screen bg-background items-center justify-center">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    ),
  }
);

export default function InterviewRoom() {
  return (
    <Suspense fallback={
      <div className="flex flex-col h-screen bg-background items-center justify-center">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    }>
      <InterviewRoomClient />
    </Suspense>
  );
}
