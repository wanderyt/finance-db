FROM node:20-alpine

WORKDIR /app

# Install build dependencies for better-sqlite3 native compilation
RUN apk add --no-cache python3 make g++

# Enable Corepack for Yarn Berry support
RUN corepack enable

# Copy package files and Yarn configuration
COPY package.json yarn.lock .yarnrc.yml ./

# Install dependencies (including dev dependencies for build)
RUN yarn install --immutable

# Copy application code
COPY . .

# Build TypeScript
RUN yarn build

# Remove dev dependencies to reduce image size
RUN yarn workspaces focus --production 2>/dev/null || yarn install --production --immutable

# Create mount points for database and backups
RUN mkdir -p /app/db /app/backups

# Expose Drizzle Studio ports
EXPOSE 4983 4984

# Start application and Drizzle Studio
CMD ["yarn", "run", "start:all"]
