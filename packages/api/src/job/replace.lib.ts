import fs from "node:fs";
import { open } from "node:fs/promises";
import { join, parse } from "node:path";
import { ContainerSchema, type MediaInfo } from "@formatarr/contract";
import { ORPCError } from "@orpc/server";
import { normalizeProbe, type ProbeRunner } from "@/probe/probe.lib";

const UNSUPPORTED_LINK_CODES = new Set([
  "EPERM",
  "ENOTSUP",
  "EOPNOTSUPP",
  "ENOSYS",
]);

function errorCode(error: unknown) {
  return (error as NodeJS.ErrnoException).code ?? "";
}

function targetExists() {
  return new ORPCError("CONFLICT", { message: "Target file already exists" });
}

export async function probeResult(probe: ProbeRunner, path: string) {
  try {
    return normalizeProbe(await probe(path));
  } catch (error) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Uploaded file is corrupted",
      cause: error,
    });
  }
}

export function targetPath(
  source: string,
  from: MediaInfo["container"],
  to: MediaInfo["container"],
) {
  if (from === to) return source;
  if (!ContainerSchema.safeParse(to).success) {
    throw new ORPCError("BAD_REQUEST", {
      message: `Unsupported output container ${to}`,
    });
  }
  const { dir, name } = parse(source);
  return join(dir, `${name}.${to}`);
}

export async function preparePartial(source: string, partial: string) {
  const original = fs.statSync(source, { throwIfNoEntry: false });
  const handle = await open(partial, "r+");
  try {
    if (original) {
      await handle.chown(original.uid, original.gid).catch(() => {});
      await handle.chmod(original.mode);
    }
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export function placeResult(partial: string, source: string, target: string) {
  if (target === source) return fs.renameSync(partial, target);
  try {
    fs.linkSync(partial, target);
  } catch (error) {
    if (errorCode(error) === "EEXIST") throw targetExists();
    if (!UNSUPPORTED_LINK_CODES.has(errorCode(error))) throw error;
    if (fs.existsSync(target)) throw targetExists();
    fs.renameSync(partial, target);
  }
}
