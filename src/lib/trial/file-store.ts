"use client";

/**
 * 网页版的原始文件仓库（IndexedDB）。
 *
 * 简历正文解析后存在工作台文档里就够出题用了，但"简历中心"要像本地版
 * 那样直接预览原件，就必须留住文件本身。localStorage 只能存字符串、
 * 容量约 5MB，装不下 PDF；IndexedDB 能直接存 Blob，配额也大得多。
 *
 * 仍然只在访客自己的浏览器里——服务端不落任何文件。
 * 存不进去（隐私模式、配额不足）不是致命错误：调用方降级成纯文本预览。
 */

import { FILE_DATABASE_NAME as DATABASE_NAME } from "./storage-keys";

const STORE_NAME = "files";
const DATABASE_VERSION = 1;

export type StoredFile = {
  blob: Blob;
  name: string;
  type: string;
  size: number;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("open failed"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = run(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("request failed"));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("transaction aborted"));
    });
  } finally {
    database.close();
  }
}

/** 存一个文件；存不下时返回 false，由调用方降级，不抛给页面。 */
export async function putStoredFile(key: string, file: File): Promise<boolean> {
  try {
    const value: StoredFile = {
      blob: file,
      name: file.name,
      type: file.type,
      size: file.size,
    };
    await withStore("readwrite", (store) => store.put(value, key));
    return true;
  } catch {
    return false;
  }
}

export async function readStoredFile(key: string): Promise<StoredFile | null> {
  try {
    const value = await withStore<StoredFile | undefined>("readonly", (store) =>
      store.get(key),
    );
    return value?.blob instanceof Blob ? value : null;
  } catch {
    return null;
  }
}

export async function deleteStoredFile(key: string): Promise<void> {
  try {
    await withStore("readwrite", (store) => store.delete(key));
  } catch {
    // 删不掉也不影响使用：工作台里的引用已经清了。
  }
}
