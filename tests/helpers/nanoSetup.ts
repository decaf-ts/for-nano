import { NanoAdapter } from "../../src";
import { createNanoTestResources } from "./nano";

export async function setupNanoAdapter(prefix: string) {
  const resources = await createNanoTestResources(prefix);
  const adapter = new NanoAdapter({
    user: resources.user,
    password: resources.password,
    host: resources.host,
    dbName: resources.dbName,
    protocol: resources.protocol,
  });
  await adapter.initialize();
  return { resources, adapter };
}
