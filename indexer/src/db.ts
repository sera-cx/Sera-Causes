import { PrismaClient } from '@prisma/client';

export type Db = PrismaClient;

let client: PrismaClient | undefined;

export function db(): PrismaClient {
  if (!client) {
    client = new PrismaClient({
      log: process.env.PRISMA_LOG ? ['query', 'warn', 'error'] : ['warn', 'error'],
    });
  }
  return client;
}

export async function disconnectDb(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}

/** Transaction client type for functions that run inside db().$transaction. */
export type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
