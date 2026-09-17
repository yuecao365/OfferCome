import assert from "node:assert/strict";
import test from "node:test";

import { DOSSIER_MAX_CHARS, DOSSIER_SECTION_MAX_LINES, DOSSIER_SECTIONS, dossierExcerpt, dossierOf, dossierSections, emptyDossier, normalizeDossier } from "./dossier-doc";

/** 候选人档案（G4）的纯函数：模板五段齐全；规范化补缺段、丢多余段、封顶；摘录只取前三段且跳过空段；快照里的读法。 */

test("空模板五段齐全；规范化：缺的段补（无）、段名不认的丢掉、顺序固定、长度封顶", () => {
  const sections = dossierSections(emptyDossier());
  assert.deepEqual([...sections.keys()], [...DOSSIER_SECTIONS]);
  const messy = "随便写的开头\n## 反复出现的短板\n- 没说清测量条件 ×2 场\n## 模型自创的段\n- 不该进档案\n## 已验证的说法\n- 2026-09-01 · Agent 开发：P95 讲清了";
  const normalized = normalizeDossier(messy);
  assert.ok(normalized.startsWith("# 候选人档案\n\n## 已验证的说法\n- 2026-09-01 · Agent 开发：P95 讲清了\n\n## 没讲清的说法\n（无）\n\n## 反复出现的短板\n- 没说清测量条件 ×2 场"));
  assert.doesNotMatch(normalized, /模型自创|随便写/);
  assert.equal(normalizeDossier(`## 已验证的说法\n${"字".repeat(DOSSIER_MAX_CHARS)}`).length, DOSSIER_MAX_CHARS);
  // 每段最多 N 条，多出的从后面丢（提示词要求重要的、最近的排前面）。
  const many = `## 没讲清的说法\n${Array.from({ length: DOSSIER_SECTION_MAX_LINES + 3 }, (_, index) => `- 第 ${index + 1} 条`).join("\n")}`;
  const capped = dossierSections(normalizeDossier(many)).get("没讲清的说法")!;
  assert.equal(capped.split("\n").length, DOSSIER_SECTION_MAX_LINES);
  assert.match(capped, /第 1 条/);
  assert.doesNotMatch(capped, new RegExp(`第 ${DOSSIER_SECTION_MAX_LINES + 1} 条`));
});

test("摘录只取已验证 / 没讲清 / 反复出现三段，空段跳过，封顶；快照里没有或坏的为 null", () => {
  const body = "# 候选人档案\n\n## 已验证的说法\n- A\n\n## 没讲清的说法\n（无）\n\n## 反复出现的短板\n- B\n\n## 问过的项目角度\n- C\n\n## 场次记录\n- D";
  assert.equal(dossierExcerpt(body), "已验证的说法：\n- A\n反复出现的短板：\n- B");
  assert.equal(dossierExcerpt(body, 12), "已验证的说法：\n- A\n");
  assert.equal(dossierOf(null), null);
  assert.equal(dossierOf("{oops"), null);
  assert.equal(dossierOf(JSON.stringify({ dossier: { version: 2, body: "   " } })), null);
  assert.deepEqual(dossierOf(JSON.stringify({ dossier: { version: 2, body } })), { version: 2, body });
});
