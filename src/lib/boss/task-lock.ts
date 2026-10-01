export function createTaskLock<TBusy, TContext = undefined>(
  createBusyResult: (context?: TContext) => TBusy,
) {
  let isRunning = false;

  return {
    /** context 只用来生成"忙"时的结果（如界面语言），不传给任务。 */
    async run<T>(task: () => Promise<T>, context?: TContext): Promise<T | TBusy> {
      if (isRunning) {
        return createBusyResult(context);
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
