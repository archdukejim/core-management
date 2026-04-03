import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { config } from '../config';
import { execFile } from 'child_process';

export interface MintRequest {
  commonName: string;
  sans?: string[];
  duration?: string;       // e.g. "8760h" (1 year)
  isCA?: boolean;
  pathLength?: number;
}

export interface MintResult {
  commonName: string;
  certificate: string;
  privateKey: string;
  chain: string;
}

function execFileAsync(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 30_000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${error.message}\n${stderr}`));
        return;
      }
      resolve(stdout);
    });
  });
}

export async function mintCertificate(req: MintRequest): Promise<MintResult> {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cert-'));
  const certPath = path.join(workDir, 'cert.pem');
  const keyPath = path.join(workDir, 'key.pem');

  const caCert = path.join(config.stepca.certsDir, 'intermediate_ca.crt');
  const caKey = path.join(config.stepca.secretsDir, 'intermediate_ca_key');
  const rootCert = path.join(config.stepca.certsDir, 'root_ca.crt');

  const templateFile = req.isCA
    ? path.join(config.stepca.templatesDir, 'subca.tpl')
    : path.join(config.stepca.templatesDir, 'leaf.tpl');

  const duration = req.duration || '8760h';

  const args: string[] = [
    'certificate', 'create',
    req.commonName,
    certPath,
    keyPath,
    '--ca', caCert,
    '--ca-key', caKey,
    '--template', templateFile,
    '--not-after', duration,
    '--insecure', '--no-password',
  ];

  if (req.sans && req.sans.length > 0) {
    for (const san of req.sans) {
      args.push('--san', san);
    }
  }

  if (req.isCA) {
    args.push('--set', `pathLen=${req.pathLength ?? 0}`);
  }

  try {
    await execFileAsync('step', args);

    const cert = await fs.readFile(certPath, 'utf-8');
    const key = await fs.readFile(keyPath, 'utf-8');
    const intermediate = await fs.readFile(caCert, 'utf-8');
    const root = await fs.readFile(rootCert, 'utf-8');
    const chain = cert + intermediate + root;

    return {
      commonName: req.commonName,
      certificate: cert,
      privateKey: key,
      chain,
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

export async function getCACertificates(): Promise<{ root: string; intermediate: string }> {
  const root = await fs.readFile(
    path.join(config.stepca.certsDir, 'root_ca.crt'),
    'utf-8'
  );
  const intermediate = await fs.readFile(
    path.join(config.stepca.certsDir, 'intermediate_ca.crt'),
    'utf-8'
  );
  return { root, intermediate };
}
