import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';

interface DatabaseConfig {
  id: string;
  name: string;
  file: string;
  port: number;
  description: string;
}

interface DatabasesConfig {
  databases: DatabaseConfig[];
  dbDirectory: string;
  studioHost: string;
}

function generateConfigs(): void {
  console.log('Generating Drizzle Studio configurations...\n');

  // Read databases configuration
  const configPath = resolve('./databases.config.json');
  if (!existsSync(configPath)) {
    console.error(`Error: Configuration file not found at ${configPath}`);
    process.exit(1);
  }

  const configContent = readFileSync(configPath, 'utf-8');
  const config: DatabasesConfig = JSON.parse(configContent);

  console.log(`Found ${config.databases.length} database(s) in configuration:\n`);

  // Create configs directory if it doesn't exist
  const configsDir = resolve('./configs');
  if (!existsSync(configsDir)) {
    mkdirSync(configsDir, { recursive: true });
    console.log(`Created configs directory: ${configsDir}\n`);
  }

  // Ensure db directory exists
  const dbDir = resolve(config.dbDirectory);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
    console.log(`Created database directory: ${dbDir}\n`);
  }

  // Generate config for each database
  for (const db of config.databases) {
    const dbPath = join(config.dbDirectory, db.file);
    const dbAbsolutePath = resolve(dbPath);

    // Check if database file exists, create it if not
    if (!existsSync(dbAbsolutePath)) {
      console.log(`⚠ Database file does not exist: ${dbPath}`);
      console.log(`  (It will be created when first accessed by Drizzle Studio)\n`);
    }

    // Generate Drizzle config
    const drizzleConfig = `import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: '${dbPath}',
  },
} satisfies Config;
`;

    const configFileName = `drizzle.${db.id}.config.ts`;
    const configFilePath = join(configsDir, configFileName);
    writeFileSync(configFilePath, drizzleConfig);

    console.log(`✓ Generated: ${configFileName}`);
    console.log(`  Database: ${db.name}`);
    console.log(`  File: ${dbPath}`);
    console.log(`  Port: ${db.port}\n`);
  }

  console.log('Configuration generation complete!');
}

// Run the generator
try {
  generateConfigs();
} catch (error) {
  console.error('Error generating configurations:', error);
  process.exit(1);
}
