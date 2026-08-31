import { useEffect, useSyncExternalStore } from "react";

/**
 * 浏览器端文档存储的通用底座。
 *
 * 体验版没有服务端状态，浏览器存储就是唯一的"真相来源"；React 感知不到
 * 它的变化，所以每种文档都要一套 订阅 + 稳定快照（useSyncExternalStore
 * 的两个要求）。这里把这套模式收拢成一个工厂，避免每种文档各抄一遍。
 *
 * 读写都吞掉存储异常——隐私模式、禁用站点数据等场景下 Storage 访问本身
 * 会抛错，不能让它打断页面；代价只是刷新后数据丢失。
 */

export type StoredDocument<T> = {
  read(): T | null;
  write(value: T | null): void;
  subscribe(listener: () => void): () => void;
  /** 稳定引用快照：原始串没变就返回上次解析出的对象，否则无限重渲染。 */
  getSnapshot(): T | null;
  /** 服务端渲染时没有浏览器存储，一律当作"还没有数据"。 */
  getServerSnapshot(): null;
  /** 通知订阅者重读。见 useStoredDocument 的水合说明。 */
  sync(): void;
};

export function createStoredDocument<T>(options: {
  key: string;
  /** 惰性取存储：模块可能在没有 window 的环境（SSR、测试）被加载。 */
  storage: () => Storage;
  /** 存储内容是外部输入，解析必须校验，不合法一律当作没有。 */
  parse: (value: unknown) => T | null;
  serialize?: (value: T) => string;
}): StoredDocument<T> {
  const serialize = options.serialize ?? ((value: T) => JSON.stringify(value));
  const listeners = new Set<() => void>();
  let cache: { raw: string | null; value: T | null } = { raw: null, value: null };

  function readRaw(): string | null {
    try {
      return options.storage().getItem(options.key);
    } catch {
      return null;
    }
  }

  function parseRaw(raw: string | null): T | null {
    if (raw === null) return null;
    try {
      return options.parse(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  function notify(): void {
    for (const listener of listeners) listener();
  }

  return {
    read: () => parseRaw(readRaw()),
    write(value) {
      try {
        if (value === null) options.storage().removeItem(options.key);
        else options.storage().setItem(options.key, serialize(value));
      } catch {
        // 存不进去也要能继续用。
      }
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      const raw = readRaw();
      if (raw !== cache.raw) {
        cache = { raw, value: parseRaw(raw) };
      }
      return cache.value;
    },
    getServerSnapshot: () => null,
    sync: notify,
  };
}

/**
 * 读取文档的 React 绑定。
 *
 * 必须配套挂载后的 sync：useSyncExternalStore 在水合帧用 getServerSnapshot
 * （null），此后**只有 store 通知才会重读**——React 不会自动对比服务端快照
 * 与真实快照。存储里早就有数据、又没有新写入时，不主动通知一次，
 * 组件会永远停在"没有数据"。
 */
export function useStoredDocument<T>(document: StoredDocument<T>): T | null {
  const value = useSyncExternalStore(
    document.subscribe,
    document.getSnapshot,
    document.getServerSnapshot,
  );

  useEffect(() => {
    document.sync();
  }, [document]);

  return value;
}
