# Use a lightweight Node.js image
FROM node:20-alpine AS builder

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY packages/rdp/package.json packages/rdp/package-lock.json* ./

# Install ALL dependencies (including devDependencies like typescript)
RUN npm install

# Copy source code and tsconfig
COPY packages/rdp/src ./src
COPY packages/rdp/tsconfig.json ./tsconfig.json

# Build the TypeScript code
RUN npm run build

# Remove development dependencies after build
RUN npm prune --production

# --- Production Stage ---
FROM node:20-alpine

WORKDIR /app

# Copy built code and node_modules from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY packages/rdp/package.json ./package.json

# Expose the API and WebSocket ports
EXPOSE 9090
EXPOSE 8081

# Command to run the application
CMD ["node", "dist/server.js"]