# Nginx Configuration for Solesonic LLM UI

This guide explains how the app is served by Nginx within the Docker container.

## Overview

The container uses the official `nginx:alpine` image to serve the built React application.
- Nginx runs on port 80 within the container
- The built application files are located at `/usr/share/nginx/html`
- The container is configured to allow access on localhost:3000 by the host
- For production HTTPS, place a reverse proxy (like host Nginx) in front of the container

Relevant files:
- `nginx.conf` — envsubst **template** for the container's Nginx config
- `docker/15-render-nginx-conf.sh` — Entrypoint hook that renders it, deriving the CSP origins from `.env`
- `Dockerfile` — Multi-stage build that compiles React and configures Nginx
- `docker-compose.yml` — Compose configuration that exposes the container

## Nginx Configuration

The `nginx.conf` file handles:
- Static asset caching (7-day expiration for images, CSS, JS, fonts)
- SPA routing fallback to `index.html` for client-side routes
- Security headers, including a Content-Security-Policy built from `.env`
- Error and access logging

```nginx
location ~* \.(jpg|jpeg|png|gif|css|js|woff2?|ttf|eot|svg|webp)$ {
    expires 7d;
    add_header Cache-Control "public";
}

location / {
    try_files $uri $uri/ /index.html;
}
```

### It is a template, not a finished config

`nginx.conf` is **not** copied to `conf.d/default.conf`. The Dockerfile installs it
at `/etc/nginx/default.conf.template`, and `docker/15-render-nginx-conf.sh` renders
it to `/etc/nginx/conf.d/default.conf` on every container start. Editing it
therefore requires recreating the container, not just reloading Nginx.

Two placeholders are substituted:

| Placeholder              | Derived from                                  |
|--------------------------|-----------------------------------------------|
| `${CSP_API_ORIGIN}`      | `VITE_API_BASE_URI` in `.env`, path stripped  |
| `${CSP_KEYCLOAK_ORIGIN}` | `VITE_KEYCLOAK_URL` in `.env`, path stripped  |

The render script lives in `/docker-entrypoint.d/`, which the official Nginx
entrypoint walks in sort order before starting Nginx. Two details matter:

- **It must stay executable.** The entrypoint silently skips non-executable files,
  which would leave the stock welcome-page config in place. The Dockerfile chmods
  it explicitly.
- **It writes a file rather than exporting variables.** The entrypoint runs these
  scripts inside a `find | while read` pipeline, so an export may or may not escape
  the subshell into the stock `20-envsubst-on-templates.sh` step. Producing the
  rendered config directly sidesteps the question. Keeping the template out of
  `/etc/nginx/templates/` also stops that stock step from overwriting the output.

The script names both variables explicitly when calling `envsubst`, which is what
keeps Nginx's own `$uri`, `$host`, and `$content_security_policy` from being
clobbered. If either variable is missing or is not an absolute `http(s)` URL, it
aborts startup with a message on stderr rather than letting Nginx come up with a
broken policy.

### Content-Security-Policy

The policy is defined once via `set $content_security_policy` and referenced by
each `add_header`. The duplication in the static-asset block is deliberate and
unavoidable: Nginx inherits `add_header` into a nested location *only* when that
location declares no `add_header` of its own. Referencing the variable rather than
repeating the policy text means the two copies cannot disagree.

`connect-src` must name the real API and Keycloak origins. If it does not,
`keycloak-js` cannot POST the PKCE authorization code to the token endpoint,
`init()` rejects, and the app is stuck on "Authentication Required" — a login loop
with no visible error beyond a "Refused to connect" line in the browser console.

## Running the Container

Start the container with Docker Compose:

```bash
docker-compose up -d
```

The application is then available at `http://localhost:3000`.

## Production Deployment

For production HTTPS deployment:

1. Run the container on localhost (as configured in docker-compose.yml)
2. Place a reverse proxy (like host Nginx or a load balancer) in front that handles:
   - HTTPS/TLS termination
   - Let’s Encrypt certificate management
   - Domain routing

Example host Nginx reverse proxy:

```nginx
server {
    listen 443 ssl http2;
    server_name example.com www.example.com;

    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Troubleshooting

Check container logs if the app is not responding:

```bash
docker-compose logs -f solesonic-llm-ui
```

Verify Nginx is running inside the container:

```bash
docker-compose exec solesonic-llm-ui nginx -t
```

Test that the app is accessible on localhost:

```bash
curl http://localhost:3000
```

## Environment Variables for Build

The Docker build process uses environment variables from `.env`:
- Vite variables (`VITE_*`) are used at build time to configure the React application
- Other variables are passed through docker-compose to the container environment
