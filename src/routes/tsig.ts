import { Router, Request, Response } from 'express';
import * as tsig from '../services/tsig';

const router = Router();

router.get('/keys', async (_req: Request, res: Response) => {
  try {
    const keys = await tsig.listKeys();
    res.json(keys);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/grants', async (_req: Request, res: Response) => {
  try {
    const grants = await tsig.listGrants();
    res.json(grants);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/keys', async (req: Request, res: Response) => {
  try {
    const { name, zones, matchType, recordTypes, grantName } = req.body;
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const key = await tsig.addKey(
      name,
      zones || [],
      matchType || 'zonesub',
      recordTypes || 'ANY',
      grantName
    );
    res.json(key);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/keys/:name', async (req: Request, res: Response) => {
  try {
    await tsig.removeKey(req.params.name);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
