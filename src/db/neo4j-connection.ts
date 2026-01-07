/**
 * Neo4j Database Connection
 *
 * Singleton pattern for managing Neo4j driver connections.
 * Credentials loaded from .env file.
 */

import neo4j, { Driver, Session, auth } from 'neo4j-driver';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export class Neo4jConnection {
  private static instance: Neo4jConnection;
  private driver: Driver;
  private database: string;

  private constructor() {
    const uri = process.env.NEO4J_URI;
    const username = process.env.NEO4J_USERNAME || 'neo4j';
    const password = process.env.NEO4J_PASSWORD;
    this.database = process.env.NEO4J_DATABASE || 'neo4j';

    if (!uri) {
      throw new Error('NEO4J_URI is required in .env');
    }

    if (!password) {
      throw new Error('NEO4J_PASSWORD is required in .env');
    }

    this.driver = neo4j.driver(
      uri,
      auth.basic(username, password),
      {
        maxConnectionPoolSize: 50,
        connectionAcquisitionTimeout: 60000,
        // Disable certificate validation for Aura (uses self-signed certs)
        // encrypted: true handled automatically by neo4j+s:// scheme
      }
    );

    console.log(`[Neo4j] Configured for ${uri} (database: ${this.database})`);
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): Neo4jConnection {
    if (!Neo4jConnection.instance) {
      Neo4jConnection.instance = new Neo4jConnection();
    }
    return Neo4jConnection.instance;
  }

  /**
   * Get the raw Neo4j driver
   */
  public getDriver(): Driver {
    return this.driver;
  }

  /**
   * Get a new session for running queries
   * Always close sessions when done!
   */
  public getSession(database?: string): Session {
    return this.driver.session({
      database: database || this.database
    });
  }

  /**
   * Close the driver connection
   */
  public async close(): Promise<void> {
    await this.driver.close();
    console.log('[Neo4j] Connection closed');
  }

  /**
   * Verify database connectivity
   */
  public async verifyConnectivity(): Promise<void> {
    const session = this.getSession();
    try {
      const result = await session.run('RETURN 1 as test');
      if (result.records[0].get('test').toNumber() === 1) {
        console.log('[Neo4j] Connection verified successfully');
      }
    } catch (error) {
      console.error('[Neo4j] Connection verification failed:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Run the initial schema migration
   */
  public async runMigrations(): Promise<void> {
    const session = this.getSession();

    try {
      console.log('[Neo4j] Running schema migrations...');

      // Create constraints
      const constraints = [
        'CREATE CONSTRAINT person_id IF NOT EXISTS FOR (p:Person) REQUIRE p.personId IS UNIQUE',
        'CREATE CONSTRAINT source_id IF NOT EXISTS FOR (s:Source) REQUIRE s.sourceId IS UNIQUE',
        'CREATE CONSTRAINT event_id IF NOT EXISTS FOR (e:Event) REQUIRE e.eventId IS UNIQUE',
      ];

      for (const constraint of constraints) {
        try {
          await session.run(constraint);
        } catch (error: any) {
          // Ignore "already exists" errors
          if (!error.message?.includes('already exists')) {
            console.warn(`[Neo4j] Constraint warning: ${error.message}`);
          }
        }
      }

      // Create indexes
      const indexes = [
        'CREATE INDEX person_primary_name IF NOT EXISTS FOR (p:Person) ON (p.primaryName)',
        'CREATE INDEX person_birth_text IF NOT EXISTS FOR (p:Person) ON (p.birthDateText)',
        'CREATE INDEX person_hebrew_first IF NOT EXISTS FOR (p:Person) ON (p.hebrewFirstName)',
        'CREATE INDEX person_hebrew_last IF NOT EXISTS FOR (p:Person) ON (p.hebrewLastName)',
        'CREATE INDEX source_external IF NOT EXISTS FOR (s:Source) ON (s.sourceName, s.externalId)',
        'CREATE INDEX source_name IF NOT EXISTS FOR (s:Source) ON (s.sourceName)',
      ];

      for (const index of indexes) {
        try {
          await session.run(index);
        } catch (error: any) {
          if (!error.message?.includes('already exists')) {
            console.warn(`[Neo4j] Index warning: ${error.message}`);
          }
        }
      }

      console.log('[Neo4j] Schema migrations complete');

    } finally {
      await session.close();
    }
  }

  /**
   * Get database statistics
   */
  public async getStats(): Promise<{ persons: number; sources: number; relationships: number }> {
    const session = this.getSession();

    try {
      const result = await session.run(`
        MATCH (p:Person) WITH count(p) as persons
        MATCH (s:Source) WITH persons, count(s) as sources
        MATCH ()-[r]->() WITH persons, sources, count(r) as relationships
        RETURN persons, sources, relationships
      `);

      if (result.records.length > 0) {
        const record = result.records[0];
        return {
          persons: record.get('persons').toNumber(),
          sources: record.get('sources').toNumber(),
          relationships: record.get('relationships').toNumber(),
        };
      }

      return { persons: 0, sources: 0, relationships: 0 };

    } finally {
      await session.close();
    }
  }
}

// Export singleton instance
export const neo4jConnection = Neo4jConnection.getInstance();

// Export for testing/direct usage
export default Neo4jConnection;
