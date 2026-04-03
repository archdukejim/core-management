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
  // Parse zone blocks — template produces `zone "name" {` (no IN)
  const zoneRe = /zone\s+"([^"]+)"\s*\{/g;
  let zoneMatch;
  while ((zoneMatch = zoneRe.exec(content)) !== null) {
    const zone = zoneMatch[1];
    // Extract the zone block body by counting braces from the opening {
    const start = zoneMatch.index + zoneMatch[0].length;
    const body = extractBlock(content, start);

    // Parse grants — key names may be quoted, record types can be multi-word
    // Format: grant "keyname" matchType target recordTypes;
    // Or:     grant keyname matchType target recordTypes;
    const grantRe = /grant\s+"?([^"\s]+)"?\s+(\S+)\s+(\S+)\s+([^;]+);/g;
    let grantMatch;
    while ((grantMatch = grantRe.exec(body)) !== null) {
      grants.push({
        keyName: grantMatch[1],
        zone,
        matchType: grantMatch[2],
        name: grantMatch[3],
        recordTypes: grantMatch[4].trim(),
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

  // Add grant lines to named.conf.zones using the marker comment
  if (zones.length > 0) {
    const zonesPath = path.join(config.bind9.configDir, 'named.conf.zones');
    let zonesContent = await fs.readFile(zonesPath, 'utf-8');

    for (const zone of zones) {
      const target = grantName || `${zone}.`;
      const grantLine = `        grant "${name}" ${matchType} ${target} ${recordTypes};`;
      // Insert after the "// --- additional keys ---" marker within the matching zone block
      const markerRe = new RegExp(
        `(zone\\s+"${escapeRegex(zone)}"\\s*\\{[\\s\\S]*?// --- additional keys ---[^\\n]*)`,
        ''
      );
      const markerMatch = zonesContent.match(markerRe);
      if (markerMatch) {
        const insertPos = markerMatch.index! + markerMatch[0].length;
        zonesContent =
          zonesContent.slice(0, insertPos) +
          '\n' + grantLine +
          zonesContent.slice(insertPos);
      }
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

  // Remove all grant lines referencing this key (quoted or unquoted) from named.conf.zones
  const zonesPath = path.join(config.bind9.configDir, 'named.conf.zones');
  let zonesContent = await fs.readFile(zonesPath, 'utf-8');
  zonesContent = zonesContent.replace(
    new RegExp(`^\\s*(?://[^\\n]*\\n)?\\s*grant\\s+"?${escapeRegex(name)}"?\\s+.*$\\n?`, 'gm'),
    ''
  );
  await fs.writeFile(zonesPath, zonesContent);

  await rndcReload();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractBlock(content: string, startAfterBrace: number): string {
  let depth = 1;
  let i = startAfterBrace;
  while (i < content.length && depth > 0) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') depth--;
    i++;
  }
  return content.slice(startAfterBrace, i - 1);
}
