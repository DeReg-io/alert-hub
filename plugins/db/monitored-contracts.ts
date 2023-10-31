import { getDb } from '.';

const baseKey = 'monitoredContract';

type MonitoredContract = {
  userIds: string[];
  createdAt: string;
  updatedAt: string;
  alchemyWebhookId?: string;
  lastTvlSync: string;
};

type ContractAddress = {
  contractAddress: string;
};

export async function addMonitoredContract(
  contractAddress: string,
  userId: string,
  alchemyWebhookId?: string,
) {
  const db = await getDb();
  const key = `${baseKey}:${contractAddress}`;
  const existingContract = (await db.json.get(key)) as MonitoredContract | null;
  const now = new Date().toISOString();
  console.log('existingContract: ', existingContract);

  if (existingContract) {
    let hasChange = false;
    if (!existingContract.userIds.includes(userId)) {
      existingContract.userIds.push(userId);
      hasChange = true;
    }
    if (alchemyWebhookId) {
      existingContract.alchemyWebhookId = alchemyWebhookId;
      hasChange = true;
    }
    if (hasChange) {
      existingContract.updatedAt = now;
      await db.json.set(key, '$', existingContract);
    }
  } else {
    await db.json.set(key, '$', {
      userIds: [userId],
      createdAt: now,
      updatedAt: now,
      lastTvlSync: now,
      ...(alchemyWebhookId ? { alchemyWebhookId } : {}),
    });
  }
}

export async function updateMonitoredContract(
  contractAddress: string,
  update: Partial<MonitoredContract>,
) {
  const db = await getDb();
  const key = `${baseKey}:${contractAddress}`;
  const existingContract = (await db.json.get(key)) as MonitoredContract | null;
  const now = new Date().toISOString();
  const newContract = {
    ...existingContract,
    ...update,
    updatedAt: now,
  };
  await db.json.set(key, '$', newContract);
}

export async function getMonitoredContractByAlchemyWebhookId(
  webhookId: string,
): Promise<(MonitoredContract & ContractAddress) | null> {
  const db = await getDb();
  const query = `@alchemyWebhookId:{${webhookId}}`;
  const contracts = (await db.ft.search(`idx:${baseKey}`, query)).documents.map(
    (doc) => ({
      ...(doc.value as any as MonitoredContract),
      contractAddress: doc.id.split(':').pop(),
    }),
  );

  if (contracts.length) {
    return contracts[0] as MonitoredContract & ContractAddress;
  } else {
    return null;
  }
}
