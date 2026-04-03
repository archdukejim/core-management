import express from 'express';
import path from 'path';
import { config } from './config';
import dnsRoutes from './routes/dns';
import tsigRoutes from './routes/tsig';
import certsRoutes from './routes/certs';

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/dns', dnsRoutes);
app.use('/api/tsig', tsigRoutes);
app.use('/api/certs', certsRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(config.port, '0.0.0.0', () => {
  console.log(`core-management listening on port ${config.port}`);
});
