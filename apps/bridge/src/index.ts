import { config } from "./config.js";
import { createLogger } from "./log.js";
import { eaLink } from "./tcp/eaLink.js";
import "./state/liveState.js";
import { createHttpServer } from "./http/server.js";
import { startWsServer } from "./ws/wsServer.js";
import { getDb } from "./db/migrate.js";

const log = createLogger("bridge");

getDb(); // create schema on startup — see db/migrate.ts

eaLink.listen(config.eaTcpPort, config.eaBindHost);

const httpServer = createHttpServer();
startWsServer(httpServer);
httpServer.listen(config.httpPort, () => {
  log.info(`http+ws listening on http://127.0.0.1:${config.httpPort}`);
});

eaLink.on("message", (msg: { type: string }) => log.debug(`EA -> bridge: ${msg.type}`));

process.on("SIGINT", () => {
  log.info("shutting down");
  process.exit(0);
});
