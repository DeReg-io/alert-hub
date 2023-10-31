import { randomUUID } from 'crypto';
import { getDb } from '.';
import logger from '../logger';
import _ from 'lodash';

type AlertDefinitionBase = {
  contractAddress: string;
  name?: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
};

type AlertDefinition = AlertDefinitionBase & any;

enum ThresholdTarget {
  TVL = 'TVL',
}

enum ThresholdValueType {
  percentage = 'percentage', // 30 => 30%
  fixedValue = 'fixedValue',
}

type ThresholdAlert = {
  target: ThresholdTarget;
  timeRange: string; // 30m, 1h, 1d
  valueType: ThresholdValueType;
  value: number;
  category?: string; // ETH, USDC etc., if not defined counts for all categories
} & AlertDefinitionBase;

type AlertDefinitionProps = {
  userId: string;
  contractAddress: string;
  name?: string;
};

function getDefaultAlerts(props: AlertDefinitionProps): AlertDefinition[] {
  const alerts: AlertDefinition[] = [];

  const now = new Date().toISOString();

  const base = {
    contractAddress: props.contractAddress,
    name: props.name,
    userId: props.userId,
    createdAt: now,
    updatedAt: now,
  };

  const thAlert: ThresholdAlert = {
    ...base,
    target: ThresholdTarget.TVL,
    timeRange: '3h',
    valueType: ThresholdValueType.percentage,
    value: 30,
  };

  alerts.push(thAlert);

  return alerts;
}

// NOTE: Could also put an index on all fields and check for duplicates by query
async function filterDuplicates(
  props: AlertDefinitionProps,
  alerts: AlertDefinition[],
): Promise<AlertDefinition[]> {
  const db = await getDb();
  const index = 'idx:alertDefinition';
  const escapedUserId = props.userId.replaceAll('-', '\\-');
  const query = `@userId:{${escapedUserId}} @contractAddress:{${props.contractAddress}}`;
  const allUserAlerts = (await db.ft.search(index, query)).documents.map(
    (doc) => doc.value,
  );

  const result: AlertDefinition[] = [];
  for (const alert of alerts) {
    const duplicate = _.find(
      allUserAlerts,
      _.omit(alert, ['createdAt', 'updatedAt', 'name']),
    );
    if (!duplicate) {
      result.push(alert);
    }
  }
  return result;
}

export async function initAlertDefinitions(
  props: AlertDefinitionProps,
): Promise<void> {
  try {
    logger.info('Initializing alert definitions');
    const db = await getDb();
    const defaultAlerts = getDefaultAlerts(props);
    const alerts = await filterDuplicates(props, defaultAlerts);
    const baseKey = 'alertDefinition';
    await Promise.all(
      alerts.map(async (alert) => {
        const id = randomUUID();
        await db.json.set(`${baseKey}:${id}`, '$', alert);
      }),
    );
  } catch (err) {
    logger.error('Failed to initAlertDefinitions', { err, props });
    throw err;
  }
}
