"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  FieldLabel,
  Input,
  RequiredMark,
  Select,
  Textarea,
} from "@/components/ui/form-controls";
import { useLocale, useMessages } from "@/lib/i18n/client";
import { contentLanguageOf, defineMessages, type ContentLanguage } from "@/lib/i18n/locale";
import {
  DEFAULT_INTERVIEW_PACE,
  INTERVIEW_PACE_LABELS_I18N,
  INTERVIEW_PACES,
  isInterviewPace,
  type InterviewPace,
} from "@/lib/mock-interviews/brief/brief";
import { FileInput } from "@/components/ui/file-input";

const INTERVIEW_LANGUAGES: readonly ContentLanguage[] = ["zh", "en"];

const messages = defineMessages({
  "zh-CN": {
    createFailed: "创建模拟面试失败。",
    applicationPrefix: (company: string, job: string) => `已带入「${company} · ${job}」`,
    applicationWithJd: "的岗位信息。",
    applicationMissingJd: "，这条投递还没有保存岗位描述，请在下方粘贴后开始。",
    applicationNeedsJd: "，请在下方补充岗位描述后开始。",
    openJobPage: "打开岗位页面复制",
    seed: (title: string) => `本场将围绕「${title}」重点出题。`,
    close: "关闭",
    notConfiguredBefore: "文本模型尚未配置，暂时不能创建 AI 模拟面试。请先前往",
    settingsLink: "设置页",
    notConfiguredAfter: "完成配置。",
    jobTitle: "目标岗位与岗位描述",
    jobHint: "公司、岗位名称、岗位描述都必填；岗位描述上传文件或粘贴文本都行。",
    companyName: "公司名称",
    companyPlaceholder: "例如：目标公司",
    jobName: "岗位名称",
    jobNamePlaceholder: "例如：前端工程师",
    uploadJd: "上传岗位描述",
    uploadOr: "（与右侧粘贴二选一）",
    uploadFormats: "支持 TXT、MD、DOCX、PDF。上传后无需再粘贴。",
    pasteJd: "或粘贴岗位描述",
    pastePlaceholder: "粘贴岗位职责、任职要求和技术栈……",
    shortJd: "这份岗位描述比较简短，补充岗位职责和任职要求能让题目更贴合。也可以直接开始，我们会帮你补全该岗位的常见要求。",
    settings: "面试设置",
    paceSummary: (pace: string) => `${pace}节奏`,
    languageSummary: { zh: "中文面试", en: "英文面试" } satisfies Record<ContentLanguage, string>,
    answerSummary: "文字作答（可用麦克风输入）",
    adjust: "调整",
    settingsHint: "选择面试使用的简历、节奏、语言和作答方式。节奏定这场聊几份材料，长短由聊完为止，不按时间。作答打字或按麦克风说话都行，转写后可以改再发。面试官会根据岗位和简历备课，题目在对话中临场提出。",
    resume: "使用简历",
    defaultResume: "（默认）",
    pace: "面试节奏",
    language: "面试语言",
    languages: { zh: "中文", en: "English" } satisfies Record<ContentLanguage, string>,
    creating: "正在创建面试房间…",
    creatingHint: "创建后会立即进入房间，面试题将在后台生成。",
    footer: "面试官会结合岗位描述和你的简历备课，像真实面试一样追问，结束后出报告。",
    submitting: "正在创建",
    submit: "开始模拟面试",
  },
  en: {
    createFailed: "Couldn't create the mock interview.",
    applicationPrefix: (company: string, job: string) => `Loaded "${company} · ${job}"`,
    applicationWithJd: ".",
    applicationMissingJd: ". This application has no saved job description yet; paste one below to start.",
    applicationNeedsJd: ". Add a job description below to start.",
    openJobPage: "Open the job page to copy it",
    seed: (title: string) => `This session will focus on "${title}".`,
    close: "Dismiss",
    notConfiguredBefore: "No text model is set up yet, so AI mock interviews can't be created. Go to",
    settingsLink: "Settings",
    notConfiguredAfter: " to set one up.",
    jobTitle: "Target role and job description",
    jobHint: "Company, role and job description are all required; upload a file or paste the text.",
    companyName: "Company",
    companyPlaceholder: "e.g. Target company",
    jobName: "Role",
    jobNamePlaceholder: "e.g. Frontend engineer",
    uploadJd: "Upload job description",
    uploadOr: "(or paste it on the right)",
    uploadFormats: "TXT, MD, DOCX or PDF. No need to paste after uploading.",
    pasteJd: "Or paste the job description",
    pastePlaceholder: "Paste the responsibilities, requirements and tech stack…",
    shortJd: "This job description is short. Adding responsibilities and requirements makes the questions fit better. You can also start now and we'll fill in the role's usual requirements.",
    settings: "Interview settings",
    paceSummary: (pace: string) => `${pace} pace`,
    languageSummary: { zh: "Interview in Chinese", en: "Interview in English" },
    answerSummary: "Text answers (mic input available)",
    adjust: "Adjust",
    settingsHint: "Choose the resume, pace, language and how you answer. Pace sets how many materials are covered; the session runs until they're done, not by the clock. Type or speak into the mic, and edit the transcript before sending. The interviewer prepares from the role and your resume and asks questions live.",
    resume: "Resume",
    defaultResume: " (default)",
    pace: "Pace",
    language: "Interview language",
    languages: { zh: "Chinese", en: "English" },
    creating: "Creating the interview room…",
    creatingHint: "You'll enter the room right away; questions are prepared in the background.",
    footer: "The interviewer prepares from the job description and your resume, follows up like a real interview, and writes a report at the end.",
    submitting: "Creating",
    submit: "Start mock interview",
  },
});

type ResumeOption = { id: string; name: string; isDefault: boolean };

async function defaultCreateSession(formData: FormData, fallbackError: string): Promise<{ href: string }> {
  const response = await fetch("/api/interviews/mock", { method: "POST", body: formData });
  const result = (await response.json()) as { href?: string; error?: string };
  if (!response.ok || !result.href) {
    throw new Error(result.error ?? fallbackError);
  }
  return { href: result.href };
}

/** 粘贴的岗位描述像不像一份完整 JD：够长且带职责 / 要求类字样（中英文都认）。 */
const JD_KEYWORDS = /职责|要求|负责|熟悉|掌握|精通|经验|任职|岗位描述|工作内容|技能|responsibilit|requirement|qualification|experience|skill|proficien|familiar/i;

/**
 * 带入的岗位信息。id 为 null 表示只带了公司与岗位名（例如从备战页发起），
 * 没有可关联的投递记录。
 */
export type MockInterviewApplication = {
  id: string | null;
  companyName: string;
  jobTitle: string;
  jobUrl: string;
  jobDescription: string;
};

export function MockInterviewSetup({
  resumes,
  textConfigured,
  seed,
  application,
  createSession,
}: {
  resumes: ResumeOption[];
  textConfigured: boolean;
  seed?: { id: string; title: string } | null;
  application?: MockInterviewApplication | null;
  /** 覆盖默认的创建接口（体验版走无状态 API + 浏览器存储）。 */
  createSession?: (formData: FormData) => Promise<{ href: string }>;
}) {
  const router = useRouter();
  const locale = useLocale();
  const t = useMessages(messages);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [jobDescriptionText, setJobDescriptionText] = useState(
    application?.jobDescription ?? "",
  );
  const [pace, setPace] = useState<InterviewPace>(DEFAULT_INTERVIEW_PACE);
  // 面试语言默认跟界面语言；选定后按场次存，之后切界面语言不影响这场。
  const [language, setLanguage] = useState<ContentLanguage>(contentLanguageOf(locale));
  const showJobDescriptionHint =
    jobDescriptionText.trim().length > 0 &&
    (jobDescriptionText.trim().length < 200 || !JD_KEYWORDS.test(jobDescriptionText));

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const formData = new FormData(event.currentTarget);
      const result = createSession
        ? await createSession(formData)
        : await defaultCreateSession(formData, t.createFailed);
      router.push(result.href);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t.createFailed);
      setPending(false);
    }
  };

  return (
    <form className="grid gap-4" onSubmit={submit}>
      {application ? (
        <Alert tone="info">
          {application.id ? (
            <input name="applicationId" type="hidden" value={application.id} />
          ) : null}
          <span>
            {t.applicationPrefix(application.companyName, application.jobTitle)}
            {application.jobDescription
              ? t.applicationWithJd
              : application.id
                ? t.applicationMissingJd
                : t.applicationNeedsJd}
            {!application.jobDescription && application.jobUrl ? (
              <a
                className="ml-1 font-medium underline"
                href={application.jobUrl}
                rel="noreferrer"
                target="_blank"
              >
                {t.openJobPage}
              </a>
            ) : null}
          </span>
        </Alert>
      ) : null}
      {seed ? (
        <Alert tone="info">
          <span>{t.seed(seed.title)}</span>
          <Link className="ml-2 font-medium underline" href="/interviews/mock">
            {t.close}
          </Link>
          <input name="seedQuestionId" type="hidden" value={seed.id} />
        </Alert>
      ) : null}
      {!textConfigured ? (
        <Alert tone="danger">
          {t.notConfiguredBefore}
          <a className="ml-1 font-medium underline" href="/settings">{t.settingsLink}</a>
          {t.notConfiguredAfter}
        </Alert>
      ) : null}
      <Card className="p-5">
        <div className="mb-5 border-b border-border pb-4">
          <h2 className="text-sm font-semibold text-foreground">{t.jobTitle}</h2>
          <p className="mt-1 text-[0.8125rem] text-muted-foreground">{t.jobHint}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <FieldLabel>
            <span>{t.companyName}<RequiredMark /></span>
            <Input
              defaultValue={application?.companyName ?? ""}
              name="companyName"
              placeholder={t.companyPlaceholder}
              required
            />
          </FieldLabel>
          <FieldLabel>
            <span>{t.jobName}<RequiredMark /></span>
            <Input
              defaultValue={application?.jobTitle ?? ""}
              name="jobTitle"
              placeholder={t.jobNamePlaceholder}
              required
            />
          </FieldLabel>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <FieldLabel>
            <span>
              {t.uploadJd}<RequiredMark />
              <span className="ml-1 font-normal">{t.uploadOr}</span>
            </span>
            <span className="grid min-h-40 place-items-center rounded-control border border-dashed border-border-strong bg-surface-subtle px-4 py-5 text-center">
              <FileInput accept=".txt,.md,.docx,.pdf" className="justify-center" name="jobDescriptionFile" />
              <span className="mt-3 font-normal leading-5">{t.uploadFormats}</span>
            </span>
          </FieldLabel>
          <FieldLabel>
            <span>
              {t.pasteJd}<RequiredMark />
            </span>
            <Textarea
              className="min-h-40"
              name="jobDescriptionText"
              onChange={(event) => setJobDescriptionText(event.target.value)}
              placeholder={t.pastePlaceholder}
              value={jobDescriptionText}
            />
            {showJobDescriptionHint ? (
              <Alert className="mt-2 font-normal" tone="warning">
                {t.shortJd}
              </Alert>
            ) : null}
          </FieldLabel>
        </div>
      </Card>

      {/* 所有设置都有合理默认值，收进折叠区：默认路径填完岗位信息就能开始。
          折叠时表单控件仍在 DOM 中，默认值照常随表单提交。 */}
      <Card className="p-5">
        <details className="group">
          <summary className="flex cursor-pointer select-none flex-wrap items-baseline gap-x-3 gap-y-1 [&::-webkit-details-marker]:hidden">
            <h2 className="text-sm font-semibold text-foreground">{t.settings}</h2>
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground group-open:hidden">
              {resumes.find((resume) => resume.isDefault)?.name ?? resumes[0]?.name} · {t.paceSummary(INTERVIEW_PACE_LABELS_I18N[locale][pace])} · {t.languageSummary[language]} · {t.answerSummary}
            </span>
            <span className="text-xs text-muted-foreground group-open:hidden">{t.adjust}</span>
            <span className="w-full text-[0.8125rem] text-muted-foreground group-open:block hidden">{t.settingsHint}</span>
          </summary>
          <div className="mt-5 border-t border-border pt-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <FieldLabel>
            <span>{t.resume}<RequiredMark /></span>
            <Select defaultValue={resumes.find((resume) => resume.isDefault)?.id ?? resumes[0]?.id} name="resumeId" required>
              {resumes.map((resume) => (
                <option key={resume.id} value={resume.id}>
                  {resume.name}{resume.isDefault ? t.defaultResume : ""}
                </option>
              ))}
            </Select>
          </FieldLabel>
          <FieldLabel>
            {t.pace}
            <Select
              name="pace"
              onChange={(event) => {
                if (isInterviewPace(event.target.value)) setPace(event.target.value);
              }}
              value={pace}
            >
              {INTERVIEW_PACES.map((item) => (
                <option key={item} value={item}>{INTERVIEW_PACE_LABELS_I18N[locale][item]}</option>
              ))}
            </Select>
          </FieldLabel>
          <FieldLabel>
            {t.language}
            <Select
              name="language"
              onChange={(event) => setLanguage(event.target.value === "en" ? "en" : "zh")}
              value={language}
            >
              {INTERVIEW_LANGUAGES.map((item) => (
                <option key={item} value={item}>{t.languages[item]}</option>
              ))}
            </Select>
          </FieldLabel>
        </div>
          </div>
        </details>
      </Card>

      {pending ? (
        <Alert tone="info">
          <span className="flex items-center gap-2 font-medium">
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            {t.creating}
          </span>
          <span className="mt-1 block">{t.creatingHint}</span>
        </Alert>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-3xl text-xs leading-5 text-muted-foreground">
          {t.footer}
        </p>
        <Button disabled={pending || resumes.length === 0 || !textConfigured} type="submit">
          {pending ? t.submitting : t.submit}
          <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
        </Button>
      </div>
    </form>
  );
}
