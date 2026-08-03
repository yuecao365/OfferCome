export function createTaskLock<TBusy>(createBusyResult: () => TBusy) {
  let isRunning = false;

  return {
    async run<T>(task: () => Promise<T>): Promise<T | TBusy> {
      if (isRunning) {
        return createBusyResult();
      }

      isRunning = true;
      try {
        return await task();
      } finally {
        isRunning = false;
      }
    },
  };
}
