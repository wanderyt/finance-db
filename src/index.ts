import { logger } from "./utils/logger.js";
import { db, rawDb } from "./config/database.js";
import { startBackupJob, stopBackupJob } from "./jobs/backup.job.js";
import * as schema from "./db/schema.js";
import { env } from "./config/env.js";

/**
 * Main application entry point
 */
async function main() {
  try {
    logger.info("=".repeat(60));
    logger.info("Starting finance-db service...");
    logger.info("=".repeat(60));

    // Log environment configuration
    logger.info(`Environment: ${env.NODE_ENV}`);
    logger.info(`Database: ${env.DATABASE_URL}`);
    logger.info(`Backup path: ${env.BACKUP_PATH}`);
    logger.info(`Backup schedule: ${env.BACKUP_SCHEDULE}`);
    logger.info(`Backup retention: ${env.BACKUP_RETENTION_DAYS} days`);

    // Test database connection
    logger.info("Testing database connection...");
    const result = db.select().from(schema.users).limit(1).all();
    logger.info(
      `Database connection successful (${result.length} user(s) found)`,
    );

    // Start backup scheduler
    logger.info("Initializing backup scheduler...");
    startBackupJob();
    logger.info("Backup scheduler initialized");

    // Log startup complete
    logger.info("=".repeat(60));
    logger.info("finance-db service is running");
    logger.info("=".repeat(60));
    logger.info("");
    logger.info("Available commands:");
    logger.info("  npm run db:studio      - Launch Drizzle Studio");
    logger.info("  npm run backup:now     - Create backup immediately");
    logger.info("  npm run backup:cleanup - Clean up old backups");
    logger.info("");
    logger.info("Press Ctrl+C to stop the service");
    logger.info("=".repeat(60));
  } catch (error) {
    logger.error("Failed to start finance-db service", error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 */
function shutdown(signal: string) {
  logger.info("");
  logger.info("=".repeat(60));
  logger.info(`Received ${signal}, shutting down gracefully...`);

  // Stop backup scheduler
  stopBackupJob();

  // Close database connection
  logger.info("Closing database connection...");
  rawDb.close();

  logger.info("Shutdown complete");
  logger.info("=".repeat(60));
  process.exit(0);
}

// Register shutdown handlers
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled promise rejection", { reason, promise });
  process.exit(1);
});

// Start the application
main();
