import path from "node:path";

export function getBossLocalPaths(cwd = process.cwd()) {
  const localDir = path.resolve(
    /* turbopackIgnore: true */ cwd,
    ".local",
    "boss",
  );

  return {
    localDir,
    browserProfileDir: path.join(localDir, "browser-profile"),
    storageStatePath: path.join(localDir, "storageState.json"),
  };
}
