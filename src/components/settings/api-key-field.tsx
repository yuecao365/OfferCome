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
  return (
    <div>
      <label className="block text-sm font-medium text-foreground" htmlFor={props.id}>
        API Key{props.required ? "（必填）" : "（可选）"}
      </label>
      <div className="mt-2 flex items-stretch">
        <input
          autoComplete="off"
          className="min-w-0 flex-1 rounded-l-lg border border-r-0 border-border-strong bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-brand focus:ring-2 focus:ring-ring/25"
          id={props.id}
          onChange={(event) => props.onChange(event.target.value)}
          placeholder={props.configured ? "留空则保留当前 Key" : "输入 API Key"}
          spellCheck={false}
          type={props.visible ? "text" : "password"}
          value={props.value}
        />
        <button
          aria-label={props.visible ? "隐藏 API Key" : "显示 API Key"}
          className="rounded-r-lg border border-border-strong bg-surface-subtle px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={props.onToggleVisibility}
          type="button"
        >
          {props.visible ? "隐藏" : "显示"}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted-foreground">
          {props.clearing
            ? "保存后将清空当前 Key"
            : props.configured
              ? `已配置：${props.maskedKey ?? "••••••••"}`
              : "尚未配置 API Key"}
        </span>
        {props.configured ? (
          <button
            className="font-medium text-foreground underline underline-offset-2 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={props.onToggleClear}
            type="button"
          >
            {props.clearing ? "取消清空" : "清空 Key"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
