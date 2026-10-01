import { useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";

const messages = defineMessages({
  "zh-CN": {
    required: "（必填）",
    optional: "（可选）",
    keepCurrent: "留空则保留当前 Key",
    enterKey: "输入 API Key",
    hideKey: "隐藏 API Key",
    showKey: "显示 API Key",
    hide: "隐藏",
    show: "显示",
    willClear: "保存后将清空当前 Key",
    configured: (masked: string) => `已配置：${masked}`,
    notConfigured: "尚未配置 API Key",
    cancelClear: "取消清空",
    clear: "清空 Key",
  },
  en: {
    required: " (required)",
    optional: " (optional)",
    keepCurrent: "Leave blank to keep the current key",
    enterKey: "Enter API key",
    hideKey: "Hide API key",
    showKey: "Show API key",
    hide: "Hide",
    show: "Show",
    willClear: "The current key will be cleared when you save",
    configured: (masked: string) => `Configured: ${masked}`,
    notConfigured: "No API key configured yet",
    cancelClear: "Keep key",
    clear: "Clear key",
  },
});

type ApiKeyFieldProps = {
  id: string;
  value: string;
  visible: boolean;
  configured: boolean;
  maskedKey: string | null;
  clearing: boolean;
  required: boolean;
  onChange: (value: string) => void;
  onToggleVisibility: () => void;
  onToggleClear: () => void;
};

export function ApiKeyField(props: ApiKeyFieldProps) {
  const t = useMessages(messages);
  return (
    <div>
      <label className="block text-sm font-medium text-foreground" htmlFor={props.id}>
        API Key{props.required ? t.required : t.optional}
      </label>
      <div className="mt-2 flex items-stretch">
        <input
          autoComplete="off"
          className="min-w-0 flex-1 rounded-l-lg border border-r-0 border-border-strong bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-brand focus:ring-2 focus:ring-ring/25"
          id={props.id}
          onChange={(event) => props.onChange(event.target.value)}
          placeholder={props.configured ? t.keepCurrent : t.enterKey}
          spellCheck={false}
          type={props.visible ? "text" : "password"}
          value={props.value}
        />
        <button
          aria-label={props.visible ? t.hideKey : t.showKey}
          className="rounded-r-lg border border-border-strong bg-surface-subtle px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={props.onToggleVisibility}
          type="button"
        >
          {props.visible ? t.hide : t.show}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted-foreground">
          {props.clearing
            ? t.willClear
            : props.configured
              ? t.configured(props.maskedKey ?? "••••••••")
              : t.notConfigured}
        </span>
        {props.configured ? (
          <button
            className="font-medium text-foreground underline underline-offset-2 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={props.onToggleClear}
            type="button"
          >
            {props.clearing ? t.cancelClear : t.clear}
          </button>
        ) : null}
      </div>
    </div>
  );
}
