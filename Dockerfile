# Multi-stage build for React/Vite application served by Nginx (HTTP only).
# TLS is terminated by the host Nginx; this container serves static files on port 80.

# Build stage
FROM node:lts-slim AS build

WORKDIR /app

# Install dependencies (prefer npm ci when package-lock.json exists)
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm npm ci

# Copy source and build
COPY . .
RUN npm run build

# Runtime stage
FROM nginx:alpine

# Provides envsubst, used by 15-render-nginx-conf.sh below
RUN apk add --no-cache gettext

# Logs directory (optional, but matches your compose volume mount)
RUN mkdir -p /var/log/nginx

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

# nginx.conf is a template, not a finished config: 15-render-nginx-conf.sh fills in
# the CSP origins and writes /etc/nginx/conf.d/default.conf at container start.
# The template is kept out of /etc/nginx/templates/ so the stock envsubst entrypoint
# step ignores it and cannot overwrite that rendered output.
COPY nginx.conf /etc/nginx/default.conf.template
COPY docker/15-render-nginx-conf.sh /docker-entrypoint.d/15-render-nginx-conf.sh

# The nginx entrypoint silently skips files in /docker-entrypoint.d/ that are not
# executable, which would leave the stock welcome-page config in place.
RUN chmod 755 /docker-entrypoint.d/15-render-nginx-conf.sh

# Basic permissions
RUN chown -R nginx:nginx /usr/share/nginx/html /var/log/nginx && \
    chmod -R 755 /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]