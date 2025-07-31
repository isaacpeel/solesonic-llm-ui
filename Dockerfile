# Multi-stage build for React/Vite application with Nginx

# Build stage
FROM node:lts-slim AS build

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json ./
# Use npm install instead of npm ci to avoid requiring package-lock.json
RUN npm install

# Copy application source
COPY . .
COPY .env .env

# Build the application
RUN npm run build

# Production stage with Nginx
FROM nginx:alpine

# Install SSL dependencies
RUN apk add --no-cache openssl

# Create necessary directories
RUN mkdir -p /var/log/nginx
RUN mkdir -p /etc/letsencrypt

# Add VOLUME instructions
VOLUME /etc/letsencrypt
VOLUME /var/log/nginx

# Copy built files from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Set proper permissions
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html && \
    chown -R nginx:nginx /etc/nginx/conf.d && \
    chown -R nginx:nginx /var/log/nginx && \
    chmod 755 /etc/letsencrypt

# Expose ports
EXPOSE 80
EXPOSE 443

# Command to run
CMD ["nginx", "-g", "daemon off;"]