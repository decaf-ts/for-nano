import { NanoAdapter } from "../../src";
import { createNanoTestResources } from "./nano";

export async function setupNanoAdapter(prefix: string) {
  const resources = await createNanoTestResources(prefix);
  const adapter = new NanoAdapter({
    couchUser: resources.user,
    couchPassword: resources.password,
    host: resources.host,
    dbName: resources.dbName,
    protocol: resources.protocol,
  }, resources.dbName);
  await adapter.initialize();
  return { resources, adapter };
}
