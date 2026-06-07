import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { CodeworkError } from "./validate.ts";

const LOCK_RETRY_MS = 50;
const LOCK_TIMEOUT_MS = 2000;
const STALE_LOCK_MS = 30000;

type LockOwner = {
  pid: number;
  hostname: string;
  startedAt: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function readLockOwner(lockDir: string): Promise<LockOwner | undefined> {
  try {
    const raw = await readFile(path.join(lockDir, "owner.json"), "utf8");
    return JSON.parse(raw) as LockOwner;
  } catch {
    return undefined;
  }
}

async function removeStaleLock(lockDir: string): Promise<boolean> {
  const owner = await readLockOwner(lockDir);
  if (!owner) {
    return false;
  }
  const startedAt = Date.parse(owner.startedAt);
  if (!Number.isFinite(startedAt) || Date.now() - startedAt <= STALE_LOCK_MS) {
    return false;
  }
  await rm(lockDir, { recursive: true, force: true });
  return true;
}

async function acquireLock(workspaceDir: string): Promise<string> {
  await mkdir(workspaceDir, { recursive: true });
  const lockDir = path.join(workspaceDir, "lock");
  const started = Date.now();

  while (Date.now() - started <= LOCK_TIMEOUT_MS) {
    try {
      await mkdir(lockDir);
      const owner: LockOwner = {
        pid: process.pid,
        hostname: safeHostname(),
        startedAt: new Date().toISOString()
      };
      await writeFile(path.join(lockDir, "owner.json"), `${JSON.stringify(owner, null, 2)}\n`, "utf8");
      return lockDir;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") {
        throw error;
      }
      if (await removeStaleLock(lockDir)) {
        continue;
      }
      await sleep(LOCK_RETRY_MS);
    }
  }

  throw new CodeworkError(3, "Workspace state is locked by another Codework process.");
}

export async function withWorkspaceLock<T>(workspaceDir: string, fn: () => Promise<T>): Promise<T> {
  const lockDir = await acquireLock(workspaceDir);
  try {
    return await fn();
  } finally {
    await rm(lockDir, { recursive: true, force: true });
  }
}

function safeHostname(): string {
  try {
    return os.hostname();
  } catch {
    return process.env.HOSTNAME || "unknown";
  }
}
