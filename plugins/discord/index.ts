// import { APIGatewayProxyEvent } from 'aws-lambda';
// import { InteractionType, InteractionResponseType, verifyKey } from 'discord-interactions';
// import { jsonResponse } from '../helpers';
// // const outgoing = require('./outgoing');

// const config = {
//   discord: {
//     publicKey: 'afe1285e778815ed5742361396cf9d66a1ffed844afc7f2151af78e124f7079a',
//   },
// };

// function verifyDiscordRequestMiddleware(event: APIGatewayProxyEvent): boolean {
//   console.log('event.headers: ', event.headers);
//   const signatureKey = 'X-Signature-Ed25519';
//   const signatureTimestampKey = 'X-Signature-Timestamp';
//   const signature = event.headers[signatureKey] || (event.headers[signatureKey.toLowerCase()] as string);
//   const timestamp =
//     event.headers[signatureTimestampKey] || (event.headers[signatureTimestampKey.toLowerCase()] as string);
//   console.log('checking signature');
//   console.log('event.body: ', event.body);
//   console.log('signature', signature);
//   console.log('timestamp', timestamp);
//   console.log('publicKey', config.discord.publicKey);
//   const isValidRequest = verifyKey(event.body || '', signature, timestamp, config.discord.publicKey);
//   return isValidRequest;
// }

// function handleDiscordRequest(event: APIGatewayProxyEvent) {
//   console.log('handling discord request');
//   const isValidRequest = verifyDiscordRequestMiddleware(event);
//   if (!isValidRequest) {
//     return jsonResponse('Bad request signature', 401);
//   }
//   const { type, id, data } = JSON.parse(event.body || '{}');

//   console.log('type: ', type);
//   console.log('id: ', id);
//   console.log('data: ', data);

//   if (type === InteractionType.PING) {
//     return jsonResponse({ type: InteractionResponseType.PONG });
//   }

//   if (type === InteractionType.APPLICATION_COMMAND) {
//     const { name } = data;
//     if (name === 'initderegalerts') {
//       console.log('got initderegalerts');
//       return jsonResponse({
//         type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
//         data: {
//           content: 'DeReg alerts are initialized. You will get alerts for your contract now.',
//         },
//       });
//     }
//   }

//   throw new Error('Command not handled yet in discord-interactions');
// }

// export { handleDiscordRequest };
