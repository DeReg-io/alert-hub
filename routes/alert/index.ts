import express from 'express';
import logger from '../../plugins/logger';
import { initAlertDefinitions } from '../../plugins/db/alert-definition';
import { error } from 'console';
import { getTransferEvents } from '../../plugins/eth-data/transfer-events';
import { addAssetTransfers } from '../../plugins/db/asset-transfers';
import { addAddressActivityWebhook } from '../../plugins/alchemy';
import { addMonitoredContract } from '../../plugins/db/monitored-contracts';
const router = express.Router();

router.post('/init', async (req, res) => {
  try {
    logger.info('Got init request', { body: req.body });

    let { userId, contractAddress, name } = req.body;

    const errors = [];
    if (typeof userId !== 'string') {
      errors.push('userId is missing');
    }
    if (typeof contractAddress !== 'string') {
      errors.push('contractAddress is missing');
    }
    if (errors.length) {
      logger.error('Got malformated request', { body: req.body, errors });
      return res.status(400).send(errors.join('; '));
    }

    contractAddress = contractAddress.toLowerCase();

    console.time('initAlerts');
    await initAlertDefinitions({ userId, contractAddress, name });
    console.timeEnd('initAlerts');

    console.time('transferEvents');
    const transferEvents = await getTransferEvents(contractAddress, '5m');
    console.timeEnd('transferEvents');

    console.time('addAssetTransfers');
    await addAssetTransfers(contractAddress, transferEvents.inflow);
    console.log('added inflow');
    await addAssetTransfers(contractAddress, transferEvents.outflow);
    console.timeEnd('addAssetTransfers');
    logger.info(`Inserted assetTransfers to Redis`, {
      count: (transferEvents.inflow.length + transferEvents.outflow.length) * 3,
    });

    const webhook = await addAddressActivityWebhook(contractAddress);
    await addMonitoredContract(contractAddress, userId, webhook.id);
    console.log('END contract added');

    res.status(200).send('ok');
  } catch (err) {
    logger.error('Error calling alert/init', { err });
    res.status(500).send('Unknown error');
  }
});

export default router;
