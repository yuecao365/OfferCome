import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { ContentLanguage } from "@/lib/i18n/locale";

import { isSkillLayer, type SkillPack } from "./types";

const SKILLS_DIR = path.join(
  process.cwd(),
  "src",
  "lib",
  "mock-interviews",
  "skills",
);

/**
 * 解析 SKILL.md 的 YAML frontmatter。字段是封闭集合且全部平铺
 * （字符串或字符串数组），手写解析即可，不值得为此引依赖。
 */
/** frontmatter 里 `[a, b, c]` 形式的列表字段。 */
function listField(raw: string | undefined): string[] {
  return (raw ?? "[]")
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((item) => item.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

export function parseSkillMarkdown(raw: string): SkillPack | null {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;

  const fields = new Map<string, string>();
  for (const line of match[1]!.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    fields.set(
      line.slice(0, separator).trim(),
      line.slice(separator + 1).trim(),
    );
  }

  const name = fields.get("name") ?? "";
  const description = fields.get("description") ?? "";
  const layer = fields.get("layer") ?? "";
  if (!/^[a-z0-9-]{1,64}$/.test(name) || !description || !isSkillLayer(layer)) {
    return null;
  }
  const domains = listField(fields.get("domains"));
  if (layer === "detail" && domains.length === 0) return null;
  if (layer !== "detail" && domains.length > 0) return null;

  const keywords = listField(fields.get("keywords"));

  return { name, description, keywords, layer, domains, body: match[2]!.trim() };
}

const cachedPacks = new Map<ContentLanguage, SkillPack[]>();

/** 某种语言的包文件：中文 SKILL.md，英文 SKILL.en.md；英文缺失时回退中文（docs/i18n-plan.md §4）。 */
async function readPackFile(dir: string, language: ContentLanguage): Promise<string> {
  if (language === "en") {
    try {
      return await readFile(path.join(SKILLS_DIR, dir, "SKILL.en.md"), "utf8");
    } catch {
      console.warn(`[skills] 技能包没有英文版，回退中文：${dir}`);
    }
  }
  return readFile(path.join(SKILLS_DIR, dir, "SKILL.md"), "utf8");
}

/** 读取全部内置技能包（按面试语言）。目录名必须与 frontmatter name 一致（Anthropic 约定）。 */
export async function loadSkillPacks(language: ContentLanguage = "zh"): Promise<SkillPack[]> {
  const cached = cachedPacks.get(language);
  if (cached) return cached;

  const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
  const packs: SkillPack[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const raw = await readPackFile(entry.name, language);
      const pack = parseSkillMarkdown(raw);
      if (pack && pack.name === entry.name) packs.push(pack);
      else console.warn(`[skills] 跳过无效技能包目录：${entry.name}`);
    } catch {
      console.warn(`[skills] 技能包缺少 SKILL.md：${entry.name}`);
    }
  }

  // parent 必须真实存在，否则上溯会断链。
  const names = new Set(packs.map((pack) => pack.name));
  const usable = packs.filter((pack) => {
    const missing = pack.domains.find((domain) => !names.has(domain));
    if (missing) {
      console.warn(`[skills] 技能包 ${pack.name} 声明的领域不存在：${missing}`);
      return false;
    }
    return true;
  });
  cachedPacks.set(language, usable);
  return usable;
}
