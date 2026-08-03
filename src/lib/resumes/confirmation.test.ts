import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPendingResumeExperienceConfirmations,
  resolveResumeExperienceConfirmations,
  resumeExperienceTypeLabel,
} from "./confirmation";
import type {
  ExistingResumeProjectOption,
  ResumeExperienceConfirmationInput,
} from "./confirmation";
import type { ExtractedResumeExperience } from "./extract";

const existingProjects: ExistingResumeProjectOption[] = [
  {
    id: "project-1",
    name: "Study Assistant - Local Personal Assistant Based on LLM Agents",
    type: "project",
    organization: null,
  },
  {
    id: "internship-1",
    name: "Software Engineer Intern",
    type: "internship",
    organization: "OpenAI",
  },
];

const extractedProject: ExtractedResumeExperience = {
  title: " Study Assistant Local Personal Assistant Based on LLM Agents ",
  type: "project",
  organization: null,
  description: "Built a local assistant.",
  startDate: null,
  endDate: null,
  sourceText: "Study Assistant Local Personal Assistant Based on LLM Agents",
  sortOrder: 0,
};

test("preselects a similar existing resume project", () => {
  const pending = buildPendingResumeExperienceConfirmations(
    [extractedProject],
    existingProjects,
  );

  assert.equal(pending.length, 1);
  assert.equal(pending[0].recommendedExistingItemId, "project-1");
  assert.equal(pending[0].selectedExistingItemId, "project-1");
});

test("uses concise user-facing type labels", () => {
  assert.equal(resumeExperienceTypeLabel("internship"), "实习");
  assert.equal(resumeExperienceTypeLabel("project"), "项目");
});

test("defaults to new item when no similar existing project exists", () => {
  const pending = buildPendingResumeExperienceConfirmations(
    [
      {
        ...extractedProject,
        title: "Persona-Driven LLM Agents for Social Media Community Engagement",
      },
    ],
    existingProjects,
  );

  assert.equal(pending[0].recommendedExistingItemId, null);
  assert.equal(pending[0].selectedExistingItemId, null);
});

test("creates a new resume project when user confirms new item", () => {
  const input: ResumeExperienceConfirmationInput[] = [
    {
      clientId: "item-1",
      type: "project",
      extractedName: "Persona-Driven LLM Agents",
      finalName: "Persona-Driven LLM Agents for Social Media Community Engagement",
      existingItemId: null,
      organization: null,
      description: "Built persona-driven agents.",
      startDate: null,
      endDate: null,
      sourceText: "Persona-Driven LLM Agents",
      sortOrder: 0,
    },
  ];

  const resolved = resolveResumeExperienceConfirmations(input, existingProjects);

  assert.deepEqual(
    resolved.creates.map((item) => item.name),
    ["Persona-Driven LLM Agents for Social Media Community Engagement"],
  );
  assert.equal(resolved.links.length, 0);
});

test("links an existing project without creating a duplicate", () => {
  const resolved = resolveResumeExperienceConfirmations(
    [
      {
        clientId: "item-1",
        type: "project",
        extractedName: "Study Assistant",
        finalName: "Study Assistant",
        existingItemId: "project-1",
        organization: null,
        description: null,
        startDate: null,
        endDate: null,
        sourceText: "Study Assistant",
        sortOrder: 0,
      },
    ],
    existingProjects,
  );

  assert.equal(resolved.creates.length, 0);
  assert.equal(resolved.links.length, 1);
  assert.equal(resolved.links[0].resumeProjectId, "project-1");
});

test("uses edited name when creating a confirmed new item", () => {
  const resolved = resolveResumeExperienceConfirmations(
    [
      {
        clientId: "item-1",
        type: "project",
        extractedName: "Study Assistant",
        finalName: "Study Assistant - Local Personal Assistant Based on LLM Agents",
        existingItemId: null,
        organization: null,
        description: null,
        startDate: null,
        endDate: null,
        sourceText: "Study Assistant",
        sortOrder: 0,
      },
    ],
    [],
  );

  assert.equal(
    resolved.creates[0].name,
    "Study Assistant - Local Personal Assistant Based on LLM Agents",
  );
});

test("does not create an exact duplicate when user leaves new item selected", () => {
  const resolved = resolveResumeExperienceConfirmations(
    [
      {
        clientId: "item-1",
        type: "project",
        extractedName: "Study Assistant",
        finalName: "Study Assistant - Local Personal Assistant Based on LLM Agents",
        existingItemId: null,
        organization: null,
        description: null,
        startDate: null,
        endDate: null,
        sourceText: "Study Assistant",
        sortOrder: 0,
      },
    ],
    existingProjects,
  );

  assert.equal(resolved.creates.length, 0);
  assert.equal(resolved.links[0].resumeProjectId, "project-1");
});

test("rejects linking to a missing existing project", () => {
  assert.throws(
    () =>
      resolveResumeExperienceConfirmations(
        [
          {
            clientId: "item-1",
            type: "project",
            extractedName: "Missing",
            finalName: "Missing",
            existingItemId: "missing-id",
            organization: null,
            description: null,
            startDate: null,
            endDate: null,
            sourceText: "Missing",
            sortOrder: 0,
          },
        ],
        existingProjects,
      ),
    /不存在/,
  );
});
