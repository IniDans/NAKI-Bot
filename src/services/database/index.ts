import { PrismaClient } from '@prisma/client';
import { appLogger } from '../../utils/logger.js';

class DatabaseService {
  private prisma: PrismaClient;
  private connected = false;

  constructor() {
    this.prisma = new PrismaClient({
      log: [
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    });

    this.prisma.$on('error' as never, (e: { message: string }) => {
      appLogger.error(`Database error: ${e.message}`, 'Database');
    });

    this.prisma.$on('warn' as never, (e: { message: string }) => {
      appLogger.warn(`Database warning: ${e.message}`, 'Database');
    });
  }

  /** Get the underlying Prisma client */
  get client(): PrismaClient {
    return this.prisma;
  }

  /** Connect to the database */
  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      await this.prisma.$connect();
      this.connected = true;
      appLogger.database('Connected to database');
    } catch (error) {
      appLogger.error('Failed to connect to database', 'Database', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /** Disconnect from the database */
  async disconnect(): Promise<void> {
    if (!this.connected) return;

    try {
      await this.prisma.$disconnect();
      this.connected = false;
      appLogger.database('Disconnected from database');
    } catch (error) {
      appLogger.error('Failed to disconnect from database', 'Database', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Check if the database is connected */
  isConnected(): boolean {
    return this.connected;
  }
}

// Singleton instance
export const db = new DatabaseService();
