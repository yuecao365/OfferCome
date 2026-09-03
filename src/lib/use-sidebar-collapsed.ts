"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "career-agent-sidebar";
const listeners = new Set<() => void>();

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "collapsed";
  } catch {
    return false;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * 侧边栏收起状态。路由切换会重建壳层组件，所以不能只放在 useState 里；
 * 存到 localStorage 并用外部 store 订阅，跳页后保持用户的选择。
 */
export function useSidebarCollapsed(): [boolean, () => void] {
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);
  const toggle = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? "expanded" : "collapsed");
    } catch {
      // 无法持久化时仍然通知本页更新
    }
    listeners.forEach((listener) => listener());
  }, [collapsed]);
  return [collapsed, toggle];
}
