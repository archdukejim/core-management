# core-management

Web management interface for [core-template](https://github.com/archdukejim/core-template) infrastructure services. Provides a containerized UI for managing BIND9 DNS records, TSIG keys, and minting certificates from Step-CA.

## Features

- **DNS Records** — List, add, and delete records across all BIND9 zones (A, AAAA, CNAME, MX, TXT, SRV, PTR, CAA)
- **TSIG Keys** — Create and remove TSIG keys with configurable zone grants; copy RFC2136 credentials
- **Certificate Minting** — Mint leaf certificates or intermediate CAs via the Step-CA API with configurable SANs and duration
- **Authentication** — Keycloak OIDC integration for securing access to the management interface

## Architecture

- **Backend:** Node.js / Express / TypeScript
- **Frontend:** Vanilla HTML/CSS/JS single-page app (dark theme)
- **DNS operations:** Zone file editing with `rndc freeze/thaw` via Docker socket exec
- **TSIG operations:** Direct config file editing with `rndc reload`
- **Certificate operations:** Step-CA REST API (`/1.0/sign`) with JWK provisioner authentication
- **Authentication:** OAuth2/OIDC via `express-openid-connect` (Keycloak or any OIDC provider)

## Quick Start

```bash
docker compose up -d --build
```

Access the UI at `http://<host>:3000`.

### Enabling Authentication

Authentication is disabled by default. To enable it, configure the OIDC environment variables in a `.env` file alongside `docker-compose.yml`:

```env
OIDC_ENABLED=true
OIDC_ISSUER_BASE_URL=https://keycloak.example.com/realms/core
OIDC_BASE_URL=https://management.example.com
OIDC_CLIENT_ID=core-management
OIDC_CLIENT_SECRET=<from-keycloak-client>
OIDC_SESSION_SECRET=<random-32-byte-string>
```

Then create a matching client in your Keycloak realm:
- **Client ID:** `core-management`
- **Client Protocol:** openid-connect
- **Access Type:** confidential
- **Valid Redirect URIs:** `https://management.example.com/callback`

## Container Integration

The management container joins the existing `core_net` bridge network at `10.255.0.60` and requires the following volume mounts:

| Mount | Source | Purpose |
|-------|--------|---------|
| `/bind9/config` | `/opt/bind9/config` | BIND9 config files (TSIG keys, zone definitions) |
| `/bind9/data` | `/opt/bind9/data` | BIND9 zone data files |
| `/stepca/data` | `/opt/stepca/data` | Step-CA ca.json, provisioner key, CA certs (read-only) |
| `/var/run/docker.sock` | `/var/run/docker.sock` | Docker API for rndc exec into bind9 container |

### Step-CA Integration

Certificate minting uses the Step-CA REST API rather than the CLI. On startup, the app:
1. Reads `ca.json` from the mounted Step-CA data directory
2. Extracts and decrypts the JWK provisioner's private key using the CA password
3. Generates one-time tokens (OTT JWTs) to authenticate sign requests
4. Sends CSRs to the `/1.0/sign` endpoint over HTTPS (trusting the private root CA)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server listen port |
| `BIND9_HOST` | `10.255.0.30` | BIND9 container IP |
| `BIND9_PORT` | `5353` | BIND9 DNS port |
| `BIND9_CONFIG_DIR` | `/bind9/config` | Mounted BIND9 config path |
| `BIND9_DATA_DIR` | `/bind9/data` | Mounted BIND9 data path |
| `BIND9_CONTAINER` | `bind9` | BIND9 container name for Docker exec |
| `STEPCA_API_URL` | `https://step-ca:9000` | Step-CA API endpoint |
| `STEPCA_PROVISIONER` | `admin` | JWK provisioner name in ca.json |
| `STEPCA_DATA_DIR` | `/stepca/data` | Mounted Step-CA data path |
| `DOCKER_SOCKET` | `/var/run/docker.sock` | Docker socket path |
| `OIDC_ENABLED` | `false` | Enable Keycloak OIDC authentication |
| `OIDC_ISSUER_BASE_URL` | — | Keycloak realm URL |
| `OIDC_BASE_URL` | `http://localhost:3000` | This app's public URL |
| `OIDC_CLIENT_ID` | `core-management` | OIDC client ID |
| `OIDC_CLIENT_SECRET` | — | OIDC client secret |
| `OIDC_SESSION_SECRET` | — | Secret for encrypting session cookies |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/dns/zones` | List all zones |
| `GET` | `/api/dns/zones/:zone/records` | List records in a zone |
| `POST` | `/api/dns/zones/:zone/records` | Add a record |
| `DELETE` | `/api/dns/zones/:zone/records` | Delete a record |
| `GET` | `/api/tsig/keys` | List TSIG keys |
| `GET` | `/api/tsig/grants` | List zone grants |
| `POST` | `/api/tsig/keys` | Create a TSIG key |
| `DELETE` | `/api/tsig/keys/:name` | Delete a TSIG key |
| `POST` | `/api/certs/mint` | Mint a certificate |
| `GET` | `/api/certs/ca` | Get CA certificates |
| `GET` | `/api/me` | Current authenticated user |
| `GET` | `/api/health` | Health check (unauthenticated) |
