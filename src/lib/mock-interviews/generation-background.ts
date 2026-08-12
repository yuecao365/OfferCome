import "server-only";

import { after } from "next/server";

import { generateMockInterviewQuestions } from "./service";

export function scheduleMockInterviewGeneration(sessionId: string): void {
  after(async () => {
    await generateMockInterviewQuestions(sessionId);
  });
}
