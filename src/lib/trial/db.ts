import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { PrismaClient } from "@/generated/prisma/client";

import { getTrialContext, TRIAL_SESSION_TTL_MS } from "./session";

/**
 * 体验模式的按会话数据库。
 *
 * 每个访客会话对应一个从 demo.db 复制出来的临时 SQLite 文件——访客既能看到
 * 完整的示例数据，又和其他访客完全隔离；TTL 到期文件删除，"每次访问都要重填"
 * 由此成立。
 *
 * 对外暴露的是一个惰性代理：prisma.x.y(...) 在调用时才按当前会话解析出真正的
 * PrismaClient。这样全部业务代码保持 import { prisma } 不变。
 */

type TrialDbOptions = {
  /** 会话库的模板。默认取项目自带的 demo.db。 */
  sourceDbPath?: string;
  /** 会话文件目录。默认在系统临时目录下。 */
  directory?: string;
};

type ClientEntry = {
  client: PrismaClient;
  lastUsedAt: number;
};

const SWEEP_INTERVAL_MS = 5 * 60 * 1_000;
/** 单进程同时打开的会话库上限，防止连接数无界增长。 */
const MAX_OPEN_CLIENTS = 100;

export function createTrialPrismaProxy(
  createClient: (databaseUrl: string) => PrismaClient,
  options: TrialDbOptions = {},
): PrismaClient {
  const sourceDbPath =
    options.sourceDbPath ?? path.join(process.cwd(), "prisma", "demo.db");
  const directory =
    options.directory ?? path.join(tmpdir(), "offerlai-trial-sessions");
  const clients = new Map<string, ClientEntry>();
  let lastSweepAt = 0;

  function evict(sessionId: string, entry: ClientEntry): void {
    clients.delete(sessionId);
    void entry.client.$disconnect().catch(() => undefined);
  }

  /** 顺手清理：过期会话关连接、删文件；打开数超限时踢最久未用的。 */
  function sweep(now: number): void {
    if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
    lastSweepAt = now;

    for (const [sessionId, entry] of clients) {
      if (now - entry.lastUsedAt >= TRIAL_SESSION_TTL_MS) {
        evict(sessionId, entry);
      }
    }

    let files: string[] = [];
    try {
      files = readdirSync(directory);
    } catch {
      return;
    }
    for (const file of files) {
      const filePath = path.join(directory, file);
      try {
        if (now - statSync(filePath).mtimeMs >= TRIAL_SESSION_TTL_MS) {
          rmSync(filePath, { force: true });
        }
      } catch {
        // 文件可能刚被并发删除，忽略。
      }
    }
  }

  async function resolveClient(): Promise<PrismaClient> {
    const context = await getTrialContext();
    if (!context) {
      throw new Error("体验会话尚未建立，请刷新页面后重试。");
    }

    const now = Date.now();
    sweep(now);

    let entry = clients.get(context.sessionId);
    if (!entry) {
      if (clients.size >= MAX_OPEN_CLIENTS) {
        const oldest = [...clients.entries()].sort(
          (left, right) => left[1].lastUsedAt - right[1].lastUsedAt,
        )[0];
        if (oldest) evict(oldest[0], oldest[1]);
      }
      const file = path.join(directory, `${context.sessionId}.db`);
      mkdirSync(directory, { recursive: true });
      try {
        // 已有会话文件不覆盖——访客中途刷新不能丢掉已生成的面试。
        copyFileSync(sourceDbPath, file, 1 /* COPYFILE_EXCL */);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      entry = { client: createClient(`file:${file}`), lastUsedAt: now };
      clients.set(context.sessionId, entry);
    }
    entry.lastUsedAt = now;
    return entry.client;
  }

  function memberProxy(property: string): unknown {
    return new Proxy(function () {} as unknown as Record<string, unknown>, {
      // prisma.resume.findMany(...) 这类 delegate 方法。
      get(_target, method) {
        if (typeof method !== "string" || method === "then") return undefined;
        return (...args: unknown[]) =>
          resolveClient().then((client) => {
            const delegate = (client as unknown as Record<string, unknown>)[
              property
            ] as Record<string, (...call: unknown[]) => unknown>;
            return delegate[method]!(...args);
          });
      },
      // prisma.$transaction(...) / prisma.$disconnect() 这类顶层方法。
      apply(_target, _thisArg, args: unknown[]) {
        return resolveClient().then((client) => {
          const method = (client as unknown as Record<string, unknown>)[
            property
          ] as (...call: unknown[]) => unknown;
          return method.apply(client, args);
        });
      },
    });
  }

  return new Proxy({} as PrismaClient, {
    get(_target, property) {
      if (typeof property !== "string" || property === "then") return undefined;
      return memberProxy(property);
    },
  });
}
