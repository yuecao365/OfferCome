import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MetaText } from "@/components/ui/data-table";
import { PROVIDER_LABELS, type AiTask, type PublicAiTaskConfig } from "@/lib/ai/config";

/**
 * 设置页左栏：三个模型任务各管什么、现在配成什么。右边三张卡改配置，这里一眼看全。
 * 顺序按用得多不多：文本（面试官等所有 agent）→ 评分 → 语音。
 */

const TASKS: { task: AiTask; title: string; usage: string }[] = [
  { task: "text", title: "文本理解", usage: "面试官、备课、报告、简历与面试记录解析" },
  { task: "scoring", title: "面试评分", usage: "模拟面试结束后的逐段评分，与面试官分开" },
  { task: "transcription", title: "语音转文本", usage: "面试录音转写" },
];

function statusOf(config: PublicAiTaskConfig): { label: string; tone: "success" | "warning" | "neutral" } {
  if (!config.requiresApiKey) return { label: "本地服务", tone: "neutral" };
  return config.apiKeyConfigured ? { label: "已配置", tone: "success" } : { label: "缺 Key", tone: "warning" };
}

export function AiSettingsOverview({ settings }: { settings: Record<AiTask, PublicAiTaskConfig> }) {
  return (
    <Card className="grid min-w-0 gap-4 p-5 xl:sticky xl:top-6">
      <div>
        <h2 className="text-sm font-semibold text-foreground">模型总览</h2>
        <p className="mt-1 text-[0.8125rem] leading-5 text-muted-foreground">三个任务各自选模型，Key 只保存在本机服务端。</p>
      </div>
      <ol className="grid gap-3">
        {TASKS.map(({ task, title, usage }) => {
          const config = settings[task];
          const status = statusOf(config);
          return (
            <li className="min-w-0 rounded-control bg-surface-subtle p-3" key={task}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{title}</span>
                <Badge tone={status.tone}>{status.label}</Badge>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{usage}</p>
              <p className="mt-2 min-w-0">
                <MetaText className="block truncate">
                  {PROVIDER_LABELS[config.provider]} · {config.model || "未选模型"}
                  {config.maskedKey ? ` · ${config.maskedKey}` : ""}
                </MetaText>
              </p>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
