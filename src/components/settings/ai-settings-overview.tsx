import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MetaText } from "@/components/ui/data-table";
import { PROVIDER_LABELS_I18N, type AiTask, type PublicAiTaskConfig } from "@/lib/ai/config";
import { defineMessages } from "@/lib/i18n/locale";
import { getLocale } from "@/lib/i18n/server";

/**
 * 设置页左栏：三个模型任务各管什么、现在配成什么。右边三张卡改配置，这里一眼看全。
 * 顺序按用得多不多：文本（面试官等所有 agent）→ 评分 → 语音。
 */

const TASKS: AiTask[] = ["text", "scoring", "transcription"];

const messages = defineMessages({
  "zh-CN": {
    tasks: {
      text: { title: "文本理解", usage: "面试官、备课、报告、简历与面试记录解析" },
      scoring: { title: "面试评分", usage: "模拟面试结束后的逐段评分，与面试官分开" },
      transcription: { title: "语音转文本", usage: "面试录音转写" },
    },
    localService: "本地服务",
    configured: "已配置",
    missingKey: "缺 Key",
    heading: "模型总览",
    intro: "三个任务各自选模型，Key 只保存在本机服务端。",
    noModel: "未选模型",
  },
  en: {
    tasks: {
      text: { title: "Text understanding", usage: "Interviewer, prep, reports, resume and interview-note parsing" },
      scoring: { title: "Interview scoring", usage: "Per-segment scoring after a mock interview, separate from the interviewer" },
      transcription: { title: "Speech to text", usage: "Interview recording transcription" },
    },
    localService: "Local service",
    configured: "Configured",
    missingKey: "Key missing",
    heading: "Models at a glance",
    intro: "Each task picks its own model. Keys stay on this machine's server.",
    noModel: "No model selected",
  },
});

type OverviewMessages = (typeof messages)["zh-CN"];

function statusOf(config: PublicAiTaskConfig, t: OverviewMessages): { label: string; tone: "success" | "warning" | "neutral" } {
  if (!config.requiresApiKey) return { label: t.localService, tone: "neutral" };
  return config.apiKeyConfigured ? { label: t.configured, tone: "success" } : { label: t.missingKey, tone: "warning" };
}

export async function AiSettingsOverview({ settings }: { settings: Record<AiTask, PublicAiTaskConfig> }) {
  const locale = await getLocale();
  const t = messages[locale];
  return (
    <Card className="grid min-w-0 gap-4 p-5 xl:sticky xl:top-6">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{t.heading}</h2>
        <p className="mt-1 text-[0.8125rem] leading-5 text-muted-foreground">{t.intro}</p>
      </div>
      <ol className="grid gap-3">
        {TASKS.map((task) => {
          const { title, usage } = t.tasks[task];
          const config = settings[task];
          const status = statusOf(config, t);
          return (
            <li className="min-w-0 rounded-control bg-surface-subtle p-3" key={task}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{title}</span>
                <Badge tone={status.tone}>{status.label}</Badge>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{usage}</p>
              <p className="mt-2 min-w-0">
                <MetaText className="block truncate">
                  {PROVIDER_LABELS_I18N[locale][config.provider]} · {config.model || t.noModel}
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
