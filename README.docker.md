# Docker Deployment for Solesonic LLM UI

This document describes how to deploy the Solesonic LLM UI React/Vite application using Docker and Nginx.

## Prerequisites

- Docker and Docker Compose installed on your server
- Node.js and npm (for local building) or a pre-built container image
- For production HTTPS: a reverse proxy with SSL certificates (see README.nginx.md)

## Files Overview

- `Dockerfile` — Multi-stage build that compiles the React application and serves it with Nginx
- `nginx.conf` — **envsubst template** for the container's Nginx config (routing, caching, security headers)
- `docker/15-render-nginx-conf.sh` — Entrypoint hook that renders it, building the CSP allowlist from `.env`
- `docker-compose.yml` — Docker Compose configuration for local deployment
- `README.nginx.md` — Detailed Nginx configuration guide

## Deployment Steps

### 1. Configure Environment Variables

Copy `.env.example` to `.env` and fill in real values. That file documents the
complete set — five `VITE_*` vars plus `TZ` — and nothing else is read.

```bash
cp .env.example .env
```

`.env` is gitignored and is the single source of truth for both phases of the
deployment:

- **Build time** — Vite inlines every `VITE_*` value into the JS bundle.
- **Run time** — `docker-compose.yml` passes the same file to the container via
  `env_file`, where `docker/15-render-nginx-conf.sh` derives the
  Content-Security-Policy `connect-src` origins from `VITE_API_BASE_URI` and
  `VITE_KEYCLOAK_URL`.

Because both phases read one file, the browser's `connect-src` allowlist cannot
drift away from the hosts the app actually calls. No hostname is committed to the
repository.

> `VITE_*` values are inlined into client-side JavaScript and are therefore
> readable by anyone using the app. Never put a secret in one.

### 2. Build and Start the Container

```bash
# Clone the repository (if not already done)
git clone <repository-url>
cd solesonic-llm-ui

# Build and start the container
docker-compose up -d
```

This will:
- Install dependencies using npm ci
- Build the React application with your environment variables
- Start Nginx to serve the built files
- Expose the application on localhost:3000

### 3. Verify the Deployment

Access the application:

```bash
curl http://localhost:3000
```

Or open http://localhost:3000 in your browser.

## Production Deployment

For production, use a reverse proxy (host Nginx or load balancer) to:
- Terminate TLS/SSL
- Manage Let's Encrypt certificates
- Route traffic to the container

See README.nginx.md for reverse proxy configuration examples.

## Troubleshooting

### Check Container Logs

If the application is not responding:

```bash
docker-compose logs -f solesonic-llm-ui
```

### Verify Nginx Configuration

```bash
docker-compose exec solesonic-llm-ui nginx -t
```

### Check Environment Variables

Ensure `.env` file exists and contains all required variables:

```bash
grep VITE_ .env
```

### Login Loops / "Authentication initialization failed"

If sign-in bounces to Keycloak and returns to an "Authentication Required" screen,
the PKCE token exchange is being blocked. Check, in order:

1. **The CSP actually resolved.** The container logs one line at startup naming the
   allowed origins, and the rendered config should contain real hostnames:

   ```bash
   docker-compose logs solesonic-llm-ui | grep connect-src
   docker-compose exec solesonic-llm-ui grep -o "connect-src[^;]*" /etc/nginx/conf.d/default.conf
   ```

   Empty or literal `${CSP_...}` values mean the container is not receiving `.env`
   — confirm the `env_file` entry in `docker-compose.yml` and recreate the
   container (`docker-compose up -d --force-recreate`; a plain restart keeps the
   old environment).

2. **Keycloak client configuration.** Valid Redirect URIs must include the UI
   origin with a trailing slash (the app sends `origin + pathname`, no query), and
   Web Origins must include the UI origin, or the token request fails CORS.

3. **Mixed content.** An `http://` API or Keycloak URL called from an `https://`
   page is blocked by the browser regardless of CSP.

The browser console names which of these it is: a CSP failure says "Refused to
connect", a CORS failure names the missing `Access-Control-Allow-Origin`.

### Container Not Starting

Verify Docker and Docker Compose are installed:

```bash
docker --version
docker-compose --version
```

## Security Considerations

- Never commit `.env` file to version control
- Use environment-specific environment variables for different deployments
- Store sensitive values (API keys, etc.) securely
- Use HTTPS in production via a reverse proxy with proper SSL certificates

## Customization

To customize the deployment:

- **Nginx routing and caching**: Edit `nginx.conf` to change static asset caching times, add new routes, or modify the SPA fallback behavior
- **Build process**: Update `Dockerfile` if you need to change Node version, build scripts, or dependencies
- **Container configuration**: Modify `docker-compose.yml` for port mappings, volumes, environment variables, or resource limits
- **Application config**: Update `.env` to change API endpoints, Keycloak settings, or application behavior
