import express from 'express';
import logger from '../../plugins/logger';
import {
  Alchemy,
  AssetTransfersCategory,
  Network,
  WebhookType,
} from 'alchemy-sdk';
import {
  CleanTransfers,
  RawContract,
  addTvlToTransfers,
} from '../../plugins/eth-data/transfer-events';
import web3 from 'web3';
import {
  addAssetTransfers,
  addAssetTransfersWithLastTvl,
} from '../../plugins/db/asset-transfers';
import {
  getMonitoredContractByAlchemyWebhookId,
  updateMonitoredContract,
} from '../../plugins/db/monitored-contracts';
const router = express.Router();

const ALCHEMY_TOKEN = process.env.ALCHEMY_TOKEN || '';
const BASE_URL = process.env.BASE_URL || 'http://localhost';

const alchemy = new Alchemy({
  authToken: ALCHEMY_TOKEN,
  network: Network.ETH_MAINNET,
});

type AddressActivityUpdateLog = {
  address: string;
  topics: string[];
  data: string; // '0x00000000000000000000000000000000000000000000000022b1c8c1227a0000',
  blockNumber: string; // '0x1183577',
  transactionHash: string;
  transactionIndex: string; //'0x78',
  blockHash: string;
  logIndex: string; // '0x13f',
  removed: boolean;
};

type AddressActivityUpdateActivity = {
  fromAddress: string;
  toAddress: string;
  blockNum: string; // '0x1183577',
  hash: string;
  value: number;
  asset: string;
  category: string; // 'token', 'internal', external
  typeTraceAddress?: string; // on internal calls
  rawContract: RawContract;
  log?: AddressActivityUpdateLog;
};

type AddressActivityUpdateEvent = {
  network: Network;
  activity: AddressActivityUpdateActivity[];
};

type AddressActivityUpdate = {
  webhookId: string;
  id: string;
  createdAt: string; // ISO Date
  type: WebhookType;
  event: AddressActivityUpdateEvent;
};

router.post('/address-activity', async (req, res) => {
  logger.info('Got alchemy address activity');

  const data = req.body as AddressActivityUpdate;
  const nonZeroTransfers = data.event.activity.filter((e) => !!e.value);
  console.log('nonZeroTransfers: ', nonZeroTransfers.length);

  if (!nonZeroTransfers.length) {
    return res.status(200).send('ok');
  }

  let monitoredContract = await getMonitoredContractByAlchemyWebhookId(
    data.webhookId,
  );
  // this can only happen in a race condition, when we get webhook data before
  // the monitored Contract can be saved
  if (!monitoredContract) {
    await new Promise((r) => setTimeout(r, 100));
    monitoredContract = await getMonitoredContractByAlchemyWebhookId(
      data.webhookId,
    );
    if (!monitoredContract) {
      logger.error(
        'Received address activity from alchemy without matching monitored Contract',
        { addressActivityData: data },
      );
      throw new Error(
        'Received address activity from alchemy without matching monitored Contract',
      );
    }
  }

  const timestamp = new Date(data.createdAt).getTime();

  const getUniqueId = (transfer: AddressActivityUpdateActivity): string => {
    let id = transfer.hash;
    if (transfer.category === 'token') {
      // always defined with token
      id += `:log:' + ${web3.utils.hexToNumber(transfer.log!.logIndex)}`;
    } else if (transfer.category === 'internal') {
      id += ':internal:' + transfer.typeTraceAddress!.split('call_')[1];
    } else if (transfer.category === 'external') {
      id += ':external';
    }
    return id;
  };

  const cleanTransfers: CleanTransfers[] = nonZeroTransfers.map((transfer) => ({
    from: transfer.fromAddress,
    to: transfer.toAddress,
    value: transfer.value,
    asset: transfer.asset,
    // TODO: make according to AssetTransfersCategory
    category:
      transfer.category === 'token'
        ? AssetTransfersCategory.ERC20
        : AssetTransfersCategory.EXTERNAL,
    // does not represent block timestamp, just webhook created time,
    // the timestamps are close enough to start with
    timestamp,
    // TODO: should not be able to be null, how about eht transfers?
    tokenAddress: transfer.rawContract.address || '',
    // tvl:
    flow: transfer.fromAddress === monitoredContract!.contractAddress ? -1 : 1,
    blockNum: web3.utils.hexToNumber(transfer.blockNum) as number,
    // after nonZeroCheck log shouldnt be able to be null
    uniqueId: getUniqueId(transfer),
    hash: transfer.hash,
    erc721TokenId: null,
    erc1155Metadata: null,
    tokenId: null,
    rawContract: transfer.rawContract,
  }));

  const now = new Date();
  const lastTvlSync = new Date(monitoredContract.lastTvlSync);

  await addAssetTransfersWithLastTvl(
    monitoredContract.contractAddress!,
    cleanTransfers,
  );

  // @ts-ignore
  // if (now - lastTvlSync > 1_000 * 60 * 3) {
  //   logger.info('Resyncing tvl', { monitoredContract });
  //   // if (now - lastTvlSync > 1_000 * 60 * 60) {
  //   // console.log('cleanTransfers before tvl add: ', cleanTransfers);
  //   // TODO: alchemies tvl might be updated a bit later, do we need this?
  //   // await new Promise((r) => setTimeout(r, 1_000));
  //   await addTvlToTransfers(cleanTransfers, monitoredContract.contractAddress);
  //   // console.log('cleanTransfers after tvl add: ', cleanTransfers);
  //   await addAssetTransfers(monitoredContract.contractAddress, cleanTransfers);
  //   await updateMonitoredContract(monitoredContract.contractAddress, {
  //     lastTvlSync: new Date().toISOString(),
  //   });
  // } else {
  //   await addAssetTransfersWithLastTvl(
  //     monitoredContract.contractAddress!,
  //     cleanTransfers,
  //   );
  // }

  logger.info('Finished receiving address activity');

  return res.status(200).send('ok');
});

// NOTE: note used right now, abstracted in plugins/alchemy
router.post('/create-address-activity', async (req, res) => {
  try {
    logger.info('Creating address activity webhook', { body: req.body });

    const addressActivityWebhook = await alchemy.notify.createWebhook(
      `${BASE_URL}/alchemy/address-activity`,
      WebhookType.ADDRESS_ACTIVITY,
      {
        addresses: ['0x1f9840a85d5af5bf1d1762f925bdaddc4201f984'],
        network: Network.ETH_MAINNET,
      },
    );
    console.log('addressActivityWebhook: ', addressActivityWebhook);
    res.status(200).send('Ok');
  } catch (err) {
    console.log('err: ', err);
    logger.error('Err while creating address activity webhook', { err });
    res.status(500).send('Error');
  }
});

export default router;
