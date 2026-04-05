"use client";

const OPFS_DIR = "recording-chunks";

async function getChunksDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(OPFS_DIR, { create: true });
}

export async function saveChunkToOPFS(chunkId: string, data: ArrayBuffer): Promise<void> {
  const dir = await getChunksDir();
  const fileHandle = await dir.getFileHandle(`${chunkId}.wav`, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
}

export async function loadChunkFromOPFS(chunkId: string): Promise<ArrayBuffer | null> {
  try {
    const dir = await getChunksDir();
    const fileHandle = await dir.getFileHandle(`${chunkId}.wav`);
    const file = await fileHandle.getFile();
    return file.arrayBuffer();
  } catch {
    return null;
  }
}

export async function deleteChunkFromOPFS(chunkId: string): Promise<void> {
  try {
    const dir = await getChunksDir();
    await dir.removeEntry(`${chunkId}.wav`);
  } catch {
    // Already gone — that's fine
  }
}

export async function listOPFSChunks(): Promise<string[]> {
  try {
    const dir = await getChunksDir();
    const names: string[] = [];
    for await (const [name] of dir as unknown as AsyncIterable<[string, FileSystemHandle]>) {
      if (name.endsWith(".wav")) {
        names.push(name.replace(".wav", ""));
      }
    }
    return names;
  } catch {
    return [];
  }
}

export async function clearAllOPFSChunks(): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(OPFS_DIR, { recursive: true });
  } catch {
    // Nothing to clear
  }
}

export function isOPFSSupported(): boolean {
  return typeof navigator !== "undefined" && "storage" in navigator && "getDirectory" in navigator.storage;
}
