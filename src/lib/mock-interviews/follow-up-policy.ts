export function followUpLimit(mainQuestionCount: number): number {
  return Math.min(3, Math.floor(Math.max(0, mainQuestionCount) / 3));
}

export function canRequestFollowUp(input: {
  mainQuestionCount: number;
  existingFollowUpCount: number;
  hasFollowUpForQuestion: boolean;
}): boolean {
  return (
    !input.hasFollowUpForQuestion &&
    input.existingFollowUpCount < followUpLimit(input.mainQuestionCount)
  );
}
