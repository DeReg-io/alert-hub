import express from 'express';
import { Request, Response, NextFunction } from 'express';
import logger from '../../plugins/logger';
import {
  EasyTriggerNotification,
  addEasyTriggerNotification,
  getEasyTrigger,
} from '../../plugins/db/easy-trigger';
import { executeTrigger } from '../../plugins/web3-interactions';
const router = express.Router();

function addHttps(url: string) {
  if (!/^(?:f|ht)tps?\:\/\//.test(url)) {
    url = 'http://' + url;
  }
  return url;
}

function checkIfDomainInAllowlist(domain: string, allowlist: string[]) {
  try {
    const allowedDomains = allowlist.map((url) => {
      const urlComponent = new URL(addHttps(url));
      let result = urlComponent.hostname;
      if (urlComponent.port) result += `:${urlComponent.port}`;
      return result;
    });
    console.log('allowedDomains', allowedDomains);
    return allowedDomains.includes(domain);
  } catch (err) {
    console.error('error in checkIfDomainInAllowlist', err);
    throw err;
  }
}

router.post('/:triggerId', async (req, res) => {
  logger.info('Received easy-trigger request', { body: req.body });

  // can this really be an array?
  const domainName = (req.headers['x-forwarded-host'] ||
    req.headers.host) as string;
  if (!domainName) {
    return res.status(500).send('Can only call easy trigger via HTTP');
  }

  const triggerId = req.params.triggerId;
  const body = req.body;
  console.log('triggerId: ', triggerId);

  const notification: Partial<EasyTriggerNotification> = {};

  if (!triggerId) {
    return res.status(500).send('Missing triggerId');
  }

  // no user notification needed, since we don't know who tried to call the trigger
  const trigger = await getEasyTrigger(triggerId);
  if (!trigger) {
    return res.status(500).send('Easy trigger not found');
  }

  logger.info('checking if domain in allowlist', { triggerId });
  if (
    trigger.allowlistActive &&
    !checkIfDomainInAllowlist(domainName, trigger.allowlist)
  ) {
    logger.info('domain not in allowlist, answering with error', { triggerId });
    return res.status(500).send('Domain not in allowlist');
  }

  notification.triggerId = triggerId;
  notification.userId = trigger.userId;
  notification.verifiedDomain = trigger.allowlistActive;
  notification.body = JSON.stringify(req.body);
  // add http or https to domainName
  notification.callerUrl = domainName;
  notification.manuallyTriggered = domainName === 'app.dereg.io';

  let resultMessage;
  if (trigger.isActive) {
    const { hash } = await executeTrigger(
      trigger.contractAddress,
      trigger.network,
    );
    notification.triggeredContract = true;
    notification.transactionHash = hash;
    notification.network = trigger.network;
    resultMessage = `Easy trigger ${trigger.name} called and connected contract called.`;
  } else {
    notification.triggeredContract = false;
    resultMessage = `Easy trigger ${trigger.name} called, but connected contract was not called.`;
  }

  logger.info('Adding notification to db', { trigger });
  await addEasyTriggerNotification(notification);
  console.log('sending back response');
  res.send('Easy trigger called');
});

export default router;
