import { createClient } from "@/client";
import { createEnv } from "@/env";

const env = createEnv();
const client = createClient(env.API_URL);

while (true) {
  try {
    const health = await client.health.check();
    console.log(`api ${health.status} @ ${health.time}`);
  } catch (error) {
    console.error(
      "api unreachable:",
      error instanceof Error ? error.message : error,
    );
  }
  await Bun.sleep(5000);
}
