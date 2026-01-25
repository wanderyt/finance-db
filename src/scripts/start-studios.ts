import { studioManager } from '../services/studio-manager.service.js';
import { logger } from '../utils/logger.js';

/**
 * Start all Drizzle Studio instances and handle graceful shutdown
 */
async function main() {
  try {
    // Start all Studio instances
    await studioManager.startAll();

    // Register shutdown handlers
    const shutdown = async (signal: string) => {
      logger.info(`\nReceived ${signal}, shutting down gracefully...`);
      await studioManager.stopAll();
      process.exit(0);
    };

    // Handle various termination signals
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection:', reason);
      shutdown('unhandledRejection');
    });

    // Keep the process alive
    process.stdin.resume();
  } catch (error) {
    logger.error('Failed to start Studio instances:', error);
    process.exit(1);
  }
}

// Run the script
main();
