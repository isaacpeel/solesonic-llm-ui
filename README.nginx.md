# Nginx Runtime Template Guide

This guide explains how the app uses Nginx’s runtime templating and what you need to put in your `.env` file to configure it.

## Overview
- The container uses the official `nginx:alpine` image.
- On container start, Nginx’s entrypoint renders `/etc/nginx/templates/default.conf.template` into `/etc/nginx/conf.d/default.conf` using environment variables (via `envsubst`).
- Environment variables are loaded by Docker Compose from the project’s `.env` file.
- SSL certificates are mounted read‑only from the host at `/etc/letsencrypt`.

Relevant project files:
- `nginx.conf.template` (at repo root): the Nginx template with placeholders.
- `Dockerfile`: installs `gettext` (for `envsubst`) and copies the template to `/etc/nginx/templates/default.conf.template`.
- `docker-compose.yml`: loads `.env`, exposes ports 80/443, and mounts certificates/logs.
- `.env`: contains both frontend (Vite) and Nginx runtime variables.

## Required .env variables for Nginx
Add the following to your `.env` (alongside existing Vite vars). Adjust values for your domain/cert paths:

```
SERVER_NAME="example.com www.example.com"
SSL_CERT_PATH=/etc/letsencrypt/live/your-domain/fullchain.pem
SSL_KEY_PATH=/etc/letsencrypt/live/your-domain/privkey.pem
TZ=UTC
```

What they do:
- SERVER_NAME: Space‑separated list of hostnames this server should respond to.
- SSL_CERT_PATH: Path to the fullchain certificate inside the container.
- SSL_KEY_PATH: Path to the private key inside the container.
- TZ: Container timezone (also passed via Compose `environment`).

The repo’s `.env` may also include Vite variables (prefixed with `VITE_`) used at build time. Keep those as needed.

## How the template works
`nginx.conf.template` contains placeholders like `${SERVER_NAME}`, `${SSL_CERT_PATH}`, and `${SSL_KEY_PATH}`. At runtime, Nginx’s entrypoint replaces them with the values from your environment and writes the final file to `/etc/nginx/conf.d/default.conf`.

Key locations in the image:
- Template source: `/etc/nginx/templates/default.conf.template`
- Rendered config: `/etc/nginx/conf.d/default.conf`
- App static files: `/usr/share/nginx/html`

## Prerequisites
- DNS for your domain points to the server.
- Let’s Encrypt certs exist on the host under `/etc/letsencrypt/live/your-domain/`.
  - The Compose file mounts `/etc/letsencrypt` from the host into the container as read‑only.

## Quick start
1) Put your values in `.env` (see the block above). Ensure the cert paths match your host’s real cert locations.
2) Start the container:
   - `docker compose up -d`
3) Verify the template rendered correctly:
   - `docker compose exec solesonic-llm-ui sh -c "cat /etc/nginx/conf.d/default.conf"`
   - Check that `server_name` and SSL paths are concrete values (not `${...}`).
4) Visit your domain over HTTPS to confirm it serves the app.

## Certificate renewal
- Renew Let’s Encrypt certs on the host as usual (e.g., with `certbot`).
- Reload Nginx to pick up renewed files:
  - `docker compose exec solesonic-llm-ui nginx -s reload`

## Troubleshooting
- Template not rendering:
  - Ensure the template exists at `/etc/nginx/templates/default.conf.template` (provided by Dockerfile).
  - Ensure Compose is loading `.env` (see `env_file` in `docker-compose.yml`).
  - Check logs: `docker compose logs -f`
- SSL errors:
  - Confirm the host cert paths are correct and mounted read‑only at `/etc/letsencrypt`.
  - Ensure `SERVER_NAME` matches the certificate’s domains.
- 403/404 for routes:
  - The template serves static assets and falls back to `index.html` for SPA routes (`/`, `/settings`, and general SPA fallback).

## Notes
- Keep `/etc/letsencrypt` mounted read‑only for safety.
- You can maintain different `.env` files per environment and swap them before `docker compose up`.
- Do not commit private keys or secrets; `.env` is typically excluded from version control.
