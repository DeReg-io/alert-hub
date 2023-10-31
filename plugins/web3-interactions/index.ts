import { ethers } from 'ethers';
import logger from '../logger';
const { JsonRpcProvider, Wallet, Contract } = ethers;

const TRIGGER_MANAGER_ADDR = '0x819e48c248984Cd307603b13Fd20BE6f73339909';
const RPC_GEORLI_URL = process.env.RPC_GEORLI_URL || '';
const RPC_SEPOLIA_URL = process.env.RPC_SEPOLIA_URL || '';
const RPC_URL = process.env.RPC_URL || '';
const GOERLI_TRIGGER_OPERATOR_KEY =
  process.env.GOERLI_TRIGGER_OPERATOR_KEY || '';

function getTriggerManager(signer: ethers.Wallet): ethers.Contract {
  return new Contract(
    TRIGGER_MANAGER_ADDR,
    ['function executeTriggerOf(address target) external returns ()'],
    signer,
  );
}

const TRIGGER_MAX_GAS = 200_000n;

function createExecuteTrigger(triggerManager: ethers.Contract) {
  return async (
    target: string,
    options = {},
  ): Promise<ethers.ContractTransactionResponse> => {
    console.log(
      'triggerManager.executeTriggerOf:',
      triggerManager.executeTriggerOf.send,
    );
    const receipt = await triggerManager.executeTriggerOf.send(target, {
      gasLimit: TRIGGER_MAX_GAS,
      ...options,
    });
    console.log('receipt:', receipt);
    return receipt;
  };
}

async function executeTrigger(
  contractAddress: string,
  network: string,
): Promise<ethers.ContractTransactionResponse> {
  logger.info('Executing trigger', { contractAddress, network });
  let rpc: string;

  if (!contractAddress) {
    throw new Error('No contract address provided');
  }
  if (!network || !['Goerli', 'Mainnet', 'Sepolia'].includes(network)) {
    throw new Error(
      'No network provided, or wrong network provided. Possible opions: Goerli, Mainnet',
    );
  }

  if (network === 'Goerli') {
    rpc = RPC_GEORLI_URL;
  } else if (network === 'Sepolia') {
    rpc = RPC_SEPOLIA_URL;
  } else {
    // Mainnet
    rpc = RPC_URL;
  }

  const provider = new JsonRpcProvider(rpc);
  const rawPrivKey = GOERLI_TRIGGER_OPERATOR_KEY;
  const signer = new Wallet(rawPrivKey, provider);
  const triggerManager = getTriggerManager(signer);

  const trigger = createExecuteTrigger(triggerManager);

  console.log('calling trigger for contract address: ', contractAddress);

  return await trigger(contractAddress);
}

//   testContractAddress = '0xedf868000b7bb010fd741978306857eed9fcada7';
// async function executeTriggerFromEvent(
//   event: APIGatewayProxyEvent,
// ): Promise<APIGatewayProxyResult> {
//   let body;
//   if (event.body) {
//     body = JSON.parse(event.body);
//   } else {
//     throw new Error('No body provided');
//   }

//   await executeTrigger(body.contractAddress, body.network);

//   return {
//     statusCode: 200,
//     body: JSON.stringify({ message: 'success' }),
//   };
// }

export { executeTrigger };
