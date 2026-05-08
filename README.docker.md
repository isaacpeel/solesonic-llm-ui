# Docker Deployment for Solesonic LLM UI

This document describes how to deploy the Solesonic LLM UI React/Vite application using Docker and Nginx.

## Prerequisites

- Docker and Docker Compose installed on your server
- Node.js and npm (for local building) or a pre-built container image
- For production HTTPS: a reverse proxy with SSL certificates (see README.nginx.md)

## Files Overview

- `Dockerfile` — Multi-stage build that compiles the React application and serves it with Nginx
- `nginx.conf` — Nginx configuration for routing and static asset handling
- `docker-compose.yml` — Docker Compose configuration for local deployment
- `README.nginx.md` — Detailed Nginx configuration guide

## Deployment Steps

### 1. Configure Environment Variables

Create a `.env` file in the project root with your configuration:

```bash
# Required: Backend API connection
VITE_API_BASE_URI=http://localhost:8080/api
VITE_UI_BASE_URI=http://localhost:3000

# Required: Keycloak authentication
VITE_KEYCLOAK_URL=http://localhost:8080
VITE_KEYCLOAK_REALM=solesonic
VITE_KEYCLOAK_CLIENT_ID=solesonic-ui

# Optional: Container timezone
TZ=UTC
```

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
