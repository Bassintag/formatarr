import { consumeTasks } from "@/lib/task";

await consumeTasks((task) => console.log({ task }));
