import type { BossContactCandidate } from "./parse";

export const BOSS_CONTACT_SELECTORS = {
  rows: [
    ".job-card-wrapper",
    ".job-card-body",
    ".job-list-box li",
    ".recommend-job-list li",
    "[class*='job-card']",
    "[class*='chat-list'] li",
    "[class*='chat-list'] [class*='item']",
    "[class*='contact-list'] li",
    "[class*='contact-list'] [class*='item']",
    "[class*='conversation'] li",
    "[class*='conversation'] [class*='item']",
    "a[href*='/web/geek/chat']",
    "a[href*='job_detail']",
    "[data-jid]",
    "[data-jobid]",
  ],
  companyNames: [
    ".company-name",
    ".companyName",
    ".brand-name",
    "[class*='brand-name']",
    "[class*='brandName']",
    "[class*='company-name']",
    "[class*='companyName']",
    "[class*='company']",
    "[class*='brand']",
  ],
  jobTitles: [
    ".job-title",
    ".job-name",
    ".jobName",
    ".job-name a",
    "[class*='jobName']",
    "[class*='job-title']",
    "[class*='job-name']",
    ".position-name",
    "[class*='position-name']",
    "[class*='position']",
  ],
} as const;

export type BossContactSelectors = typeof BOSS_CONTACT_SELECTORS;

export type BossDomExtractionResult = {
  candidates: BossContactCandidate[];
  diagnostics: {
    url: string;
    title: string;
    rowCount: number;
    companyElementCount: number;
    jobElementCount: number;
  };
};

export function buildBossContactExtractionExpression(
  selectors: BossContactSelectors = BOSS_CONTACT_SELECTORS,
): string {
  const serializedSelectors = JSON.stringify(selectors);

  return `
(() => {
  const selectors = ${serializedSelectors};
  const clean = (value) => (value || "").replace(/\\s+/g, " ").trim();
  const rowElements = new Set();

  for (const selector of selectors.rows) {
    document
      .querySelectorAll(selector)
      .forEach((element) => rowElements.add(element));
  }

  for (const selector of selectors.companyNames) {
    document.querySelectorAll(selector).forEach((element) => {
      const row = element.closest(
        "li, a, [role='listitem'], [class*='item'], [class*='card']",
      );
      if (row) rowElements.add(row);
    });
  }

  const getText = (root, selectorList) => {
    for (const selector of selectorList) {
      const element = root.matches(selector)
        ? root
        : root.querySelector(selector);
      const text = clean(element && element.textContent);
      if (text) return text;
    }
    return "";
  };

  const getHref = (root) => {
    if (root instanceof HTMLAnchorElement) return root.href;
    const link = root.querySelector("a[href]");
    return link instanceof HTMLAnchorElement ? link.href : null;
  };

  const candidates = Array.from(rowElements)
    .slice(0, 250)
    .map((row) => ({
      companyName: getText(row, selectors.companyNames),
      jobTitle: getText(row, selectors.jobTitles),
      href: getHref(row),
    }))
    .filter((candidate) => candidate.companyName && candidate.jobTitle);

  return {
    candidates,
    diagnostics: {
      url: window.location.href,
      title: document.title,
      rowCount: rowElements.size,
      companyElementCount: selectors.companyNames.reduce(
        (count, selector) => count + document.querySelectorAll(selector).length,
        0,
      ),
      jobElementCount: selectors.jobTitles.reduce(
        (count, selector) => count + document.querySelectorAll(selector).length,
        0,
      ),
    },
  };
})()
`;
}
