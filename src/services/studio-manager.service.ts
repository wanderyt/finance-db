import { spawn, ChildProcess } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { logger } from '../utils/logger.js';

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

interface StudioInstance {
  dbId: string;
  dbName: string;
  port: number;
  process: ChildProcess;
  status: 'starting' | 'running' | 'stopped' | 'error';
}

export class StudioManagerService {
  private instances: Map<string, StudioInstance> = new Map();
  private config: DatabasesConfig | null = null;

  /**
   * Load database configuration from file
   */
  private loadConfig(): DatabasesConfig {
    if (this.config) {
      return this.config;
    }

    const configPath = resolve('./databases.config.json');
    if (!existsSync(configPath)) {
      throw new Error(`Configuration file not found: ${configPath}`);
    }

    const configContent = readFileSync(configPath, 'utf-8');
    this.config = JSON.parse(configContent);
    return this.config;
  }

  /**
   * Start all Drizzle Studio instances
   */
  async startAll(): Promise<void> {
    const config = this.loadConfig();

    logger.info('Starting Drizzle Studio instances...\n');

    for (const db of config.databases) {
      await this.startInstance(db, config.studioHost);
    }

    logger.info('\nAll Studio instances started successfully!');
    this.printAccessInfo();
  }

  /**
   * Start a single Studio instance
   */
  private async startInstance(db: DatabaseConfig, host: string): Promise<void> {
    const configFile = `configs/drizzle.${db.id}.config.ts`;

    // Check if config file exists
    if (!existsSync(resolve(configFile))) {
      logger.error(`Config file not found: ${configFile}`);
      logger.error('Please run: npm run config:generate');
      throw new Error(`Missing config file for database: ${db.id}`);
    }

    logger.info(`Starting ${db.name} on port ${db.port}...`);

    // Spawn Drizzle Studio process
    const studioProcess = spawn(
      'npx',
      [
        'drizzle-kit',
        'studio',
        '--config',
        configFile,
        '--port',
        db.port.toString(),
        '--host',
        host,
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      }
    );

    // Store instance
    const instance: StudioInstance = {
      dbId: db.id,
      dbName: db.name,
      port: db.port,
      process: studioProcess,
      status: 'starting',
    };
    this.instances.set(db.id, instance);

    // Handle stdout
    studioProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString().trim();
      if (output) {
        logger.debug(`[${db.id}:${db.port}] ${output}`);

        // Check if Studio is ready
        if (output.includes('Drizzle Studio') || output.includes('Local:')) {
          instance.status = 'running';
          logger.info(`✓ ${db.name} is ready at https://local.drizzle.studio?port=${db.port}&host=${host}`);
        }
      }
    });

    // Handle stderr
    studioProcess.stderr?.on('data', (data: Buffer) => {
      const error = data.toString().trim();
      if (error && !error.includes('ExperimentalWarning')) {
        logger.error(`[${db.id}:${db.port}] ${error}`);
      }
    });

    // Handle process exit
    studioProcess.on('exit', (code, signal) => {
      if (code !== 0 && code !== null) {
        logger.error(`${db.name} exited with code ${code}`);
        instance.status = 'error';
      } else if (signal) {
        logger.info(`${db.name} was killed with signal ${signal}`);
        instance.status = 'stopped';
      } else {
        instance.status = 'stopped';
      }
    });

    // Handle process errors
    studioProcess.on('error', (error) => {
      logger.error(`Failed to start ${db.name}:`, error);
      instance.status = 'error';
    });

    // Wait a bit for the process to start
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  /**
   * Stop all Studio instances
   */
  async stopAll(): Promise<void> {
    logger.info('Stopping all Drizzle Studio instances...');

    for (const [dbId, instance] of this.instances) {
      try {
        if (instance.process && !instance.process.killed) {
          instance.process.kill('SIGTERM');
          logger.info(`Stopped ${instance.dbName}`);
        }
      } catch (error) {
        logger.error(`Error stopping ${instance.dbName}:`, error);
      }
    }

    this.instances.clear();
    logger.info('All Studio instances stopped');
  }

  /**
   * Restart a specific instance
   */
  async restartInstance(dbId: string): Promise<void> {
    const config = this.loadConfig();
    const dbConfig = config.databases.find((db) => db.id === dbId);

    if (!dbConfig) {
      throw new Error(`Database not found: ${dbId}`);
    }

    // Stop existing instance
    const instance = this.instances.get(dbId);
    if (instance && instance.process && !instance.process.killed) {
      instance.process.kill('SIGTERM');
      this.instances.delete(dbId);
    }

    // Start new instance
    await this.startInstance(dbConfig, config.studioHost);
  }

  /**
   * Get status of all instances
   */
  getStatus(): StudioInstance[] {
    return Array.from(this.instances.values());
  }

  /**
   * Print access information for all instances
   */
  private printAccessInfo(): void {
    const config = this.loadConfig();

    console.log('\n' + '='.repeat(60));
    console.log('Drizzle Studio Access Information');
    console.log('='.repeat(60) + '\n');

    for (const db of config.databases) {
      console.log(`  ${db.name}:`);
      console.log(`    URL: https://local.drizzle.studio?port=${db.port}&host=${config.studioHost}`);
      console.log(`    File: ${config.dbDirectory}/${db.file}`);
      console.log(`    Description: ${db.description}\n`);
    }

    console.log('='.repeat(60));
    console.log('Press Ctrl+C to stop all instances');
    console.log('='.repeat(60) + '\n');
  }
}

// Export singleton instance
export const studioManager = new StudioManagerService();
