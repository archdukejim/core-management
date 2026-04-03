import { Router, Request, Response } from 'express';
import * as stepca from '../services/stepca';

const router = Router();

router.get('/ca', async (_req: Request, res: Response) => {
  try {
    const certs = await stepca.getCACertificates();
    res.json(certs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/mint', async (req: Request, res: Response) => {
  try {
    const { commonName, sans, duration, isCA, pathLength } = req.body;
    if (!commonName) {
      res.status(400).json({ error: 'commonName is required' });
      return;
    }
    const result = await stepca.mintCertificate({
      commonName,
      sans,
      duration,
      isCA,
      pathLength,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
