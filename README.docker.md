# Docker Deployment for Solesonic LLM UI

This document describes how to deploy the Solesonic LLM UI React/Vite application using Docker and Nginx.

## Prerequisites

- Docker and Docker Compose installed on your server
- Let's Encrypt SSL certificates for your domain (example.com)
- Domain pointing to your server

## Files Overview

- `Dockerfile`: Multi-stage build that compiles the React application and serves it with Nginx
- `nginx.conf`: Nginx configuration with SSL and routing rules
- `docker-compose.yml`: Docker Compose configuration for easy deployment

## Deployment Steps

### 1. Ensure Let's Encrypt Certificates are Available

The Docker setup expects Let's Encrypt certificates to be available at `/etc/letsencrypt/live/your-domain/` on the host machine. Make sure these certificates are properly set up before deploying.

If you need to generate new certificates, you can use Certbot:

```bash
sudo apt-get update
sudo apt-get install certbot
sudo certbot certonly --standalone -d example.com -d www.example.com -d api.example.com
```

### 2. Configure Environment Variables

Copy the example environment file and update it with your own values:

```bash
cp .env.example .env
```

Edit the `.env` file to set your own values for:
- AWS Cognito User Pool IDs
- AWS Cognito Client IDs
- AWS Cognito Domain
- API and UI base URIs

### 3. Build and Start the Container

```bash
# Clone the repository (if not already done)
git clone <repository-url>
cd solesonic-llm-ui

# Build and start the container
docker-compose up -d
```

This will:
- Build the React application using your environment variables
- Configure Nginx with your SSL certificates
- Start the container in detached mode

### 4. Verify the Deployment

Visit your domain (https://example.com) to verify that the application is running correctly.

## SSL Certificate Renewal

Let's Encrypt certificates expire after 90 days. You'll need to renew them periodically. After renewal, you may need to restart the container to pick up the new certificates:

```bash
docker-compose restart
```

## Troubleshooting

### SSL Certificate Issues

If you encounter SSL certificate issues, verify that:
- The certificates exist at the expected path on the host
- The certificates have the correct permissions (readable by the Docker process)
- The domain names in the certificates match the server_name directives in nginx.conf

### Dependency Installation Issues

The Dockerfile uses `npm install` instead of `npm ci` to install dependencies. This is because:
- `npm ci` requires a package-lock.json file to be present
- `npm install` is more flexible and will work even if package-lock.json is missing
- If you prefer to use `npm ci` for more reproducible builds, ensure that package-lock.json is included in your repository

### Routing Issues

The Nginx configuration is set up to only allow access to the root path (/) and /settings path, plus static assets. If you need to allow additional paths, modify the nginx.conf file by adding new location blocks with exact path matching:

```nginx
# Example: Allow access to /about path
location = /about {
    try_files $uri $uri/ /index.html;
}
```

The current configuration uses a priority-based approach with location blocks:
1. Static assets (highest priority)
2. Root path (/)
3. Settings path (/settings)
4. All other paths (denied with 403)

### Docker Compose Volume Issues

If you encounter errors related to Docker Compose volume bindings (such as "KeyError: 'ContainerConfig'"), it may be due to compatibility issues between Docker and Docker Compose versions. The docker-compose.yml file uses the simpler volume binding syntax for better compatibility:

```yaml
volumes:
  - /etc/letsencrypt:/etc/letsencrypt:ro
```

This simpler syntax often works better with older versions of Docker Compose or when there are compatibility issues between Docker and Docker Compose.

To address the specific "KeyError: 'ContainerConfig'" error, the Dockerfile includes an explicit VOLUME instruction:

```dockerfile
# Add empty VOLUME instruction to fix 'ContainerConfig' KeyError
VOLUME /etc/letsencrypt
```

This ensures that Docker creates a proper mount point for this directory in the container, which prevents the 'ContainerConfig' KeyError during volume binding.

If you still encounter issues:
- Try using a different Docker Compose version
- Ensure that the source directory exists on the host machine
- Check that the Docker daemon has permission to access the source directory
- Make sure you have an explicit image name in your docker-compose.yml file

## Security Considerations

- The Let's Encrypt certificates are mounted as read-only
- Only necessary ports (80 and 443) are exposed
- The container runs with minimal privileges

## Customization

If you need to customize the deployment:
- Modify the nginx.conf file for routing and SSL settings
- Update the Dockerfile if you need to change the build process
- Adjust docker-compose.yml for container configuration
