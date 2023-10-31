import 'dotenv/config';
import express from 'express';
import routes from './routes';
import logger from './plugins/logger';

const PORT = 7010;

const app = express();

// express settings
app.use(express.json({ limit: '50mb' }));

routes(app);

app.listen(PORT, async () => {
  logger.info('Initialized alert-hub', { PORT });
});
