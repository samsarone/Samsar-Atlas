import express from "express";
import { loadConfig } from "./config.js";
import { createAgentRouter } from "./agents/routes.js";
import { createAgentStore } from "./agents/store.js";
import { createA2ARouter } from "./a2a/routes.js";
import { createSamsarClient } from "./samsar/client.js";

const config = loadConfig();
const app = express();
const client = createSamsarClient(config);
const agentStore = createAgentStore(config);

app.disable("x-powered-by");
app.use(express.json({
  limit: config.jsonBodyLimit,
  type: ["application/json", "application/a2a+json", "application/*+json"],
}));

app.use(createAgentRouter(config, client, agentStore));
app.use(createA2ARouter(config, client, agentStore));

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : "Internal server error.";
  res.status(500).json({ message });
});

app.listen(config.port, "0.0.0.0", () => {
  console.log(JSON.stringify({
    service: "samsar-atlas",
    event: "server_started",
    port: config.port,
    samsarApiBaseUrl: config.samsarApiBaseUrl,
    publicBaseUrl: config.publicBaseUrl,
    stateBackend: config.stateBackend,
  }));
});
