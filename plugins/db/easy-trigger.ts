import { randomUUID } from 'crypto';
import { getDb } from '.';

type EasyTrigger = {
  id: string;
  name: string;
  contractAddress: string;
  allowlistActive: boolean;
  allowlist: string[];
  userId: string;
  network: string;
  createdAt?: string;
  isActive: boolean;
};

async function getEasyTrigger(triggerId: string): Promise<EasyTrigger | null> {
  const db = await getDb();
  const easyTrigger = (await db.json.get(
    `easyTrigger:${triggerId}`,
  )) as EasyTrigger | null;
  if (easyTrigger) easyTrigger.id = triggerId;
  return easyTrigger;
}

type EasyTriggerNotification = {
  id: string;
  callerUrl: string;
  verifiedDomain: boolean;
  triggeredContract: boolean;
  createdAt: string;
  triggerId: string;
  userId: string;
  body: string;
  manuallyTriggered: boolean;
  network?: string;
  transactionHash?: string;
  seen: boolean;
};

async function addEasyTriggerNotification(
  notification: Partial<EasyTriggerNotification>,
): Promise<void> {
  const db = await getDb();

  notification.id = randomUUID();
  notification.createdAt = new Date().toISOString();
  notification.seen = false;

  const key = `easyTriggerNotification:${notification.id}`;
  await db.json.set(key, '$', notification);
}

export { getEasyTrigger, EasyTriggerNotification, addEasyTriggerNotification };
