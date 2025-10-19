import { createApp } from '@/app.js';
import { loadConfig } from '@/config/env.js';

async function start() {
  try {
    // Load and validate configuration
    const config = loadConfig();

    // Create and configure the application
    const app = await createApp();

    // Start the server
    const address = await app.listen({
      port: config.PORT,
      host: '0.0.0.0',
    });

    app.log.info(
      {
        port: config.PORT,
        environment: config.NODE_ENV,
        maxBytes: config.MAX_BYTES,
        maxPixels: config.MAX_PIXELS,
      },
      `Server listening at ${address}`
    );

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      app.log.info(`Received ${signal}, shutting down gracefully...`);
      try {
        await app.close();
        process.exit(0);
      } catch (error) {
        app.log.error(
          { error: error instanceof Error ? error.message : String(error) },
          'Error during shutdown'
        );
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Only start if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  start().catch(error => {
    console.error('Unhandled error during startup:', error);
    process.exit(1);
  });
}
