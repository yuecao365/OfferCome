"use client";

import { useSyncExternalStore } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const subscribe = (onChange: () => void) => {
  const media = window.matchMedia(REDUCED_MOTION_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};
const getSnapshot = () => window.matchMedia(REDUCED_MOTION_QUERY).matches;
// 服务端没有媒体查询，一律按"有动效"渲染；水合时客户端先用这个值对齐服务端 HTML，
// 再切到真实偏好，不会出现服务端 0、客户端终值的文本不一致。
const getServerSnapshot = () => false;

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
