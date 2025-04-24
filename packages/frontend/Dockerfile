# Stage 1: Build the frontend application using npm workspaces
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package.json and package-lock.json
COPY package.json package-lock.json* ./

# Copy frontend package definition and backend (needed for workspace install)
# We need backend's package.json for npm ci to resolve the workspace correctly
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/backend/package.json ./packages/backend/
# If there are other packages frontend depends on, copy their package.json too

# Install ALL workspace dependencies using the root lock file
RUN npm ci

# Copy the rest of the frontend source code needed for the build
COPY packages/frontend/src ./packages/frontend/src
COPY packages/frontend/index.html ./packages/frontend/
COPY packages/frontend/tsconfig.json ./packages/frontend/
COPY packages/frontend/vite.config.ts ./packages/frontend/
# Assuming postcss.config.js exists at the root or frontend level if needed
# COPY postcss.config.js ./ # Or ./packages/frontend/ if it's there

# Build only the frontend package
RUN npm run build --workspace=@nexus-terminal/frontend

# Stage 2: Serve the static files with Nginx
FROM nginx:stable-alpine

# Remove default Nginx welcome page
RUN rm -rf /usr/share/nginx/html/*

# Copy built assets from builder stage to Nginx html directory
COPY --from=builder /app/packages/frontend/dist /usr/share/nginx/html

# Copy custom Nginx configuration
# This file needs to be present in the build context (project root)
# We created it in packages/frontend/, so adjust the COPY source path
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]