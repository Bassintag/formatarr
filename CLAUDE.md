# Formatarr

Media conversion manager (Tdarr alternative). Bun monorepo in `packages/`:

- `contract`: zod schemas and oRPC contracts shared by everything
- `api`: oRPC server, Drizzle + SQLite
- `web`: Vite, React, TanStack Router
- `worker`: runs ffmpeg jobs, oRPC client of the api

## Commands

Setup: `bun install && cp .env.example .env && bun run db:migrate`

- `bun run dev`: all packages
- `bun test`
- `bun run check`: biome + typecheck
- `bun run format`
- `bun run db:generate` / `bun run db:migrate`

## Conventions

- No code comments, except `// TODO` or `// HACK`.
- Conventional commits with area scope (`feat(api): ...`), enforced by commitlint.
- Use the `@/` alias for imports within a package, `@formatarr/*` across packages.
- oRPC contract-first: schemas and contract in `packages/contract`, then the router in `packages/api`, then consumers. Never duplicate types.
- Never hand-edit generated files (`packages/api/drizzle/`, `routeTree.gen.ts`).
- Tests are colocated `*.test.ts`; api router tests use `src/testing/harness.ts`.
