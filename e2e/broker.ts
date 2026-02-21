import Aedes from "aedes";
import { createServer, type Server } from "net";

let aedes: InstanceType<typeof Aedes> | null = null;
let server: Server | null = null;

export function startBroker(port = 1883): Promise<void> {
  return new Promise((resolve, reject) => {
    aedes = new Aedes();
    server = createServer(aedes.handle);
    server.listen(port, () => resolve());
    server.on("error", reject);
  });
}

export function stopBroker(): Promise<void> {
  return new Promise((resolve) => {
    if (aedes) {
      aedes.close(() => {
        if (server) server.close(() => resolve());
        else resolve();
      });
    } else {
      resolve();
    }
  });
}
