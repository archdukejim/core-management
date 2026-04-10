import express from 'express';
import path from 'path';
import { config } from './config';
import { oidcMiddleware, requiresAuth } from './middleware/auth';
import { initialize as initStepCA } from './services/stepca';
import dnsRoutes from './routes/dns';
import tsigRoutes from './routes/tsig';
import certsRoutes from './routes/certs';

const app = express();

app.use(express.json());

// Health endpoint — always public (Docker healthcheck)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// OIDC authentication
if (config.oidc.enabled && config.oidc.issuerBaseUrl) {
  app.use(oidcMiddleware());
  app.use('/api', requiresAuth());
  console.log(`OIDC authentication enabled (issuer: ${config.oidc.issuerBaseUrl})`);
} else {
  console.log('OIDC authentication disabled — running without auth');
}

// Static assets (CSS/JS) are public, SPA shell is protected below
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api/dns', dnsRoutes);
app.use('/api/tsig', tsigRoutes);
app.use('/api/certs', certsRoutes);

// User info endpoint (available when OIDC is active)
app.get('/api/me', (req: any, res) => {
  if (req.oidc?.user) {
    res.json({
      name: req.oidc.user.name,
      email: req.oidc.user.email,
    });
  } else {
    res.json({ name: null, email: null });
  }
});

// SPA catch-all — serve index.html for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Initialize services and start
async function start() {
  try {
    await initStepCA();
  } catch (err: any) {
    console.error(`Step-CA initialization failed: ${err.message}`);
    console.error('Certificate minting will not be available until Step-CA is reachable');
  }

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`core-management listening on port ${config.port}`);
  });
}

start();
