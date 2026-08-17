import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

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
  const parent = fields.get("parent") || undefined;
  if (layer === "stack" && !parent) return null;

  const keywordsRaw = fields.get("keywords") ?? "[]";
  const keywords = keywordsRaw
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((item) => item.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);

  return { name, description, keywords, layer, parent, body: match[2]!.trim() };
}

let cachedPacks: SkillPack[] | null = null;

/** 读取全部内置技能包。目录名必须与 frontmatter name 一致（Anthropic 约定）。 */
export async function loadSkillPacks(): Promise<SkillPack[]> {
  if (cachedPacks) return cachedPacks;

  const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
  const packs: SkillPack[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const raw = await readFile(
        path.join(SKILLS_DIR, entry.name, "SKILL.md"),
        "utf8",
      );
      const pack = parseSkillMarkdown(raw);
      if (pack && pack.name === entry.name) packs.push(pack);
      else console.warn(`[skills] 跳过无效技能包目录：${entry.name}`);
    } catch {
      console.warn(`[skills] 技能包缺少 SKILL.md：${entry.name}`);
    }
  }

  // parent 必须真实存在，否则上溯会断链。
  const names = new Set(packs.map((pack) => pack.name));
  cachedPacks = packs.filter((pack) => {
    if (pack.parent && !names.has(pack.parent)) {
      console.warn(`[skills] 技能包 ${pack.name} 的 parent 不存在：${pack.parent}`);
      return false;
    }
    return true;
  });
  return cachedPacks;
}
