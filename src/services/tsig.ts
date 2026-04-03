import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config';
import { rndcReload } from '../utils/docker';

export interface TsigKey {
  name: string;
  algorithm: string;
  secret: string;
}

export interface TsigGrant {
  keyName: string;
  zone: string;
  matchType: string;
  recordTypes: string;
  name?: string;
}

export async function listKeys(): Promise<TsigKey[]> {
  const content = await fs.readFile(
    path.join(config.bind9.configDir, 'named.conf.keys'),
    'utf-8'
  );
  const keys: TsigKey[] = [];
  const re = /key\s+"([^"]+)"\s*\{[^}]*algorithm\s+([^;]+);[^}]*secret\s+"([^"]+)"/gs;
  let match;
  while ((match = re.exec(content)) !== null) {
    keys.push({
      name: match[1],
      algorithm: match[2].trim(),
      secret: match[3],
    });
  }
  return keys;
}

export async function listGrants(): Promise<TsigGrant[]> {
  const content = await fs.readFile(
    path.join(config.bind9.configDir, 'named.conf.zones'),
    'utf-8'
  );
  const grants: TsigGrant[] = [];
  // Match zone blocks and extract grants
  const zoneRe = /zone\s+"([^"]+)"\s+IN\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/gs;
  let zoneMatch;
  while ((zoneMatch = zoneRe.exec(content)) !== null) {
    const zone = zoneMatch[1];
    const body = zoneMatch[2];
    const grantRe = /grant\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)/g;
    let grantMatch;
    while ((grantMatch = grantRe.exec(body)) !== null) {
      grants.push({
        keyName: grantMatch[1],
        zone,
        matchType: grantMatch[2],
        name: grantMatch[3],
        recordTypes: grantMatch[4],
      });
    }
  }
  return grants;
}

export async function addKey(
  name: string,
  zones: string[],
  matchType: string,
  recordTypes: string,
  grantName?: string
): Promise<TsigKey> {
  const secret = crypto.randomBytes(32).toString('base64');
  const algorithm = 'hmac-sha256';

  // Add key definition to named.conf.keys
  const keysPath = path.join(config.bind9.configDir, 'named.conf.keys');
  let keysContent = await fs.readFile(keysPath, 'utf-8');
  const keyBlock = `\nkey "${name}" {\n    algorithm ${algorithm};\n    secret "${secret}";\n};\n`;
  keysContent = keysContent.trimEnd() + '\n' + keyBlock;
  await fs.writeFile(keysPath, keysContent);

  // Add grant lines to named.conf.zones
  if (zones.length > 0) {
    const zonesPath = path.join(config.bind9.configDir, 'named.conf.zones');
    let zonesContent = await fs.readFile(zonesPath, 'utf-8');

    for (const zone of zones) {
      const target = grantName || `${zone}.`;
      const grantLine = `        grant ${name} ${matchType} ${target} ${recordTypes};`;
      // Insert grant before the closing of update-policy block for the zone
      const policyEndRe = new RegExp(
        `(zone\\s+"${escapeRegex(zone)}"\\s+IN\\s*\\{[^}]*update-policy\\s*\\{[^}]*)` +
        `(\\s*\\};\\s*\\};)`,
        's'
      );
      zonesContent = zonesContent.replace(policyEndRe, `$1\n${grantLine}$2`);
    }
    await fs.writeFile(zonesPath, zonesContent);
  }

  await rndcReload();
  return { name, algorithm, secret };
}

export async function removeKey(name: string): Promise<void> {
  // Remove key block from named.conf.keys
  const keysPath = path.join(config.bind9.configDir, 'named.conf.keys');
  let keysContent = await fs.readFile(keysPath, 'utf-8');
  keysContent = keysContent.replace(
    new RegExp(`\\n?key\\s+"${escapeRegex(name)}"\\s*\\{[^}]*\\};\\n?`, 'g'),
    '\n'
  );
  await fs.writeFile(keysPath, keysContent);

  // Remove all grant lines referencing this key from named.conf.zones
  const zonesPath = path.join(config.bind9.configDir, 'named.conf.zones');
  let zonesContent = await fs.readFile(zonesPath, 'utf-8');
  zonesContent = zonesContent.replace(
    new RegExp(`^\\s*grant\\s+${escapeRegex(name)}\\s+.*$\\n?`, 'gm'),
    ''
  );
  await fs.writeFile(zonesPath, zonesContent);

  await rndcReload();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
