# Multi-stage build for React/Vite application served by Nginx (HTTP only).
# TLS is terminated by the host Nginx; this container serves static files on port 80.

# Build stage
FROM node:lts-slim AS build

WORKDIR /app

# Install dependencies (prefer npm ci when package-lock.json exists)
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# Copy source and build
COPY . .
RUN npm run build

# Runtime stage
FROM nginx:alpine

# Needed for envsubst templating of /etc/nginx/templates/*.template in official nginx image
RUN apk add --no-cache gettext

# Logs directory (optional, but matches your compose volume mount)
RUN mkdir -p /var/log/nginx

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

# Provide Nginx config template for SPA/static serving
# (No TLS config here; host Nginx handles HTTPS)
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Basic permissions
RUN chown -R nginx:nginx /usr/share/nginx/html /var/log/nginx && \
    chmod -R 755 /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]