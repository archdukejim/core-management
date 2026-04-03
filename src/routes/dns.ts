import { Router, Request, Response } from 'express';
import * as bind9 from '../services/bind9';

const router = Router();

router.get('/zones', async (_req: Request, res: Response) => {
  try {
    const zones = await bind9.listZones();
    res.json(zones);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/zones/:zone/records', async (req: Request, res: Response) => {
  try {
    const records = await bind9.listRecords(req.params.zone);
    res.json(records);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/zones/:zone/records', async (req: Request, res: Response) => {
  try {
    const { name, ttl, type, data } = req.body;
    if (!name || !type || !data) {
      res.status(400).json({ error: 'name, type, and data are required' });
      return;
    }
    await bind9.addRecord(req.params.zone, name, ttl || 86400, type, data);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/zones/:zone/records', async (req: Request, res: Response) => {
  try {
    const { name, type, data } = req.body;
    if (!name || !type || !data) {
      res.status(400).json({ error: 'name, type, and data are required' });
      return;
    }
    await bind9.deleteRecord(req.params.zone, name, type, data);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
