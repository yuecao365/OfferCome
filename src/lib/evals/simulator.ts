import { z } from "zod";

import type { AiTaskConfig } from "@/lib/ai/config";

import { salvageJson } from "@/lib/ai/salvage-json";

import { runAux } from "./models";
import type { Persona } from "./fixtures";

/**
 * 候选人模拟器：按人设回答面试官的每一句话。人设里的错句 Z 与说不出细节的成果 C
 * 是评测的已知真值；模拟器的任务是把它们自然地说出来，其余按人设水平作答。
 */

export const SIMULATOR_PROMPT_VERSION = "simulator-v1";

export type TranscriptLine = { role: "interviewer" | "candidate"; content: string };

const replySchema = z.object({ reply: z.string().min(1).max(1_500) });

/** 残缺 JSON 里抠出 reply；整段都不是 JSON 就把原文当回答。 */
export function rescueReply(rawText: string | undefined): { reply: string } | null {
  const viaJson = salvageJson(replySchema)(rawText);
  if (viaJson) return viaJson;
  const quoted = rawText?.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (quoted) {
    try {
      const reply = JSON.parse(`"${quoted[1]}"`) as string;
      if (reply.trim()) return { reply: reply.trim().slice(0, 1_500) };
    } catch {}
  }
  const text = rawText?.trim() ?? "";
  return text && !text.startsWith("{") ? { reply: text.slice(0, 1_500) } : null;
}

function personaPrompt(persona: Persona): string {
  const weakLine = persona.weak
    ? `- 你不太懂的：${persona.weak.topic}。第一次被问到这个话题（或与它直接相关的问题）时，你必须把下面这句话一字不改地放进回答里，并且当作自己的真实看法说出来：「${persona.weak.wrongClaim}」。之后如果面试官追问或质疑，你可以犹豫、试图解释，但不要主动承认它是错的，除非面试官给出了明确的反驳理由。\n`
    : "";
  const unsupportableLine = persona.unsupportable
    ? `- 简历里这条成果你说不出细节：「${persona.unsupportable}」。被问到它的做法、度量方式或数字来源时，你只能给含糊、绕开或"记不清了"的回答，不要编造具体过程。\n`
    : "";
  const controlLine = persona.control
    ? "- 简历上的每一条你都能讲出做法、细节和数字来源，被质疑时给出依据；只说你有把握的技术判断，不确定的就说不确定，不要编造。\n"
    : "";
  const offtopic = persona.offtopic
    ? "\n- 你有个毛病：每次先针对问题答一两句，然后就转去讲大学社团、兴趣爱好、参加过的活动，越扯越远，直到被面试官打断才回到正题。"
    : "";
  return `你在扮演一位求职者参加模拟面试，简历见 resume。你的人设：
- 说话风格：${persona.style}。用第一人称、口语化的中文，像真人一样有停顿和不完美，不要列表、不要标题。每次回答 60 到 250 字。
- 你真正擅长的：${persona.strong.join("；")}。问到这些时答得具体、有细节、有取舍，可以引用简历里的数字。
${weakLine}${unsupportableLine}${controlLine}- 面试官请你自我介绍时，按简历做一到两分钟的口头介绍。
- 面试官如果只是解释题目或给提示，你就顺着提示继续答。
- 你不知道评分标准，也不要问面试官要标准；不要说自己在扮演。${offtopic}`;
}

export async function simulateCandidateReply(
  aux: AiTaskConfig,
  input: {
    persona: Persona;
    resumeText: string;
    jobTitle: string;
    transcript: TranscriptLine[];
    runId?: string;
  },
): Promise<{ reply: string }> {
  const output = await runAux(aux, {
    agent: "eval_candidate_simulator",
    promptVersion: SIMULATOR_PROMPT_VERSION,
    system: personaPrompt(input.persona),
    untrustedInputs: "简历、岗位名与对话记录",
    payload: {
      jobTitle: input.jobTitle,
      resume: input.resumeText.slice(0, 6_000),
      transcript: input.transcript.slice(-16),
      instruction: "写出你对面试官最后一句话的回答。",
    },
    schema: replySchema,
    maxOutputTokens: 800,
    timeoutMs: 45_000,
    runId: input.runId,
    rescue: rescueReply,
  });
  return output;
}
