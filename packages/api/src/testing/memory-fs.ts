import { spyOn } from "bun:test";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { dirname } from "node:path";

type WatchListener = (event: string, filename: string | null) => void;

class FakeWatcher extends EventEmitter {
  closed = false;
  constructor(
    readonly path: string,
    readonly listener: WatchListener | undefined,
  ) {
    super();
  }
  close() {
    this.closed = true;
    this.emit("close");
  }
  unref() {
    return this;
  }
  ref() {
    return this;
  }
}

function isUnder(path: string, root: string) {
  const prefix = root.endsWith("/") ? root : `${root}/`;
  return path.startsWith(prefix);
}

export function mockFileSystem(initial: Record<string, string> = {}) {
  const contents = new Map(Object.entries(initial));
  const directories = new Set<string>();
  const watchers: FakeWatcher[] = [];

  function addDirectories(path: string) {
    for (let dir = dirname(path); !directories.has(dir); dir = dirname(dir)) {
      directories.add(dir);
      if (dir === dirname(dir)) break;
    }
  }

  function write(path: string, content: string) {
    contents.set(path, content);
    addDirectories(path);
  }

  for (const path of contents.keys()) addDirectories(path);

  spyOn(Bun, "file").mockImplementation(((path: string) => {
    const content = contents.get(path);
    return {
      size: content === undefined ? 0 : Buffer.byteLength(content),
      exists: async () => content !== undefined,
      text: async () => {
        if (content === undefined) throw new Error(`ENOENT: ${path}`);
        return content;
      },
    };
  }) as never);

  spyOn(Bun, "write").mockImplementation((async (
    path: string,
    data: string,
  ) => {
    write(path, data);
    return Buffer.byteLength(data);
  }) as never);

  spyOn(Bun.Glob.prototype, "scan").mockImplementation(function (
    this: unknown,
    options: { cwd: string },
  ) {
    const matches = [...contents.keys()].filter((path) =>
      isUnder(path, options.cwd),
    );
    return (async function* () {
      yield* matches;
    })();
  } as never);

  spyOn(fsp, "stat").mockImplementation((async (path: string) => {
    const isDirectory = directories.has(path);
    if (!isDirectory && !contents.has(path)) throw new Error(`ENOENT: ${path}`);
    return { isDirectory: () => isDirectory };
  }) as never);

  spyOn(fsp, "mkdir").mockImplementation((async (path: string) => {
    directories.add(path);
    addDirectories(path);
  }) as never);

  spyOn(fsp, "rename").mockImplementation((async (from: string, to: string) => {
    const content = contents.get(from);
    if (content === undefined) throw new Error(`ENOENT: ${from}`);
    contents.delete(from);
    write(to, content);
  }) as never);

  spyOn(fs, "statSync").mockImplementation(((path: string) => {
    const content = contents.get(path);
    return content === undefined
      ? undefined
      : { size: Buffer.byteLength(content) };
  }) as never);

  spyOn(fs, "mkdirSync").mockImplementation(((path: string) => {
    directories.add(path);
    addDirectories(path);
  }) as never);

  spyOn(fs, "watch").mockImplementation(((path: string, ...args: unknown[]) => {
    const listener = args.find((arg) => typeof arg === "function") as
      | WatchListener
      | undefined;
    const watcher = new FakeWatcher(path, listener);
    if (listener) watcher.on("change", listener);
    watchers.push(watcher);
    return watcher;
  }) as never);

  return {
    write,
    remove(path: string) {
      contents.delete(path);
    },
    read(path: string) {
      return contents.get(path);
    },
    has(path: string) {
      return contents.has(path);
    },
    addDirectory(path: string) {
      directories.add(path);
      addDirectories(path);
    },
    changed(path: string, filename: string | null = null) {
      for (const watcher of watchers) {
        if (
          !watcher.closed &&
          (watcher.path === path || isUnder(path, watcher.path))
        ) {
          watcher.emit("change", "change", filename);
        }
      }
    },
    activeWatchers(path: string) {
      return watchers.filter((w) => !w.closed && w.path === path).length;
    },
  };
}
