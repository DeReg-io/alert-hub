import type { RedisClientType } from 'redis';
import { createClient } from 'redis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
let client: RedisClientType;
export async function getDb() {
  if (client) return client;
  client = createClient({
    url: REDIS_URL,
  });
  await client.connect();
  return client;
}
