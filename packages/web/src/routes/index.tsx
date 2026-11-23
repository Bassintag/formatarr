import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { orpc } from "@/orpc";

export const Route = createFileRoute("/")({ component: HomePage });

function HomePage() {
  const health = useQuery(orpc.health.check.queryOptions());
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">Formatarr</h1>
      <p className="mt-2 text-sm">
        API :{" "}
        {health.isPending
          ? "…"
          : health.isError
            ? "indisponible"
            : health.data.status}
      </p>
    </main>
  );
}
