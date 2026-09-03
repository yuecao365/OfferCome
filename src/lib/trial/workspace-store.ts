"use client";

import { useEffect } from "react";

import { WORKSPACE_KEY } from "./storage-keys";
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
 * （AI 连接单独存放，见 browser-store.ts）。
 *
 * 修改一律走 mutateWorkspace(纯函数)——写入自动通知所有订阅组件，
 * 页面之间不需要手动同步。
 *
 * 网页版与本地版一样从空工作台开始，由"开始使用"清单引导；
 * 早期版本会预种示例数据（id 以 sample- 开头），读取时一次性清掉。
 */

function stripLegacySamples(workspace: TrialWorkspace): TrialWorkspace {
  if (workspace.seededAt === null) return workspace;
  return {
    ...workspace,
    seededAt: null,
    applications: workspace.applications.filter(
      (item) => !item.id.startsWith("sample-"),
    ),
    interviews: workspace.interviews.filter(
      (item) => !item.id.startsWith("sample-"),
    ),
  };
}

const document = createStoredDocument<TrialWorkspace>({
  key: WORKSPACE_KEY,
  storage: () => window.localStorage,
  parse: (value) => (isTrialWorkspace(value) ? stripLegacySamples(value) : null),
});

/** 读当前工作台；首次访问从空开始，与本地版一致。 */
export function currentWorkspace(): TrialWorkspace {
  const stored = document.read();
  if (stored) return stored;

  const empty = { ...createEmptyWorkspace(), seededAt: null };
  document.write(empty);
  return empty;
}

export function mutateWorkspace(
  mutate: (workspace: TrialWorkspace) => TrialWorkspace,
): TrialWorkspace {
  const next = mutate(currentWorkspace());
  document.write(next);
  return next;
}

export function useTrialWorkspace(): TrialWorkspace | null {
  const workspace = useStoredDocument(document);

  // 首次访问把空工作台写进存储（写外部系统 → 订阅通知重渲染）。
  // 放在 effect 里而不是渲染中：渲染阶段不允许写存储。
  useEffect(() => {
    if (document.read() === null) currentWorkspace();
  }, []);

  return workspace;
}
