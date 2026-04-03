export interface DnsRecord {
  name: string;
  ttl: number;
  class: string;
  type: string;
  data: string;
}

export function parseZoneFile(content: string, origin: string): DnsRecord[] {
  const records: DnsRecord[] = [];
  let defaultTtl = 86400;
  let currentName = '@';

  const lines = content.split('\n');
  for (const raw of lines) {
    const line = raw.replace(/;.*$/, '').trim();
    if (!line) continue;

    // $TTL directive
    const ttlMatch = line.match(/^\$TTL\s+(\d+)/i);
    if (ttlMatch) {
      defaultTtl = parseInt(ttlMatch[1], 10);
      continue;
    }

    // Skip other directives
    if (line.startsWith('$')) continue;

    // Skip SOA records (may span lines, but we handle single-line after comment strip)
    if (/\bSOA\b/i.test(line)) continue;
    // Skip continuation lines inside SOA parentheses
    if (/^\s*[\d]+\s*[;)]?$/.test(line) || line === ')' || line === '(') continue;

    // Parse resource record
    const parts = line.split(/\s+/);
    if (parts.length < 3) continue;

    let idx = 0;
    let name = currentName;
    let ttl = defaultTtl;
    let cls = 'IN';
    let type = '';
    let data = '';

    // First token: name or starts with a number (TTL) or class or type
    if (!/^\d+$/.test(parts[0]) && !isClass(parts[0]) && !isType(parts[0])) {
      name = parts[0];
      currentName = name;
      idx = 1;
    }

    // Optional TTL
    if (idx < parts.length && /^\d+$/.test(parts[idx])) {
      ttl = parseInt(parts[idx], 10);
      idx++;
    }

    // Optional class
    if (idx < parts.length && isClass(parts[idx])) {
      cls = parts[idx].toUpperCase();
      idx++;
    }

    // Type
    if (idx < parts.length && isType(parts[idx])) {
      type = parts[idx].toUpperCase();
      idx++;
    }

    if (!type) continue;

    // Rest is data
    data = parts.slice(idx).join(' ');

    // Expand @ to origin
    const displayName = name === '@' ? origin : name;

    // Skip NS records for the zone origin (infrastructure records)
    if (type === 'NS' && name === '@') continue;

    records.push({ name: displayName, ttl, class: cls, type, data });
  }

  return records;
}

const VALID_CLASSES = new Set(['IN', 'CH', 'HS', 'ANY']);
const VALID_TYPES = new Set([
  'A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'NS', 'PTR', 'CAA', 'SOA',
]);

function isClass(token: string): boolean {
  return VALID_CLASSES.has(token.toUpperCase());
}

function isType(token: string): boolean {
  return VALID_TYPES.has(token.toUpperCase());
}
