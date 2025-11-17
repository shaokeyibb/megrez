'use client';

import { useEffect, useRef } from 'react';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const mountedRef = useRef(false);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    
    // 检查系统偏好或本地存储的主题
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const storedTheme = localStorage.getItem('theme');
    const theme = storedTheme || (prefersDark ? 'dark' : 'light');
    
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  return <>{children}</>;
}

