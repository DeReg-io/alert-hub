import {
  Alchemy,
  AssetTransfersCategory,
  Network,
  type AssetTransfersResult,
} from 'alchemy-sdk';
import web3 from 'web3';
import _ from 'lodash';
import logger from '../logger';
const ALCHEMY_KEY = process.env.ALCHEMY_KEY;

const config = {
  apiKey: ALCHEMY_KEY,
  network: Network.ETH_MAINNET,
};

const alchemy = new Alchemy(config);

// wait till we have at least 10 seconds till the next block creation
// like this creating the address activity webhook wont miss a block
async function getCurrentBlock(): Promise<number> {
  const block = await alchemy.core.getBlock('latest');
  let blockNum = block.number;
  console.log('block.timestamp: ', block.timestamp);
  const now = new Date();
  const blockDate = new Date(block.timestamp * 1000);
  // @ts-ignore
  const diff = now - blockDate;
  console.log('diff: ', diff);
  if (diff > 5000) {
    const waitFor = 12_000 - diff + 1_000;
    console.log('waitFor: ', waitFor);
    await new Promise((r) => setTimeout(r, waitFor));
    blockNum++;
  }
  console.log('blockNum: ', blockNum);
  return blockNum;
}

function getNumOfBlocks(minutes: number): number {
  const seconds = minutes * 60;
  const blocks = Math.floor(seconds / 12);
  return blocks;
}

type TokenAddressToBalance = { [tokenAddress: string]: number };
type TokenAddressToBalanceHex = { [tokenAddress: string]: string };

// need to define ourselves, since redis does not support interfaces,
// only types when inserting data
type ERC1155Metadata = {
  tokenId: string;
  value: string;
};
export type RawContract = {
  value: string | null;
  address: string | null;
  decimal: string | null;
};

export type CleanTransfers = {
  from: string;
  to: string;
  value: number;
  asset: string;
  category: AssetTransfersCategory;
  timestamp: number;
  tokenAddress: string;
  tvl?: number;
  flow?: number;
  blockNum: number;
  uniqueId: string;
  hash: string;
  erc721TokenId: string | null;
  erc1155Metadata: ERC1155Metadata[] | null;
  tokenId: string | null;
  rawContract: RawContract;
};

function bigintHexToNumber(hex: string, decimals: number): number {
  const bigIntValue = BigInt(web3.utils.hexToNumberString(hex));
  const scaleFactor = BigInt(10 ** decimals);

  const intPart = bigIntValue / scaleFactor;
  const fractionalPart = bigIntValue % scaleFactor;
  const fractionalAsString = fractionalPart.toString().padStart(decimals, '0');

  return Number(`${intPart}.${fractionalAsString}`);
}

async function addCurrentTokenBalances(
  inflow: CleanTransfers[],
  outflow: CleanTransfers[],
  address: string,
  currentBlock: number,
): Promise<TokenAddressToBalance> {
  inflow.forEach((t) => (t.flow = 1));
  outflow.forEach((t) => (t.flow = -1));

  const transfers = _.flatten([inflow, outflow]);

  const allTokenAddresses = _.chain(transfers)
    .uniqBy('tokenAddress')
    .map('tokenAddress')
    .pull(null!) // if transfer is ETH, tokenAddress is null
    .pull('') // '' if it is ETH from address activity webhook
    .value();

  alchemy.core.call;

  let currentTokenTvlHex: TokenAddressToBalanceHex = {};
  if (allTokenAddresses.length) {
    currentTokenTvlHex = (
      await alchemy.core.getTokenBalances(address, allTokenAddresses)
    ).tokenBalances.reduce((acc: TokenAddressToBalanceHex, tokenBalance) => {
      acc[tokenBalance.contractAddress] = tokenBalance.tokenBalance!;
      return acc;
    }, {});
  }

  // transform bigint hex to number using the correct decimals
  const currentTokenTvl: TokenAddressToBalance = {};
  const currentTokenTvlSymbols: TokenAddressToBalance = {};
  await Promise.all(
    allTokenAddresses.map(async (tokenAddress) => {
      const tokenMetadata = await alchemy.core.getTokenMetadata(tokenAddress);
      const value = bigintHexToNumber(
        currentTokenTvlHex[tokenAddress],
        // TODO: can this be null? - we are getting non null transfers through query
        tokenMetadata.decimals!,
      );
      currentTokenTvl[tokenAddress] = value;
      currentTokenTvlSymbols[tokenMetadata.symbol!] = value;
    }),
  );

  console.log(
    'currentTokenTvlSymbols=======================-======: ',
    currentTokenTvlSymbols,
  );

  const hasEthTransfer =
    _.find(transfers, { tokenAddress: null }) ||
    _.find(transfers, { tokenAddress: '' });
  if (hasEthTransfer) {
    const ethBalance = await alchemy.core.getBalance(address, currentBlock);
    const value = bigintHexToNumber(ethBalance._hex, 18);
    currentTokenTvl['ETH'] = value;
    currentTokenTvlSymbols['ETH'] = value;
  }

  _.chain(transfers)
    .sortBy('timestamp')
    .reverse()
    .forEach((t, i) => {
      const tokenAddress = t.tokenAddress || 'ETH';
      const runningTvl = currentTokenTvl[tokenAddress];
      const tvl = i === 0 ? runningTvl : runningTvl + t.flow! * t.value;
      currentTokenTvl[tokenAddress] = tvl;
      t.tvl = tvl;
    })
    .value();

  return currentTokenTvlSymbols;
}

function cleanTransfers(
  transfers: AssetTransfersResult[],
  date: Date,
  currentBlock: number,
): CleanTransfers[] {
  const result = transfers.map((transfer) => {
    const blockNum = transfer.blockNum;
    const timestamp =
      date.getTime() -
      // @ts-ignore
      (currentBlock - web3.utils.hexToNumber(blockNum)) * 12 * 1000;
    const value = transfer.value!;
    return {
      from: transfer.from,
      to: transfer.to!,
      value,
      asset: transfer.asset!,
      category: transfer.category,
      timestamp: timestamp,
      tokenAddress: transfer.rawContract.address!,
      blockNum: web3.utils.hexToNumber(transfer.blockNum) as number,
      uniqueId: transfer.uniqueId,
      hash: transfer.hash,
      erc721TokenId: transfer.erc721TokenId,
      erc1155Metadata: transfer.erc1155Metadata,
      tokenId: transfer.tokenId,
      rawContract: transfer.rawContract,
    };
  });
  return result;
}

function timeRangeToMinutes(timeRange: string) {
  const timeRanges: { [range: string]: number } = {
    '24h': 60 * 24,
    '12h': 60 * 12,
    '6h': 60 * 6,
    '3h': 60 * 3,
    '1h': 60,
    '30m': 30,
    '5m': 5,
  };

  const minutes = timeRanges[timeRange];
  if (!minutes) {
    throw new Error(`Invalid time range: ${timeRange}`);
  }
  return minutes;
}

type AddressInfo = { fromAddress: string } | { toAddress: string };

async function getAllAssetTransfers(
  params: AddressInfo,
  timeRange: string,
  currentBlock: number,
): Promise<AssetTransfersResult[]> {
  const fromBlock =
    currentBlock - getNumOfBlocks(timeRangeToMinutes(timeRange));
  const baseAssetTransfersRequest = {
    excludeZeroValue: true,
    fromBlock: web3.utils.toHex(fromBlock),
    toBlock: web3.utils.toHex(currentBlock - 2),
    category: [
      AssetTransfersCategory.ERC20,
      AssetTransfersCategory.EXTERNAL,
      AssetTransfersCategory.INTERNAL,
    ],
  };
  const allAssetTransfers = [];
  let pageKey: undefined | string;
  do {
    const assetTransfers = await alchemy.core.getAssetTransfers({
      ...params,
      pageKey,
      ...baseAssetTransfersRequest,
    });
    allAssetTransfers.push(...assetTransfers.transfers);
    pageKey = assetTransfers.pageKey;
  } while (pageKey);
  return allAssetTransfers;
}

async function getInflowAndOutflow(
  address: string,
  now: Date,
  timeRange: string,
  currentBlock: number,
) {
  const [outflowRaw, inflowRaw] = await Promise.all([
    getAllAssetTransfers({ fromAddress: address }, timeRange, currentBlock),
    getAllAssetTransfers({ toAddress: address }, timeRange, currentBlock),
  ]);
  const [outflow, inflow] = [outflowRaw, inflowRaw].map((transfers) =>
    cleanTransfers(transfers, now, currentBlock),
  );
  return { outflow, inflow };
}

export async function getTransferEvents(address: string, timeRange: string) {
  try {
    const now = new Date();
    const currentBlock = await getCurrentBlock();
    const { outflow, inflow } = await getInflowAndOutflow(
      address,
      now,
      timeRange,
      currentBlock,
    );

    if (!outflow.length || !inflow.length) {
      throw new Error(`Not enough transfers found in the last ${timeRange}`);
    }

    const perTokenCurrentTvl = await addCurrentTokenBalances(
      inflow,
      outflow,
      address,
      currentBlock,
    );

    const perTokenInflow = _.groupBy(inflow, 'asset');
    const perTokenOutflow = _.groupBy(outflow, 'asset');

    // const [perTokenInflowSum, perTokenOutflowSum] = [
    //   perTokenInflow,
    //   perTokenOutflow,
    // ].map((tokenFlow) =>
    //   _.mapValues(tokenFlow, (transfers) => _.sumBy(transfers, 'value')),
    // );

    return {
      outflow,
      inflow,
      // perTokenInflowSum,
      // perTokenOutflowSum,
      perTokenInflow,
      perTokenOutflow,
      now: now.getTime(),
      perTokenCurrentTvl,
    };
  } catch (err: any) {
    if (err.message.includes('Not enough transfers found')) {
      throw new Error(err.message);
    }
    logger.error('An unknown error occurred in getTransferEvents.', { err });
    throw new Error('An unknown error occurred.');
  }
}

export async function addTvlToTransfers(
  cleanTransfers: CleanTransfers[],
  address: string,
) {
  const block = await alchemy.core.getBlock('latest');
  let blockNum = block.number;
  await addCurrentTokenBalances(
    _.filter(cleanTransfers, { flow: 1 }),
    _.filter(cleanTransfers, { flow: -1 }),
    address,
    blockNum,
  );
}
