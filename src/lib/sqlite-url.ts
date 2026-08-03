import path from "node:path";
import process from "node:process";

export function resolvePrismaSqliteUrl(
  databaseUrl: string,
  projectRoot = process.cwd(),
): string {
  if (!databaseUrl.startsWith("file:")) {
    return databaseUrl;
  }

  const sqlitePath = databaseUrl.slice("file:".length);

  if (sqlitePath === ":memory:" || path.isAbsolute(sqlitePath)) {
    return databaseUrl;
  }

  return `file:${path.resolve(projectRoot, sqlitePath)}`;
}
