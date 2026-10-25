import { exportRunsLocal, readRunsLocal } from "./history";

const worker = globalThis as unknown as { onmessage: (event: MessageEvent<{ type: "read" | "export" }>) => void; postMessage: (data: unknown) => void };
worker.onmessage = ({ data }) => {
  const job = data.type === "export" ? exportRunsLocal() : readRunsLocal();
  void job.then((value) => worker.postMessage(value)).catch((error: unknown) => worker.postMessage({ error: error instanceof Error ? error.message : "Saved history could not be opened." }));
};
