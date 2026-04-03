import fs from 'fs/promises';
import path from 'path';
import { config } from '../config';
import { rndcFreeze, rndcThaw } from '../utils/docker';
import { DnsRecord, parseZoneFile } from '../utils/zone-parser';

export interface Zone {
  name: string;
  file: string;
}

export async function listZones(): Promise<Zone[]> {
  const zonesConf = await fs.readFile(
    path.join(config.bind9.configDir, 'named.conf.zones'),
    'utf-8'
  );
  const zones: Zone[] = [];
  const re = /zone\s+"([^"]+)"\s+IN\s*\{[^}]*file\s+"([^"]+)"/g;
  let match;
  while ((match = re.exec(zonesConf)) !== null) {
    zones.push({ name: match[1], file: match[2] });
  }
  return zones;
}

export async function listRecords(zone: string): Promise<DnsRecord[]> {
  const zones = await listZones();
  const z = zones.find((z) => z.name === zone);
  if (!z) throw new Error(`Zone "${zone}" not found`);

  // Zone files are in the data dir, filename like db.<zone>
  const filename = path.basename(z.file);
  const content = await fs.readFile(
    path.join(config.bind9.dataDir, filename),
    'utf-8'
  );
  return parseZoneFile(content, zone);
}

export async function addRecord(
  zone: string,
  name: string,
  ttl: number,
  type: string,
  data: string
): Promise<void> {
  const zones = await listZones();
  const z = zones.find((z) => z.name === zone);
  if (!z) throw new Error(`Zone "${zone}" not found`);

  const filename = path.basename(z.file);
  const filePath = path.join(config.bind9.dataDir, filename);

  await rndcFreeze(zone);
  try {
    let content = await fs.readFile(filePath, 'utf-8');
    content = incrementSerial(content);
    const fqName = name.endsWith('.') ? name : name;
    const record = `${fqName}\t${ttl}\tIN\t${type.toUpperCase()}\t${data}\n`;
    content = content.trimEnd() + '\n' + record;
    await fs.writeFile(filePath, content);
  } finally {
    await rndcThaw(zone);
  }
}

export async function deleteRecord(
  zone: string,
  name: string,
  type: string,
  data: string
): Promise<void> {
  const zones = await listZones();
  const z = zones.find((z) => z.name === zone);
  if (!z) throw new Error(`Zone "${zone}" not found`);

  const filename = path.basename(z.file);
  const filePath = path.join(config.bind9.dataDir, filename);

  await rndcFreeze(zone);
  try {
    let content = await fs.readFile(filePath, 'utf-8');
    content = incrementSerial(content);

    const lines = content.split('\n');
    const filtered = lines.filter((line) => {
      const stripped = line.replace(/;.*$/, '').trim();
      if (!stripped) return true;
      const normName = name === zone ? '@' : name;
      const hasName = stripped.startsWith(name) || stripped.startsWith(normName);
      const hasType = new RegExp(`\\b${type.toUpperCase()}\\b`).test(stripped.toUpperCase());
      const hasData = stripped.includes(data);
      return !(hasName && hasType && hasData);
    });
    await fs.writeFile(filePath, filtered.join('\n'));
  } finally {
    await rndcThaw(zone);
  }
}

function incrementSerial(content: string): string {
  return content.replace(
    /(\d{10})(\s*;\s*serial)/i,
    (_match, serial: string, comment: string) => {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const currentDate = serial.slice(0, 8);
      const currentSeq = parseInt(serial.slice(8), 10);
      let newSerial: string;
      if (currentDate === today) {
        newSerial = today + String(currentSeq + 1).padStart(2, '0');
      } else {
        newSerial = today + '01';
      }
      return newSerial + comment;
    }
  );
}
