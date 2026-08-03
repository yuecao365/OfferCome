import assert from "node:assert/strict";
import test from "node:test";

import { prisma } from "@/lib/db";

test("deleting a resume removes only resume links, not resume projects or review questions", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const resume = await prisma.resume.create({
    data: {
      originalName: `delete-test-${suffix}.pdf`,
      storedName: `delete-test-${suffix}.pdf`,
      filePath: `.local/uploads/resumes/delete-test-${suffix}.pdf`,
      mimeType: "application/pdf",
      fileSize: 10,
    },
    select: { id: true },
  });
  const otherResume = await prisma.resume.create({
    data: {
      originalName: `delete-test-other-${suffix}.pdf`,
      storedName: `delete-test-other-${suffix}.pdf`,
      filePath: `.local/uploads/resumes/delete-test-other-${suffix}.pdf`,
      mimeType: "application/pdf",
      fileSize: 10,
    },
    select: { id: true },
  });
  const project = await prisma.resumeProject.create({
    data: {
      resumeId: resume.id,
      name: `Delete Test Project ${suffix}`,
      type: "project",
    },
    select: { id: true },
  });
  const interview = await prisma.interview.create({
    data: {
      companyName: "Delete Test Co",
      jobTitle: "Frontend Engineer",
      interviewedAt: new Date("2026-07-01T00:00:00.000Z"),
    },
    select: { id: true },
  });
  const question = await prisma.interviewQuestion.create({
    data: {
      interviewId: interview.id,
      question: "Tell me about this project.",
      category: "resume_project",
      resumeProjectId: project.id,
      sortOrder: 0,
    },
    select: { id: true },
  });

  await prisma.resumeProjectSource.createMany({
    data: [
      {
        resumeId: resume.id,
        resumeProjectId: project.id,
        extractedName: `Extracted ${suffix}`,
        finalName: `Delete Test Project ${suffix}`,
      },
      {
        resumeId: otherResume.id,
        resumeProjectId: project.id,
        extractedName: `Other Extracted ${suffix}`,
        finalName: `Delete Test Project ${suffix}`,
      },
    ],
  });

  try {
    await prisma.resume.delete({ where: { id: resume.id } });

    assert.equal(
      await prisma.resume.findUnique({ where: { id: resume.id } }),
      null,
    );
    assert.equal(
      await prisma.resumeProjectSource.count({ where: { resumeId: resume.id } }),
      0,
    );
    assert.equal(
      await prisma.resumeProject.count({ where: { id: project.id } }),
      1,
    );
    assert.equal(
      await prisma.resumeProjectSource.count({
        where: { resumeId: otherResume.id, resumeProjectId: project.id },
      }),
      1,
    );

    const remainingQuestion = await prisma.interviewQuestion.findUnique({
      where: { id: question.id },
      select: { resumeProjectId: true },
    });
    assert.equal(remainingQuestion?.resumeProjectId, project.id);
  } finally {
    await prisma.interview.deleteMany({ where: { id: interview.id } });
    await prisma.resumeProjectSource.deleteMany({
      where: { resumeProjectId: project.id },
    });
    await prisma.resumeProject.deleteMany({ where: { id: project.id } });
    await prisma.resume.deleteMany({
      where: { id: { in: [resume.id, otherResume.id] } },
    });
  }
});

