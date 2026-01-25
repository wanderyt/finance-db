FROM node:20-alpine

WORKDIR /app

# Install build dependencies for better-sqlite3 native compilation
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies (including dev dependencies for build)
RUN npm ci

# Copy application code
COPY . .

# Build TypeScript (use npx to ensure binary is found)
RUN npx tsc

# Remove dev dependencies to reduce image size
RUN npm prune --production

# Create mount points for database and backups
RUN mkdir -p /app/db /app/backups

# Expose Drizzle Studio ports
EXPOSE 4983 4984

# Start application and Drizzle Studio
CMD ["npm", "run", "start:all"]
