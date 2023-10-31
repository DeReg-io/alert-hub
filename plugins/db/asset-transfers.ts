import { TimeSeriesDuplicatePolicies } from 'redis';
import { getDb } from '.';
import { CleanTransfers } from '../eth-data/transfer-events';
import logger from '../logger';

const docIndex = 'assetTransferDoc';
const valueIndex = 'assetTransferValue';
const tvlIndex = 'assetTransferTvl';

// NOTE: AssetTransfers from one block will have an identical timestamp
// Redis cannot have duplicate timestamps in one time series
// For the value index we SUM the values, so we get the total
// For the TVL index we use the LAST value, the old value will be overwritten
// We sort all assetTransfer beforehand and also calculate the tvl based on that

export async function addAssetTransfers(
  contractAddress: string,
  assetTransfers: CleanTransfers[],
): Promise<void> {
  let currentAssetTransfer = null;
  try {
    const db = await getDb();
    const network = 'mainnet';
    const labels = {
      network,
      contract: contractAddress,
    };

    // TODO: optimize by using MADD, but will have to group everything, because
    // MADD does not support putting labels.
    // But, would this approach work with the LAST and SUM mechanism?
    // TODO: is Promise.all ok, since the order matters in which we insert
    // await Promise.all(
    //   assetTransfers.map(async (assetTransfer) => {
    for (const assetTransfer of assetTransfers) {
      currentAssetTransfer = assetTransfer;
      const valueKey = `${valueIndex}:${network}:${contractAddress}:${assetTransfer.asset}`;
      const tvlKey = `${tvlIndex}:${network}:${contractAddress}:${assetTransfer.asset}`;
      const docKey = `${docIndex}:${assetTransfer.uniqueId}`;

      const doc = await db.json.get(docKey);
      // this can happen after init,
      // the webhook sends us transfers we have already
      if (doc) {
        logger.info('Found duplicate assetTransfer, skipping', { doc, docKey });
        return;
      }

      await Promise.all([
        db.json.set(docKey, '$', assetTransfer),
        db.ts.add(
          valueKey,
          assetTransfer.timestamp,
          assetTransfer.value * assetTransfer.flow!,
          {
            RETENTION: 0,
            LABELS: {
              ...labels,
              asset: assetTransfer.asset,
            },
            ON_DUPLICATE: TimeSeriesDuplicatePolicies.SUM,
          },
        ),
        db.ts.add(
          tvlKey,
          assetTransfer.timestamp,
          // tvl is added in assetTransfer flow later, thats why its optional
          assetTransfer.tvl!,
          {
            RETENTION: 0,
            LABELS: {
              ...labels,
              asset: assetTransfer.asset,
            },
            ON_DUPLICATE: TimeSeriesDuplicatePolicies.LAST,
          },
        ),
      ]);
      //   }),
      // );
    }

    // TODO: delete======================
    // const _contractAddress = '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640';
    // const asset = 'WETH';
    // const key = `assetTransferTvl:mainnet:${_contractAddress}:${asset}`;
    // const lastTvl = await db.ts.get(key);
    // console.log('lastTvl========================================: ', lastTvl);
    // ==================================
  } catch (err) {
    logger.error('Failed to addAssetTransfers', { err, currentAssetTransfer });
    throw err;
  }
}

export async function addAssetTransfersWithLastTvl(
  contractAddress: string,
  transfers: CleanTransfers[],
) {
  const db = await getDb();

  // don't use promise.all since we need the lastTvl
  // update for all following transfers
  // TODO: group by asset to run in parallel
  for (const transfer of transfers) {
    // const db = await getDb();
    // const index = 'idx:assetTransferDoc';
    // const query = `@asset:{${transfer.asset}} @from:{${contractAddress}} @to:{${contractAddress}}`;
    // const redisResult = await db.ft.search(index, query, {
    //   SORTBY: {
    //     BY: 'timestamp',
    //     DIRECTION: 'DESC',
    //   },
    //   LIMIT: {
    //     from: 0,
    //     size: 1,
    //   },
    // });
    // const doc = redisResult.documents[0].value as CleanTransfers;

    // transfer.tvl = doc.tvl! + transfer.value * (transfer.flow || 1);

    const key = `${tvlIndex}:mainnet:${contractAddress}:${transfer.asset}`;
    let lastTvl;
    try {
      lastTvl = await db.ts.get(key);
    } catch (err) {
      logger.error('Could not find tvl in ts', { err, key });
      throw err;
    }

    // will throw an error if index does not exist,
    // we only create an index by adding data
    transfer.tvl = lastTvl!.value + transfer.value * (transfer.flow || 1);
    await addAssetTransfers(contractAddress, [transfer]);
  }
}

// export async function correctTvlDeviation() {
//   const db = await getDb();
//   const monitoredContracts = await db.hGetAll('monitoredContract');
// }
