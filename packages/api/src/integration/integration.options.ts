import type { QueryOptions } from "@/lib/db";

export const integrationOptions = {
  columns: {
    id: true,
    type: true,
    name: true,
    baseUrl: true,
    apiKey: true,
    enabled: true,
  },
} satisfies QueryOptions<"integrations">;
