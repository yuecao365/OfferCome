export async function runRefreshBatches<T extends { status: string }>({
  refresh,
  maxBatches,
}: {
  refresh: () => Promise<T>;
  maxBatches: number;
}): Promise<T | { status: "yielded" }> {
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const result = await refresh();
    if (result.status !== "processing") return result;
  }
  return { status: "yielded" };
}
