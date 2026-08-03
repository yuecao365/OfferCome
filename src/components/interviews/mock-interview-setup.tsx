"use client";

import {
  FileText,
  Keyboard,
  LoaderCircle,
  Mic,
  Settings2,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, Input, Select, Textarea } from "@/components/ui/form-controls";
import { INTERVIEW_ROUND_LABELS, INTERVIEW_ROUNDS } from "@/lib/interviews/types";
import {
  MOCK_INTERVIEW_DIFFICULTIES,
  MOCK_INTERVIEW_DIFFICULTY_LABELS,
  MOCK_INTERVIEW_MODES,
  MOCK_INTERVIEW_MODE_LABELS,
} from "@/lib/mock-interviews/types";

type ResumeOption = { id: string; name: string; isDefault: boolean };

export function MockInterviewSetup({ resumes }: { resumes: ResumeOption[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/interviews/mock", {
        method: "POST",
        body: new FormData(event.currentTarget),
      });
      const result = (await response.json()) as { href?: string; error?: string };
      if (!response.ok || !result.href) {
        throw new Error(result.error ?? "创建模拟面试失败。");
      }
      router.push(result.href);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "创建模拟面试失败。");
      setPending(false);
    }
  };

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <Card className="p-5">
        <div className="mb-5 flex items-start gap-3 border-b border-border pb-4">
          <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <FileText aria-hidden="true" className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-foreground">目标岗位与 JD</h2>
            <p className="mt-1 text-sm text-muted-foreground">岗位名称和公司为必填；JD 可以上传文件或粘贴文本，二选一即可。</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <FieldLabel>
            公司名称 *
            <Input name="companyName" placeholder="例如：目标公司" required />
          </FieldLabel>
          <FieldLabel>
            岗位名称 *
            <Input name="jobTitle" placeholder="例如：前端工程师" required />
          </FieldLabel>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <FieldLabel>
            上传 Job Description
            <Input
              accept=".txt,.md,.docx,.pdf"
              className="h-auto min-h-10 py-1.5 file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-2 file:py-1 file:text-xs file:font-semibold file:text-accent-foreground"
              name="jobDescriptionFile"
              type="file"
            />
            <span className="font-normal leading-5">支持 TXT、MD、DOCX、PDF。上传文件后无需再粘贴文本。</span>
          </FieldLabel>
          <FieldLabel>
            或粘贴 Job Description
            <Textarea name="jobDescriptionText" placeholder="粘贴岗位职责、任职要求和技术栈……" />
          </FieldLabel>
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-5 flex items-start gap-3 border-b border-border pb-4">
          <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Settings2 aria-hidden="true" className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-foreground">面试设置</h2>
            <p className="mt-1 text-sm text-muted-foreground">选择用于生成问题的简历、轮次、难度、题目数量和作答方式。</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <FieldLabel>
            使用简历 *
            <Select defaultValue={resumes.find((resume) => resume.isDefault)?.id ?? resumes[0]?.id} name="resumeId" required>
              {resumes.map((resume) => (
                <option key={resume.id} value={resume.id}>
                  {resume.name}{resume.isDefault ? "（默认）" : ""}
                </option>
              ))}
            </Select>
          </FieldLabel>
          <FieldLabel>
            面试轮次
            <Select defaultValue="first_interview" name="round">
              {INTERVIEW_ROUNDS.map((round) => (
                <option key={round} value={round}>{INTERVIEW_ROUND_LABELS[round]}</option>
              ))}
            </Select>
          </FieldLabel>
          <FieldLabel>
            难度
            <Select defaultValue="standard" name="difficulty">
              {MOCK_INTERVIEW_DIFFICULTIES.map((difficulty) => (
                <option key={difficulty} value={difficulty}>{MOCK_INTERVIEW_DIFFICULTY_LABELS[difficulty]}</option>
              ))}
            </Select>
          </FieldLabel>
          <FieldLabel>
            题目数量
            <Select defaultValue="8" name="questionCount">
              {[5, 8, 10, 12].map((count) => (
                <option key={count} value={count}>{count} 题</option>
              ))}
            </Select>
          </FieldLabel>
        </div>
        <fieldset className="mt-5 grid gap-2">
          <legend className="text-xs font-semibold text-muted-foreground">
            作答方式
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {MOCK_INTERVIEW_MODES.map((mode) => {
              const Icon = mode === "voice" ? Mic : Keyboard;
              return (
                <label className="cursor-pointer" key={mode}>
                  <input
                    className="peer sr-only"
                    defaultChecked={mode === "text"}
                    name="interactionMode"
                    type="radio"
                    value={mode}
                  />
                  <span className="flex min-h-16 items-center gap-3 rounded-lg border border-border-strong bg-surface px-4 py-3 text-sm text-foreground transition-colors peer-checked:border-brand peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                    <Icon aria-hidden="true" className="size-4 shrink-0 text-brand" />
                    <span>
                      <strong className="block font-semibold">
                        {MOCK_INTERVIEW_MODE_LABELS[mode]}
                      </strong>
                      <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                        {mode === "voice"
                          ? "朗读 AI 问题，录音转写后可编辑再提交。"
                          : "直接输入并提交文字回答。"}
                      </span>
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </Card>

      {pending ? (
        <Alert tone="info">
          <span className="flex items-center gap-2 font-semibold">
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            正在读取 JD 与简历并生成问题
          </span>
          <span className="mt-1 block">生成完成后会自动进入面试房间，请不要重复提交或关闭页面。</span>
        </Alert>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-3xl text-xs leading-5 text-muted-foreground">
          历史和画像只用于调整与 JD 相关的问题角度；评分标准保存在服务端，答题前不会展示。
        </p>
        <Button disabled={pending || resumes.length === 0} type="submit">
          <Sparkles aria-hidden="true" className="size-4" />
          {pending ? "正在生成" : "开始 AI 模拟面试"}
        </Button>
      </div>
    </form>
  );
}
