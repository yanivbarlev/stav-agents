/**
 * Neo4j Utility Functions
 *
 * Shared utilities for Neo4j operations including node conversion
 * and session management.
 */

import { Session } from 'neo4j-driver';
import { neo4jConnection } from '../neo4j-connection';
import { PersonNode } from '../models/person.model';

/**
 * Convert a Neo4j node to PersonNode interface
 *
 * Shared utility used by both PersonRepository and MatchingService
 * to ensure consistent node conversion across the codebase.
 */
export function nodeToPersonNode(node: any): PersonNode {
  const props = node.properties;

  return {
    personId: props.personId,
    primaryName: props.primaryName,
    firstNames: props.firstNames || [],
    lastNames: props.lastNames || [],
    hebrewFirstName: props.hebrewFirstName || undefined,
    hebrewLastName: props.hebrewLastName || undefined,
    birthDateText: props.birthDateText || undefined,
    birthPlace: props.birthPlace || undefined,
    deathDateText: props.deathDateText || undefined,
    deathPlace: props.deathPlace || undefined,
    sex: props.sex || undefined,
    createdAt: props.createdAt ? new Date(props.createdAt) : new Date(),
    updatedAt: props.updatedAt ? new Date(props.updatedAt) : new Date(),
    confidence: typeof props.confidence === 'number' ? props.confidence : 0.7,
    notes: props.notes || undefined,
    merged: props.merged || false,
    mergedInto: props.mergedInto || undefined,
  };
}

/**
 * Execute a callback within a managed Neo4j session
 *
 * Automatically handles session creation and cleanup.
 *
 * @param callback - Async function that receives the session
 * @returns Result from the callback
 */
export async function withSession<T>(
  callback: (session: Session) => Promise<T>
): Promise<T> {
  const session = neo4jConnection.getSession();
  try {
    return await callback(session);
  } finally {
    await session.close();
  }
}

/**
 * Format error message from unknown error type
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown error';
}
