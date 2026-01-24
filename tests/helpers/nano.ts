import { ConflictError, NotFoundError } from "@decaf-ts/db-decorators";
import { NanoAdapter } from "../../src";

const adminUser = process.env.NANO_ADMIN_USER || "couchdb.admin";
const adminPassword = process.env.NANO_ADMIN_PASSWORD || "couchdb.admin";
const dbHost = process.env.NANO_HOST || "localhost:10010";
const dbProtocol = (process.env.NANO_PROTOCOL as "http" | "https") || "http";
const cleanupDelayMs = Number(process.env.NANO_CLEANUP_DELAY_MS || "250");

function waitForCleanup(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function randomSuffix() {
  return `${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export async function createNanoTestResources(prefix: string) {
  const suffix = randomSuffix();
  const dbName = `${prefix}_${suffix}`;
  const user = `${prefix}_user_${suffix}`;
  const password = `${user}_pw`;
  const connection = NanoAdapter.connect(
    adminUser,
    adminPassword,
    dbHost,
    dbProtocol
  );
  await NanoAdapter.createDatabase(connection, dbName).catch((e: any) => {
    if (!(e instanceof ConflictError)) throw e;
  });
  await NanoAdapter.createUser(connection, dbName, user, password).catch(
    (e: any) => {
      if (!(e instanceof ConflictError)) throw e;
    }
  );
  return { connection, dbName, user, password, host: dbHost, protocol: dbProtocol };
}

export async function cleanupNanoTestResources(
  resources: Awaited<ReturnType<typeof createNanoTestResources>>
) {
  const { connection, dbName, user } = resources;
  try {
    await NanoAdapter.deleteDatabase(connection, dbName);
  } catch (e: any) {
    if (!(e instanceof NotFoundError)) throw e;
  }
  await waitForCleanup(cleanupDelayMs);
  try {
    await NanoAdapter.deleteUser(connection, dbName, user);
  } catch (e: any) {
    if (!(e instanceof NotFoundError)) throw e;
  } finally {
    NanoAdapter.closeConnection(connection);
  }
  await waitForCleanup(cleanupDelayMs);
}
