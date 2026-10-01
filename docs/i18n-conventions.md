# 界面双语约定（给改文案的人和 agent）

实现见 `src/lib/i18n/`。方案与范围见 [i18n-plan.md](i18n-plan.md)。

## 取语言

- 客户端组件（文件顶部有 `"use client"`）：`const t = useMessages(messages)`，要语言码时 `useLocale()`（都来自 `@/lib/i18n/client`）。
- 服务端组件 / route handler / server action：`const t = await getMessages(messages)`、`await getLocale()`（`@/lib/i18n/server`，`server-only`）。
- 浏览器里、React 树之外的代码（体验版的存储与动作层，如 `src/lib/trial/*-actions.ts`、`client.ts`）：`browserLocale()` / `browserMessages(messages)`（`@/lib/i18n/browser`，读 `<html lang>`）。
- 同一个 View 既被本地版服务端页面渲染、又被体验版客户端页面渲染（大部分 `*-view.tsx`）：加 `"use client"` 用 hook。加之前确认本地版服务端页面传给它的 props 都能跨边界（数据、ReactNode、server action 可以；普通函数不行）。组件是 async 或 import 了 `server-only` / prisma 的，保持服务端，用 `getMessages`。

## 写文案

```tsx
import { defineMessages } from "@/lib/i18n/locale";

const messages = defineMessages({
  "zh-CN": { title: "投递岗位", count: (n: number) => `共 ${n} 条` },
  en: { title: "Applications", count: (n: number) => `${n} total` },
});
```

- 文案与组件同文件，放在 import 之后。en 与 zh-CN 同形，缺键编译报错。
- 中文原文逐字保留，只是搬进 `"zh-CN"`。
- 英文：简洁的产品英语，句首大写其余小写（sentence case），不直译；按钮用动词。
- 不译：用户数据（公司名、岗位、简历、回答）、代码注释、console 日志、给模型的提示词、测试。

## 标签与日期

- 枚举标签用 `X_LABELS_I18N[locale][key]`（阶段、轮次、状态、节奏、材料种类、画像维度……，定义在各自的 `types.ts`）。
- 日期：`formatDateTime(value, fallback, locale)` 等，语言是最后一个参数。
- `roundLabel(round, locale)`、`questionCategoryLabel(c, locale)`、`describeInterviewTime(at, now, locale)`、`levelLabel(v, locale)`。

## 验收

`npx tsc --noEmit -p .` 无错；`grep -P '[\x{4e00}-\x{9fff}]'` 扫自己的文件，剩下的只应在注释和 `"zh-CN"` 块里。
