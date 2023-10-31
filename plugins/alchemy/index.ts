import {
  AddressActivityWebhook,
  Alchemy,
  Network,
  WebhookType,
} from 'alchemy-sdk';
import logger from '../logger';

const ALCHEMY_TOKEN = process.env.ALCHEMY_TOKEN || '';
const BASE_URL = process.env.BASE_URL || 'http://localhost';

const webhookAlchemy = new Alchemy({
  authToken: ALCHEMY_TOKEN,
  network: Network.ETH_MAINNET,
});

export async function addAddressActivityWebhook(
  contractAddress: string,
): Promise<AddressActivityWebhook> {
  try {
    logger.info('Creating address activity webhook', { contractAddress });

    const addressActivityWebhook = await webhookAlchemy.notify.createWebhook(
      `${BASE_URL}/alchemy/address-activity`,
      WebhookType.ADDRESS_ACTIVITY,
      {
        addresses: [contractAddress],
        network: Network.ETH_MAINNET,
      },
    );
    console.log('addressActivityWebhook: ', addressActivityWebhook);
    return addressActivityWebhook;
  } catch (err) {
    logger.error('Err while creating address activity webhook', { err });
    throw err;
  }
}
