import path from 'path';

export const config = {
  isDevelopmentMode: process.env.DEVELOPMENT_MODE === 'true',
  port: parseInt(process.env.PORT || '3000', 10),
  bind9: {
    host: process.env.BIND9_HOST || '10.255.0.30',
    port: parseInt(process.env.BIND9_PORT || '5353', 10),
    configDir: process.env.BIND9_CONFIG_DIR || '/bind9/config',
    dataDir: process.env.BIND9_DATA_DIR || '/bind9/data',
    containerName: process.env.BIND9_CONTAINER || 'bind9',
  },
  stepca: {
    apiUrl: process.env.STEPCA_API_URL || 'https://step-ca:9000',
    provisioner: process.env.STEPCA_PROVISIONER || 'admin',
    dataDir: process.env.STEPCA_DATA_DIR || '/stepca/data',
    get caConfigFile() { return path.join(this.dataDir, 'config', 'ca.json'); },
    get passwordFile() { return path.join(this.dataDir, 'secrets', 'password'); },
    get rootCertFile() { return path.join(this.dataDir, 'certs', 'root_ca.crt'); },
    get intermediateCertFile() { return path.join(this.dataDir, 'certs', 'intermediate_ca.crt'); },
  },
  docker: {
    socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock',
  },
  oidc: {
    enabled: process.env.OIDC_ENABLED !== 'false',
    issuerBaseUrl: process.env.OIDC_ISSUER_BASE_URL || '',
    baseUrl: process.env.OIDC_BASE_URL || `http://localhost:${process.env.PORT || '3000'}`,
    clientId: process.env.OIDC_CLIENT_ID || 'core-management',
    clientSecret: process.env.OIDC_CLIENT_SECRET || '',
    sessionSecret: process.env.OIDC_SESSION_SECRET || '',
  },
};
