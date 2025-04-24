# Stage 1: Build the application using npm workspaces
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package.json and package-lock.json
COPY package.json package-lock.json* ./

# Copy backend package definition and frontend (needed for workspace install)
# We need frontend's package.json for npm ci to resolve the workspace correctly
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/
# If there are other packages backend depends on, copy their package.json too
# COPY packages/types/package.json ./packages/types/ # Example if types existed and was a package

# Install ALL workspace dependencies using the root lock file
# This ensures all dependencies are correctly installed according to the lock file
RUN npm ci

# Copy the rest of the source code needed for the backend build
COPY packages/backend/src ./packages/backend/src
COPY packages/backend/tsconfig.json ./packages/backend/

# Build only the backend package
# Use --workspace flag to specify which package to build
RUN npm run build --workspace=@nexus-terminal/backend

# Prune devDependencies for the entire workspace might be complex.
# Instead, we'll copy only the necessary production files in the next stage.


# Stage 2: Create the final production image
FROM node:20-alpine

# Install build dependencies needed for native addons like sqlite3 on Alpine
# python3, make, g++ are common requirements.
# We install them temporarily, run npm install, then remove them.
RUN apk add --no-cache --virtual .build-deps python3 make g++

WORKDIR /app

# Copy built backend code and package definitions from builder stage
COPY --from=builder /app/packages/backend/dist ./dist
COPY --from=builder /app/packages/backend/package.json ./package.json
# Copy the root lock file for consistent installs
COPY --from=builder /app/package-lock.json ./package-lock.json

# Install ONLY production dependencies. Native addons like sqlite3 should be rebuilt here.
# Removed --ignore-scripts to allow sqlite3's install script to run.
# Using --omit=dev is the modern equivalent of --production.
RUN npm install --omit=dev --prefer-offline

# Remove temporary build dependencies after npm install
RUN apk del .build-deps

# Expose the port the app runs on
EXPOSE 3001

# Define the command to run the application
CMD ["node", "dist/index.js"]

# Note: Environment variables like ENCRYPTION_KEY, SESSION_SECRET, and PORT
# should be provided when running the container.