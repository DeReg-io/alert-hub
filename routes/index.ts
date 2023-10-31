import easyTrigger from './easy-trigger';
import { Express } from 'express';
import alchemy from './alchemy';
import alert from './alert';

export default function initRoutes(app: Express) {
  app.use('/easy-trigger', easyTrigger);
  app.use('/alchemy', alchemy);
  app.use('/alert', alert);
}
