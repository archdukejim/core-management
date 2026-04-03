import path from 'path';

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  bind9: {
    host: process.env.BIND9_HOST || '10.255.0.30',
    port: parseInt(process.env.BIND9_PORT || '5353', 10),
    configDir: process.env.BIND9_CONFIG_DIR || '/bind9/config',
    dataDir: process.env.BIND9_DATA_DIR || '/bind9/data',
    containerName: process.env.BIND9_CONTAINER || 'bind9',
  },
  stepca: {
    dataDir: process.env.STEPCA_DATA_DIR || '/stepca/data',
    get certsDir() { return path.join(this.dataDir, 'certs'); },
    get secretsDir() { return path.join(this.dataDir, 'secrets'); },
    get templatesDir() { return path.join(this.dataDir, 'templates', 'certs'); },
  },
  docker: {
    socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock',
  },
};
