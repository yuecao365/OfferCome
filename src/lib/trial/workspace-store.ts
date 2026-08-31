"use client";

import { useEffect } from "react";

import { createSampleWorkspace } from "./sample-workspace";
import { createStoredDocument, useStoredDocument } from "./stored-document";
import {
  createEmptyWorkspace,
  isTrialWorkspace,
  type TrialWorkspace,
} from "./workspace";

/**
 * 工作台文档的存储实例与 React 绑定。
 *
 * 用 localStorage：投递、面试这类数据跨访问保留才有体验价值
 * （AI Key 仍在 sessionStorage，关标签页即消失）。
 *
 * 修改一律走 mutateWorkspace(纯函数)——写入自动通知所有订阅组件，
 * 页面之间不需要手动同步。
 */

const document = createStoredDocument<TrialWorkspace>({
  key: "offerlai.trial.workspace",
  storage: () => window.localStorage,
  parse: (value) => (isTrialWorkspace(value) ? value : null),
});

/** 读当前工作台；首次访问自动载入示例数据（访客清空过则保持空）。 */
export function currentWorkspace(): TrialWorkspace {
  const stored = document.read();
  if (stored) return stored;

  const seeded = createSampleWorkspace();
  document.write(seeded);
  return seeded;
}

export function mutateWorkspace(
  mutate: (workspace: TrialWorkspace) => TrialWorkspace,
): TrialWorkspace {
  const next = mutate(currentWorkspace());
  document.write(next);
  return next;
}

/** 清空全部数据。seededAt 置 null 记住"访客主动清过"，不再自动补种。 */
export function clearWorkspace(): void {
  document.write({ ...createEmptyWorkspace(), seededAt: null });
}

export function useTrialWorkspace(): TrialWorkspace | null {
  const workspace = useStoredDocument(document);

  // 首次访问时把示例数据种进存储（写外部系统 → 订阅通知重渲染）。
  // 放在 effect 里而不是渲染中：渲染阶段不允许写存储。
  useEffect(() => {
    if (document.read() === null) currentWorkspace();
  }, []);

  return workspace;
}
