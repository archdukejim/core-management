# core-management

Web management interface for [core-template](https://github.com/archdukejim/core-template) infrastructure services. Provides a containerized UI for managing BIND9 DNS records, TSIG keys, and minting certificates from Step-CA.

## Features

- **DNS Records** — List, add, and delete records across all BIND9 zones (A, AAAA, CNAME, MX, TXT, SRV, PTR, CAA)
- **TSIG Keys** — Create and remove TSIG keys with configurable zone grants; copy RFC2136 credentials
- **Certificate Minting** — Offline mint leaf certificates or intermediate CAs via Step-CA with configurable SANs and duration

## Architecture

- **Backend:** Node.js / Express / TypeScript
- **Frontend:** Vanilla HTML/CSS/JS single-page app (dark theme)
- **DNS operations:** Zone file editing with `rndc freeze/thaw` via Docker socket exec
- **TSIG operations:** Direct config file editing with `rndc reload`
- **Certificate operations:** `step certificate create` using mounted CA cert/key

## Quick Start

```bash
docker compose up -d --build
```

Access the UI at `http://<host>:3000`.

## Container Integration

The management container joins the existing `core_net` bridge network at `10.255.0.60` and requires the following volume mounts:

| Mount | Source | Purpose |
|-------|--------|---------|
| `/bind9/config` | `/opt/bind9/config` | BIND9 config files (TSIG keys, zone definitions) |
| `/bind9/data` | `/opt/bind9/data` | BIND9 zone data files |
| `/stepca/data` | `/opt/stepca/data` | Step-CA certs, keys, and templates |
| `/var/run/docker.sock` | `/var/run/docker.sock` | Docker API for rndc exec into bind9 container |

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
| `GET` | `/api/health` | Health check |
