import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = path.resolve("eval/mianjing");
const RAW_DIR = path.join(ROOT, "raw");
const OUTPUT_DIR = path.join(ROOT, "extracted");

function decodeEntities(value) {
  const named = new Map([
    ["nbsp", " "], ["amp", "&"], ["lt", "<"], ["gt", ">"],
    ["quot", '"'], ["apos", "'"], ["hellip", "…"], ["middot", "·"],
  ]);
  return value
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (all, name) => named.get(name.toLowerCase()) ?? all);
}

function htmlToText(html) {
  let text = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<(?:br|hr)\b[^>]*>/gi, "\n")
    .replace(/<\/(?:p|li|h[1-6]|div|blockquote|section|ol|ul|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  text = decodeEntities(decodeEntities(text));
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseRawMetadata(markdown) {
  const get = (key) => markdown.match(new RegExp(`^${key}: (.+)$`, "m"))?.[1]?.trim() ?? "";
  const separator = markdown.search(/^---\r?\n/m);
  const body = separator >= 0 ? markdown.slice(separator).replace(/^---\r?\n/, "").trim() : "";
  return {
    source: get("source"),
    company: get("company"),
    role: get("role") || "backend",
    title: get("title"),
    fetched: get("fetched"),
    body,
    year: body.match(/20(?:25|26)/)?.[0] ?? null,
  };
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "user-agent": "Mozilla/5.0 Codex interview-question extractor",
      accept: "text/html,application/json",
      ...(options.headers ?? {}),
    },
    signal: AbortSignal.timeout(40_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function extractInitialState(html) {
  const marker = "window.__INITIAL_STATE__=";
  const start = html.indexOf(marker);
  if (start < 0) return null;
  const jsonStart = start + marker.length;
  if (html[jsonStart] !== "{") return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = jsonStart; index < html.length; index += 1) {
    const char = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(jsonStart, index + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function normalizeTitle(value) {
  return String(value ?? "").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function collectRichText(value, targetId, targetTitle, output = []) {
  if (!value || typeof value !== "object") return output;
  if (typeof value.richText === "string" && value.richText.length > 50) {
    let score = 0;
    const directIds = [value.id, value.contentId, value.uuid, value.targetId].filter(Boolean).map(String);
    if (directIds.includes(targetId)) score += 100;
    if (normalizeTitle(value.title) === normalizeTitle(targetTitle)) score += 80;
    output.push({ html: value.richText, score });
  }
  for (const child of Object.values(value)) collectRichText(child, targetId, targetTitle, output);
  return output;
}

function githubOriginalBody(body) {
  const originalStart = body.indexOf("## 原始正文");
  if (originalStart < 0) return body;
  const attachmentStart = body.indexOf("## 原始附件", originalStart);
  const section = body.slice(originalStart + "## 原始正文".length, attachmentStart < 0 ? body.length : attachmentStart);
  return section
    .replace(/^### .*$/gm, "")
    .replace(/^> ?/gm, "")
    .trim();
}

async function readArticle(source, targetTitle) {
  const url = new URL(source);
  if (url.hostname === "github.com") {
    const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
    if (!match) throw new Error("unsupported GitHub URL");
    const [, owner, repo, issue] = match;
    const api = `https://api.github.com/repos/${owner}/${repo}/issues/${issue}`;
    const json = JSON.parse(await fetchText(api, { headers: { accept: "application/vnd.github+json" } }));
    return { text: githubOriginalBody(json.body ?? ""), method: "github_issue_body" };
  }

  if (url.hostname.endsWith("nowcoder.com")) {
    const targetId = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
    if (url.pathname.startsWith("/feed/")) {
      const api = `https://gw-c.nowcoder.com/api/sparta/detail/moment-data/detail/${targetId}`;
      try {
        const payload = JSON.parse(await fetchText(api, {
          headers: {
            origin: "https://www.nowcoder.com",
            referer: source,
            accept: "application/json",
          },
        }));
        const data = payload?.data;
        if (payload?.success && data && String(data.uuid) === targetId && typeof data.content === "string") {
          return { text: htmlToText(data.content), method: "nowcoder_public_api" };
        }
      } catch {
        // Fall through to the public rendered page and its preview metadata.
      }
      url.hostname = "api-cdn.nowcoder.com";
    }
    const html = await fetchText(url.toString());
    const stateTexts = collectRichText(extractInitialState(html), targetId, targetTitle)
      .map((item) => ({ text: htmlToText(item.html), score: item.score }));
    const placeholderTexts = [...html.matchAll(/<div class="placeholder-text"[^>]*>([\s\S]*?)<\/div>/gi)]
      .map((match) => {
        const prefix = html.slice(Math.max(0, match.index - 3000), match.index);
        let score = 0;
        if (prefix.includes(targetId)) score += 100;
        if (normalizeTitle(prefix).includes(normalizeTitle(targetTitle))) score += 80;
        return { text: htmlToText(match[1]), score };
      });
    const candidates = [...stateTexts, ...placeholderTexts]
      .filter((item) => item.text)
      .sort((a, b) => b.score - a.score || b.text.length - a.text.length);
    if (candidates[0]?.score > 0) return { text: candidates[0].text, method: "nowcoder_rendered_body" };
    const description = html.match(/<meta name="description" content="([\s\S]*?)"\s*\/>/i)?.[1] ?? "";
    return { text: htmlToText(description), method: "nowcoder_description" };
  }

  throw new Error("unsupported source URL");
}

function normalizeForSplitting(text) {
  return text
    .replace(/\r/g, "")
    .replace(/([。；;！？?）)])(?=\d{1,2}[.、．](?!\d))/g, "$1\n")
    .replace(/(?<!\d)[（(](\d{1,2})[）)](?=\s*[^\d\s])/g, "\n$1. ")
    .replace(/(?<!\d)(\d{1,2})[.、．](?=\s*[^\d\s])/g, "\n$1. ")
    .replace(/(?<!\d)(\d{1,2})[：:](?=\s*[^\d\s])/g, "\n$1. ")
    .replace(/\n{3,}/g, "\n\n");
}

function cleanQuestion(value) {
  return value
    .replace(/^\s*(?:>|[-*•●▪◦❶-❿])\s*/, "")
    .replace(/^\s*\d{1,2}[.、．：:]\s*/, "")
    .replace(/^\s*(?:Q|问题|问|M)\s*\d*\s*[：:、.；;]\s*/i, "")
    .replace(/\s*#(?:[^#\n]+#\s*)+$/g, "")
    .replace(/_牛客网_牛客在手[,，]?offer不愁.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeHeading(text) {
  return /^(?:一面|二面|三面|四面|五面|终面|HR面|主管面|加面|交叉面|反问|反问流程|八股|Java八股文|项目|项目问题|项目深挖|算法|手撕|数据库|分布式|微服务|面试问题|问题|面经|技术面|面试流程|开场|总结|正文|Java|MySQL|Redis|计算机网络|操作系统|项目结束)[：:]?$/i.test(text)
    || /^(?:项目|实习|八股).*(?:拷打|为主|问的不多|开始)[：:]?$/i.test(text);
}

function looksLikeNarrative(text) {
  // 带答案的整理帖：答、我的回答、标准答案、AI 补充/点评、W（我）都不是题目。
  if (/^(?:答|A|我的回答|标准答案|AI\s*补充|AI\s*点评|参考答案|回答|W\s*[；;：:]|hr|HR)/i.test(text)) return true;
  return /^(?:更新|时间线|timeline|写在前面|面试官|面试整体|整体|总时长|面试时长|感觉|总结|结果|后续|发出来|求个|许愿|登录|关注|点赞|评论|分享|点评|站在|现场|全程|基本全程|无手撕|讲了|然后拷打|官网投递|微信公众号|流程|不知道|个人博客|主页|发布于|编辑于|记录于|附面经|金三银四|小小打个广告|考虑接|项目结束|算法也不算|二面面完|面了|主要是对项目|说感觉|说部门|另外可以看到|相信努力|答[：:]?|回答[了：:]|[（(](?:答|感觉回答)|因为|所以|首先|状态机的选型是为了|分布式锁的原因是|高可用机制[：:]|腾讯会议在)/i.test(text)
    || /(?:已上线|演示项目|访问我的|牛客在手|offer不愁|求职之前|一站解决|找到好工作|还在泡|完整前后端代码|个人主页)/i.test(text);
}

const TECH_OR_INTERVIEW_TERM = /(?:Java|JVM|JMM|Spring|MySQL|Redis|Kafka|RabbitMQ|RocketMQ|HTTP|TCP|UDP|Linux|数据库|索引|事务|锁|线程|进程|协程|GC|AQS|CAS|HashMap|ConcurrentHashMap|算法|手撕|链表|二叉树|B\+?树|数组|SQL|项目|实习|RPC|gRPC|Docker|K8s|Nginx|Agent|RAG|大模型|消息队列|缓存|分布式|网络|操作系统|设计模式|限流|秒杀|库存|QPS|WebSocket|SSE|channel|goroutine|反射|类加载|中间件|线程池|乐观锁|悲观锁|一致性|微服务|场景题|智力题|代码题|反问)/i;

function isQuestionCandidate(text, hadNumber, hadBullet) {
  if (text.length < 3 || text.length > 600 || looksLikeHeading(text)) return false;
  if (/(?:https?:\/\/|^#|Image\b)/i.test(text)) return false;
  if ((hadNumber || hadBullet) && TECH_OR_INTERVIEW_TERM.test(text)) return true;
  if (/[?？]$/.test(text)) return true;
  if (/^(?:请|介绍|讲|说|谈谈|聊聊|写|实现|设计|手撕|算法|场景|为什么|为何|如何|怎么|怎样|是否|有没有|了解|解释|比较|区别|给定|假设|项目中|项目里|问|追问|说说|谈一下)/.test(text)) return true;
  if (text.length <= 160 && TECH_OR_INTERVIEW_TERM.test(text)) return true;
  return false;
}

function splitQuestions(sourceText) {
  const normalized = normalizeForSplitting(sourceText);
  const lines = normalized.split(/\n+/);
  const questions = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    const hadNumber = /^\s*\d{1,2}[.、．：:]/.test(trimmed);
    const hadBullet = /^\s*(?:>|[-*•●▪◦])\s*/.test(trimmed);
    let question = cleanQuestion(trimmed);
    if (!question || looksLikeNarrative(question)) continue;

    const questionMarkParts = question.match(/[^？?]{3,}[？?]/g);
    if (!hadNumber && questionMarkParts?.length > 1) {
      for (const part of questionMarkParts) {
        const cleaned = cleanQuestion(part);
        if (isQuestionCandidate(cleaned, false, false)) questions.push(cleaned);
      }
      continue;
    }

    if (isQuestionCandidate(question, hadNumber, hadBullet)) questions.push(question);
  }

  return [...new Set(questions)];
}

/** raw 里已经保存了全文（fetched: full）的直接离线抽取，不再联网。 */
async function readSource(metadata) {
  if (metadata.fetched === "full" && metadata.body.length > 50) {
    const text = /<[a-z][^>]*>/i.test(metadata.body) ? htmlToText(metadata.body) : metadata.body;
    return { text, method: "raw_body" };
  }
  return readArticle(metadata.source, metadata.title);
}

async function extractOne(filename) {
  const markdown = await fs.readFile(path.join(RAW_DIR, filename), "utf8");
  const metadata = parseRawMetadata(markdown);
  try {
    const article = await readSource(metadata);
    const questions = splitQuestions(article.text);
    return {
      source: metadata.source,
      company: metadata.company,
      role: metadata.role,
      title: metadata.title,
      year: metadata.year,
      status: questions.length > 0 ? (article.method === "nowcoder_description" ? "partial" : "extracted") : "no-questions-found",
      extraction_method: article.method,
      question_count: questions.length,
      questions,
    };
  } catch (error) {
    return {
      source: metadata.source,
      company: metadata.company,
      role: metadata.role,
      title: metadata.title,
      year: metadata.year,
      status: "fetch-failed",
      extraction_method: null,
      question_count: 0,
      questions: [],
      error: String(error.message ?? error),
    };
  }
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const requested = process.argv.slice(2);
  const files = requested.length > 0
    ? requested.map((name) => name.endsWith(".md") ? name : `${name.replace(/\.json$/, "")}.md`)
    : (await fs.readdir(RAW_DIR)).filter((name) => name.endsWith(".md")).sort();
  const results = [];
  let cursor = 0;

  async function worker() {
    while (cursor < files.length) {
      const index = cursor++;
      const filename = files[index];
      const output = await extractOne(filename);
      const outputName = filename.replace(/\.md$/, ".json");
      await fs.writeFile(path.join(OUTPUT_DIR, outputName), `${JSON.stringify(output, null, 2)}\n`, "utf8");
      results[index] = { file: outputName, status: output.status, question_count: output.question_count };
      process.stdout.write(`${outputName}\t${output.status}\t${output.question_count}\n`);
    }
  }

  await Promise.all(Array.from({ length: Math.min(3, files.length) }, () => worker()));
  if (requested.length === 0) {
    const statusCounts = {};
    for (const item of results) statusCounts[item.status] = (statusCounts[item.status] ?? 0) + 1;
    const summary = {
      generated_at: new Date().toISOString(),
      total: results.length,
      total_questions: results.reduce((sum, item) => sum + item.question_count, 0),
      status_counts: statusCounts,
      files: results,
    };
    await fs.writeFile(path.join(OUTPUT_DIR, "_summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  }
}

await main();
