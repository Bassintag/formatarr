import fs from "node:fs";
import fsp from "node:fs/promises";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { memoize } from "es-toolkit";
import {
  type Config,
  ConfigSchema,
  type ConfigUpdate,
} from "@/settings/config.schema";

export function createSettings(dataDir: string) {
  const path = join(dataDir, "config.yml");

  async function write(settings: Config) {
    await fsp.mkdir(dirname(path), { recursive: true });
    const temp = `${path}.tmp`;
    await Bun.write(temp, Bun.YAML.stringify(settings, null, 2));
    await fsp.rename(temp, path);
  }

  const load = memoize(async () => {
    const file = Bun.file(path);
    const exists = await file.exists();

    let raw: unknown;
    if (exists) raw = Bun.YAML.parse(await file.text());

    const result = ConfigSchema.parse(raw ?? {});
    if (!exists || !isDeepStrictEqual(raw, result)) await write(result);

    return result;
  });

  async function read() {
    return load();
  }

  async function update(patch: ConfigUpdate) {
    const current = await load();
    const next = ConfigSchema.parse({
      auth: { ...current.auth, ...patch.auth },
    });
    await write(next);
    load.cache.clear();
    return next;
  }

  fs.mkdirSync(dataDir, { recursive: true });
  fs.watch(dataDir, (_, filename) => {
    if (filename === "config.yml") load.cache.clear();
  }).unref();

  return { read, update };
}
