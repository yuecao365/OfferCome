import assert from "node:assert/strict";
import test from "node:test";

import { parseApplicationFormData } from "./form";

test("parses valid manual application form data", () => {
  const formData = new FormData();
  formData.set("companyName", " Example Co ");
  formData.set("jobTitle", " Frontend Engineer ");
  formData.set("appliedAt", "2026-07-07T09:30");
  formData.set("stage", "first_interview");
  formData.set("source", "");
  formData.set("jobUrl", " https://example.com/jobs/1 ");
  formData.set("note", " Follow up next week ");

  const parsed = parseApplicationFormData(formData);

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.companyName, "Example Co");
  assert.equal(parsed.value.jobTitle, "Frontend Engineer");
  assert.equal(parsed.value.stage, "first_interview");
  assert.equal(parsed.value.source, "manual");
  assert.equal(parsed.value.sourceKey, "manual:https://example.com/jobs/1");
  assert.equal(parsed.value.note, "Follow up next week");
});

test("rejects missing required manual application fields", () => {
  const parsed = parseApplicationFormData(new FormData());

  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.match(parsed.message, /公司名称/);
});
