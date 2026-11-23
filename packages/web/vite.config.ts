import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import checker from "vite-plugin-checker";
import z from "zod";

const EnvSchema = z.object({
  API_URL: z.url().default("http://localhost:3000"),
});

export default defineConfig(({ mode }) => {
  const env = EnvSchema.parse(loadEnv(mode, "../..", ""));
  return {
    envDir: "../..",
    resolve: { tsconfigPaths: true },
    plugins: [
      tanstackRouter({ target: "react", autoCodeSplitting: true }),
      react(),
      tailwindcss(),
      mode === "development" && checker({ typescript: true }),
    ],
    server: {
      proxy: {
        "/api": {
          target: env.API_URL,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
  };
});
