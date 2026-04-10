import fs from 'fs/promises';
import crypto from 'crypto';
import https from 'https';
import { config } from '../config';
import { SignJWT, importJWK, compactDecrypt, type KeyLike } from 'jose';
import forge from 'node-forge';

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

// Cached provisioner state — initialized once at startup
let provisionerKey: KeyLike | Uint8Array | null = null;
let provisionerKid: string = '';
let provisionerAlg: string = 'ES256';
let rootFingerprint: string = '';
let httpsAgent: https.Agent | null = null;

export async function initialize(): Promise<void> {
  // Read root CA cert for TLS trust and fingerprint
  const rootPem = await fs.readFile(config.stepca.rootCertFile, 'utf-8');
  const rootDer = Buffer.from(
    rootPem.replace(/-----[^-]+-----/g, '').replace(/\s/g, ''),
    'base64'
  );
  rootFingerprint = crypto.createHash('sha256').update(rootDer).digest('hex');

  httpsAgent = new https.Agent({ ca: rootPem });

  // Parse ca.json to find the JWK provisioner
  const caConfig = JSON.parse(await fs.readFile(config.stepca.caConfigFile, 'utf-8'));
  const provisioners: any[] = caConfig.authority?.provisioners || [];
  const jwkProv = provisioners.find(
    (p: any) => p.type === 'JWK' && p.name === config.stepca.provisioner
  );
  if (!jwkProv) {
    throw new Error(`JWK provisioner "${config.stepca.provisioner}" not found in ca.json`);
  }
  if (!jwkProv.encryptedKey) {
    throw new Error('Provisioner has no encryptedKey');
  }

  provisionerKid = jwkProv.key?.kid || '';

  // Decrypt the JWE-encrypted provisioner private key using the password
  const password = (await fs.readFile(config.stepca.passwordFile, 'utf-8')).trim();
  const { plaintext } = await compactDecrypt(
    jwkProv.encryptedKey,
    new TextEncoder().encode(password)
  );
  const privateJwk = JSON.parse(new TextDecoder().decode(plaintext));

  // Determine signing algorithm from the JWK key type
  if (privateJwk.kty === 'EC') {
    const curveAlgMap: Record<string, string> = { 'P-256': 'ES256', 'P-384': 'ES384', 'P-521': 'ES512' };
    provisionerAlg = curveAlgMap[privateJwk.crv] || 'ES256';
  } else if (privateJwk.kty === 'RSA') {
    provisionerAlg = 'RS256';
  } else if (privateJwk.kty === 'OKP') {
    provisionerAlg = 'EdDSA';
  }

  provisionerKey = await importJWK(privateJwk);

  console.log(`Step-CA provisioner "${config.stepca.provisioner}" initialized`);
}

async function generateOTT(commonName: string, sans?: string[]): Promise<string> {
  if (!provisionerKey) {
    throw new Error('Step-CA provisioner not initialized — call initialize() first');
  }

  const allSans = sans && sans.length > 0 ? [commonName, ...sans] : [commonName];
  const audience = `${config.stepca.apiUrl}/1.0/sign`;

  const token = await new SignJWT({
    sans: allSans,
    sha: rootFingerprint,
  })
    .setProtectedHeader({ alg: provisionerAlg, kid: provisionerKid })
    .setSubject(commonName)
    .setIssuer(config.stepca.provisioner)
    .setAudience(audience)
    .setIssuedAt()
    .setNotBefore('0s')
    .setExpirationTime('5m')
    .setJti(crypto.randomUUID())
    .sign(provisionerKey);

  return token;
}

function generateCSR(
  commonName: string,
  keyPair: forge.pki.rsa.KeyPair,
  sans?: string[]
): string {
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = keyPair.publicKey;
  csr.setSubject([{ name: 'commonName', value: commonName }]);

  if (sans && sans.length > 0) {
    const altNames = sans.map((san) => {
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(san)) {
        return { type: 7, ip: san };                // IP address
      }
      return { type: 2, value: san };               // DNS name
    });
    csr.setAttributes([{
      name: 'extensionRequest',
      extensions: [{ name: 'subjectAltName', altNames }],
    }]);
  }

  csr.sign(keyPair.privateKey, forge.md.sha256.create());
  return forge.pki.certificationRequestToPem(csr);
}

function stepcaRequest(method: string, apiPath: string, body?: unknown): Promise<any> {
  const url = new URL(apiPath, config.stepca.apiUrl);

  return new Promise((resolve, reject) => {
    const options: https.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      agent: httpsAgent,
      headers: { 'Content-Type': 'application/json' },
    };

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString();
        if (res.statusCode && res.statusCode >= 400) {
          let msg = `Step-CA API error ${res.statusCode}`;
          try { msg = JSON.parse(responseBody).message || msg; } catch {}
          reject(new Error(msg));
          return;
        }
        try {
          resolve(JSON.parse(responseBody));
        } catch {
          resolve(responseBody);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30_000, () => {
      req.destroy(new Error('Step-CA API request timed out'));
    });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

export async function mintCertificate(req: MintRequest): Promise<MintResult> {
  const keyPair = forge.pki.rsa.generateKeyPair({ bits: 2048 });
  const csrPem = generateCSR(req.commonName, keyPair, req.sans);
  const ott = await generateOTT(req.commonName, req.sans);

  const duration = req.duration || '8760h';

  const signBody: any = {
    csr: csrPem,
    ott,
    notAfter: duration,
  };

  if (req.isCA) {
    signBody.templateData = {
      isCA: true,
      pathLen: req.pathLength ?? 0,
    };
  }

  const response = await stepcaRequest('POST', '/1.0/sign', signBody);

  const certificate = response.crt;
  const caChain: string[] = response.certChain || [];
  const privateKeyPem = forge.pki.privateKeyToPem(keyPair.privateKey);
  const chain = [certificate, ...caChain].join('');

  return {
    commonName: req.commonName,
    certificate,
    privateKey: privateKeyPem,
    chain,
  };
}

export async function getCACertificates(): Promise<{ root: string; intermediate: string }> {
  // Root cert from the API
  let root: string;
  try {
    const response = await stepcaRequest('GET', '/roots');
    root = (response.certificates || response.crts || [])[0] || '';
  } catch {
    // Fallback to mounted file
    root = await fs.readFile(config.stepca.rootCertFile, 'utf-8');
  }

  // Intermediate from mounted file (not directly exposed by the API)
  const intermediate = await fs.readFile(config.stepca.intermediateCertFile, 'utf-8');

  return { root, intermediate };
}
