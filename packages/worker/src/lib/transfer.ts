import { mkdir, rm, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import type { ApiClient, Task } from "@formatarr/contract";
import type { TranscodeInput } from "@/lib/ffmpeg/command";

type TransferContext = { client: ApiClient; workDir: string };

function outputExtension({ job, fileName }: Task) {
  const container = job.rules.find(
    (rule) => rule.enabled && rule.type === "container",
  );
  return container ? `.${container.value}` : extname(fileName);
}

export async function processTask(
  { client, workDir }: TransferContext,
  task: Task,
  transcode: (input: TranscodeInput) => Promise<void>,
) {
  const { job, mediaInfo, fileName, size } = task;
  const dir = join(workDir, `job-${job.id}`);
  const sourcePath = join(dir, `source${extname(fileName)}`);
  const outputPath = join(dir, `output${outputExtension(task)}`);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  try {
    await writeFile(sourcePath, await client.jobs.source({ id: job.id }));
    if (Bun.file(sourcePath).size !== size) {
      throw new Error("downloaded size does not match the source");
    }
    await transcode({ job, mediaInfo, sourcePath, outputPath });
    const output = Bun.file(outputPath);
    return await client.jobs.result({
      params: { id: job.id },
      query: { size: output.size },
      body: output.stream(),
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
