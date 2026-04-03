import http from 'http';
import { config } from '../config';

interface ExecResult {
  exitCode: number;
  output: string;
}

function dockerRequest(method: string, path: string, body?: unknown): Promise<string> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      socketPath: config.docker.socketPath,
      path: `/v1.43${path}`,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    const req = http.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString()));
      res.on('error', reject);
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

export async function containerExec(container: string, cmd: string[]): Promise<ExecResult> {
  const createResp = await dockerRequest('POST', `/containers/${container}/exec`, {
    AttachStdout: true,
    AttachStderr: true,
    Cmd: cmd,
  });
  const { Id: execId } = JSON.parse(createResp);

  const startResp = await dockerRequest('POST', `/exec/${execId}/start`, {
    Detach: false,
    Tty: false,
  });

  const inspectResp = await dockerRequest('GET', `/exec/${execId}/json`);
  const { ExitCode } = JSON.parse(inspectResp);

  // Docker stream protocol: strip 8-byte frame headers
  let output = '';
  let offset = 0;
  const buf = Buffer.from(startResp, 'binary');
  while (offset < buf.length) {
    if (offset + 8 > buf.length) break;
    const size = buf.readUInt32BE(offset + 4);
    if (offset + 8 + size > buf.length) {
      output += buf.subarray(offset + 8).toString();
      break;
    }
    output += buf.subarray(offset + 8, offset + 8 + size).toString();
    offset += 8 + size;
  }

  return { exitCode: ExitCode, output: output.trim() };
}

export async function rndcReload(zone?: string): Promise<void> {
  const cmd = zone
    ? ['rndc', 'reload', zone]
    : ['rndc', 'reload'];
  const result = await containerExec(config.bind9.containerName, cmd);
  if (result.exitCode !== 0) {
    throw new Error(`rndc reload failed: ${result.output}`);
  }
}

export async function rndcFreeze(zone: string): Promise<void> {
  const result = await containerExec(config.bind9.containerName, ['rndc', 'freeze', zone]);
  if (result.exitCode !== 0) {
    throw new Error(`rndc freeze failed: ${result.output}`);
  }
}

export async function rndcThaw(zone: string): Promise<void> {
  const result = await containerExec(config.bind9.containerName, ['rndc', 'thaw', zone]);
  if (result.exitCode !== 0) {
    throw new Error(`rndc thaw failed: ${result.output}`);
  }
}
