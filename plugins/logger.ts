import winston from 'winston';
import { ElasticsearchTransport } from 'winston-elasticsearch';
import ecsFormat from '@elastic/ecs-winston-format';

const esTransport = new ElasticsearchTransport({
  level: 'info',
  index: 'logs-alerthub',
  clientOpts: {
    // have to use process.env, because this file is dynamically imported
    // and the the if (browser) check is not enough for the compiler
    node: process.env.ELASTIC_URL || 'http://localhost:9200',
    auth: {
      username: process.env.ELASTIC_USERNAME || 'elastic',
      password: process.env.ELASTIC_PASSWORD || '',
    },
  },
});

const logger = winston.createLogger({
  format: ecsFormat(),
  transports: [
    esTransport,
    new winston.transports.Console({
      format: winston.format.prettyPrint(),
    }),
  ],
});

esTransport.on('error', (error) => {
  console.debug('Error in esTransport', error);
});

esTransport.on('warning', (warning) => {
  console.debug('Elasticsearch Warning:', warning);
});

export default logger;
