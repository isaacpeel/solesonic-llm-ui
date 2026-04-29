# Nginx Configuration for Solesonic LLM UI

This guide explains how the app is served by Nginx within the Docker container.

## Overview

The container uses the official `nginx:alpine` image to serve the built React application.
- Nginx runs on port 80 within the container
- The built application files are located at `/usr/share/nginx/html`
- The container is configured to allow access on localhost:3000 by the host
- For production HTTPS, place a reverse proxy (like host Nginx) in front of the container

Relevant files:
- `nginx.conf` — Nginx configuration for the container
- `Dockerfile` — Multi-stage build that compiles React and configures Nginx
- `docker-compose.yml` — Compose configuration that exposes the container

## Nginx Configuration

The `nginx.conf` file handles:
- Static asset caching (7-day expiration for images, CSS, JS, fonts)
- SPA routing fallback to `index.html` for client-side routes
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
