/**
 * Express API Server for FamilySearch Hebrew Name Search Extension
 *
 * Provides endpoints for:
 * - Generating name variants from Hebrew (using Groq API)
 * - Saving extracted persons to Neo4j
 * - Health check
 */

import express from 'express';
import cors from 'cors';
import Groq from 'groq-sdk';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import Neo4j components
import { neo4jConnection } from './db/neo4j-connection';
import { personService } from './db/services/person.service';
import { matchingService } from './db/services/matching.service';
import { mergeService } from './db/services/merge.service';
import { ExtractedPersonInput } from './db/models/person.model';

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware - CORS configuration for Chrome extension
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Allow chrome extensions
    if (origin.startsWith('chrome-extension://')) return callback(null, true);

    // Allow localhost
    if (origin.startsWith('http://localhost')) return callback(null, true);

    // Allow FamilySearch
    if (origin.includes('familysearch.org')) return callback(null, true);

    callback(null, true); // Allow all for development
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// Initialize Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API
});

// ============================================================================
// API ENDPOINTS
// ============================================================================

/**
 * Health check endpoint
 */
app.get('/health', async (req, res) => {
  let neo4jStatus = 'not configured';
  let stats = { persons: 0, sources: 0, relationships: 0 };

  if (process.env.NEO4J_URI && process.env.NEO4J_PASSWORD) {
    try {
      await neo4jConnection.verifyConnectivity();
      stats = await neo4jConnection.getStats();
      neo4jStatus = 'connected';
    } catch (error) {
      neo4jStatus = 'error: ' + (error instanceof Error ? error.message : 'unknown');
    }
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    groqConfigured: !!process.env.GROQ_API,
    neo4j: {
      status: neo4jStatus,
      stats
    }
  });
});

/**
 * Generate English name variants from Hebrew name
 * POST /api/variants
 * Body: { firstNameHebrew?: string, lastNameHebrew?: string }
 */
app.post('/api/variants', async (req, res) => {
  try {
    const { firstNameHebrew, lastNameHebrew } = req.body;

    if (!firstNameHebrew && !lastNameHebrew) {
      return res.status(400).json({
        error: 'At least one Hebrew name is required'
      });
    }

    const result: {
      firstNameVariants?: NameVariant[];
      lastNameVariants?: NameVariant[];
      firstNamePrimary?: string;
      lastNamePrimary?: string;
    } = {};

    // Generate first name variants
    if (firstNameHebrew) {
      const variants = await generateNameVariants(firstNameHebrew);
      result.firstNameVariants = variants.variants;
      result.firstNamePrimary = variants.primaryVariant;
    }

    // Generate last name variants
    if (lastNameHebrew) {
      const variants = await generateNameVariants(lastNameHebrew);
      result.lastNameVariants = variants.variants;
      result.lastNamePrimary = variants.primaryVariant;
    }

    console.log(`[API] Generated variants:`, result);
    res.json(result);

  } catch (error) {
    console.error('[API] Error generating variants:', error);
    res.status(500).json({
      error: 'Failed to generate name variants',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Save extracted persons to Neo4j
 * POST /api/persons
 * Body: { persons: ExtractedPerson[], searchParams: { firstNameHebrew?, lastNameHebrew? } }
 */
app.post('/api/persons', async (req, res) => {
  try {
    const { persons, searchParams } = req.body;

    if (!persons || !Array.isArray(persons)) {
      return res.status(400).json({
        error: 'persons array is required'
      });
    }

    console.log(`[API] Received ${persons.length} persons to save`);

    // Convert to ExtractedPersonInput format
    const extractedPersons: ExtractedPersonInput[] = persons.map((p: any) => ({
      fsId: p.fsId,
      fullName: p.fullName,
      firstName: p.firstName,
      lastName: p.lastName,
      hebrewFirstName: searchParams?.firstNameHebrew || p.hebrewFirstName,
      hebrewLastName: searchParams?.lastNameHebrew || p.hebrewLastName,
      birthDate: p.birthDate,
      birthPlace: p.birthPlace,
      deathDate: p.deathDate,
      deathPlace: p.deathPlace,
      sex: p.sex,
      sourceUrl: p.sourceUrl,
      collectionName: p.collectionName,
      searchedVariants: p.searchedVariants,
      matchedVariant: p.matchedVariant,
      extractedAt: p.extractedAt || new Date().toISOString(),
      parents: p.parents,
      children: p.children,
      siblings: p.siblings,
      spouses: p.spouses,
      events: p.events,
    }));

    // Save to Neo4j using person service
    const result = await personService.saveBulkExtractedPersons(extractedPersons, 'FamilySearch');

    console.log(`[API] Saved ${result.saved} persons, merged ${result.matched}, errors: ${result.errors}`);

    res.json({
      success: true,
      saved: result.saved,
      updated: result.updated,
      matched: result.matched,
      errors: result.errors,
      persons: result.persons.map(p => ({
        personId: p.personId,
        name: p.primaryName,
        birthDate: p.birthDateText,
        birthPlace: p.birthPlace,
      }))
    });

  } catch (error) {
    console.error('[API] Error saving persons:', error);
    res.status(500).json({
      error: 'Failed to save persons',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get saved persons from Neo4j
 * GET /api/persons
 * Query: ?name=, ?firstName=, ?lastName=, ?birthYear=, ?limit=
 */
app.get('/api/persons', async (req, res) => {
  try {
    const { name, firstName, lastName, birthYear, birthPlace, limit } = req.query;

    const persons = await personService.searchPersons({
      name: name as string,
      firstName: firstName as string,
      lastName: lastName as string,
      birthYear: birthYear ? parseInt(birthYear as string) : undefined,
      birthPlace: birthPlace as string,
      limit: limit ? parseInt(limit as string) : 50,
    });

    res.json({
      success: true,
      count: persons.length,
      persons: persons.map(p => ({
        personId: p.personId,
        name: p.primaryName,
        firstNames: p.firstNames,
        lastNames: p.lastNames,
        hebrewFirstName: p.hebrewFirstName,
        hebrewLastName: p.hebrewLastName,
        birthDate: p.birthDateText,
        birthPlace: p.birthPlace,
        deathDate: p.deathDateText,
        deathPlace: p.deathPlace,
        sex: p.sex,
        confidence: p.confidence,
      }))
    });

  } catch (error) {
    console.error('[API] Error fetching persons:', error);
    res.status(500).json({
      error: 'Failed to fetch persons',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get a specific person by ID with all relationships
 * GET /api/persons/:personId
 */
app.get('/api/persons/:personId', async (req, res) => {
  try {
    const { personId } = req.params;

    const person = await personService.getPersonById(personId);

    if (!person) {
      return res.status(404).json({
        error: 'Person not found'
      });
    }

    res.json({
      success: true,
      person
    });

  } catch (error) {
    console.error('[API] Error fetching person:', error);
    res.status(500).json({
      error: 'Failed to fetch person',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get immediate family of a person
 * GET /api/persons/:personId/family
 */
app.get('/api/persons/:personId/family', async (req, res) => {
  try {
    const { personId } = req.params;

    const family = await personService.getFamily(personId);

    if (!family) {
      return res.status(404).json({
        error: 'Person not found'
      });
    }

    res.json({
      success: true,
      ...family
    });

  } catch (error) {
    console.error('[API] Error fetching family:', error);
    res.status(500).json({
      error: 'Failed to fetch family',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Find potential matches for a person
 * POST /api/matching/find
 */
app.post('/api/matching/find', async (req, res) => {
  try {
    const { personId, useAllData = true, minConfidence = 0.7 } = req.body;

    if (!personId) {
      return res.status(400).json({
        error: 'personId is required'
      });
    }

    const person = await personService.getPersonById(personId);

    if (!person) {
      return res.status(404).json({
        error: 'Person not found'
      });
    }

    const matches = await matchingService.findMatches({
      person,
      useAllData,
      minConfidence,
    });

    res.json({
      success: true,
      personId,
      personName: person.primaryName,
      matchCount: matches.length,
      matches: matches.map(m => ({
        candidateId: m.candidateId,
        candidateName: m.candidate.primaryName,
        confidence: m.confidence,
        matchedOn: m.matchedOn.map(f => f.field),
        conflicts: m.conflictingFields.map(c => c.field),
        matchReason: m.matchReason,
      }))
    });

  } catch (error) {
    console.error('[API] Error finding matches:', error);
    res.status(500).json({
      error: 'Failed to find matches',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Manually merge two persons
 * POST /api/matching/merge
 */
app.post('/api/matching/merge', async (req, res) => {
  try {
    const { primaryPersonId, secondaryPersonId } = req.body;

    if (!primaryPersonId || !secondaryPersonId) {
      return res.status(400).json({
        error: 'primaryPersonId and secondaryPersonId are required'
      });
    }

    const result = await mergeService.mergePersons(primaryPersonId, secondaryPersonId);

    res.json({
      success: true,
      mergedPerson: {
        personId: result.mergedPerson.personId,
        name: result.mergedPerson.primaryName,
      },
      deletedPersonId: result.deletedPersonId,
      fieldsFromPrimary: result.fieldsFromPrimary,
      fieldsFromSecondary: result.fieldsFromSecondary,
      conflictsResolved: result.conflictsResolved.length,
    });

  } catch (error) {
    console.error('[API] Error merging persons:', error);
    res.status(500).json({
      error: 'Failed to merge persons',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Run deduplication across all records
 * POST /api/matching/deduplicate
 */
app.post('/api/matching/deduplicate', async (req, res) => {
  try {
    const { autoMerge = false, minConfidence = 0.7, mergeThreshold = 0.9 } = req.body;

    console.log('\n[API] Starting deduplication scan...');

    // Get all non-merged persons
    const allPersons = await personService.searchPersons({ limit: 500 });
    console.log(`[API] Found ${allPersons.length} persons to check`);

    const suggestions: any[] = [];
    const merged: any[] = [];
    const checked = new Set<string>();

    for (const person of allPersons) {
      if (checked.has(person.personId)) continue;

      console.log(`[API] Checking matches for: ${person.primaryName} (${person.personId})`);

      const matches = await matchingService.findMatches({
        person,
        useAllData: true,
        minConfidence,
        excludePersonIds: Array.from(checked),
      });

      console.log(`[API] Found ${matches.length} matches for ${person.primaryName}`);

      for (const match of matches) {
        if (checked.has(match.candidateId)) continue;

        const suggestion = {
          person1: { id: person.personId, name: person.primaryName },
          person2: { id: match.candidateId, name: match.candidate.primaryName },
          confidence: match.confidence,
          matchedOn: match.matchedOn.map(f => f.field),
          reason: match.matchReason,
        };

        if (autoMerge && match.confidence >= mergeThreshold) {
          try {
            await mergeService.mergePersons(person.personId, match.candidateId);
            merged.push(suggestion);
            checked.add(match.candidateId);
          } catch (err) {
            console.error(`[API] Failed to merge:`, err);
          }
        } else {
          suggestions.push(suggestion);
        }
      }

      checked.add(person.personId);
    }

    console.log(`[API] Deduplication complete: ${merged.length} merged, ${suggestions.length} suggestions`);

    res.json({
      success: true,
      totalChecked: allPersons.length,
      merged: merged.length,
      suggestions,
    });

  } catch (error) {
    console.error('[API] Error during deduplication:', error);
    res.status(500).json({
      error: 'Failed to run deduplication',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Delete a person by ID
 * DELETE /api/persons/:id
 */
app.delete('/api/persons/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const session = neo4jConnection.getSession();
    try {
      // Delete the person and all their relationships
      await session.run(`
        MATCH (p:Person {personId: $personId})
        DETACH DELETE p
      `, { personId: id });

      res.json({ success: true, deletedId: id });
    } finally {
      await session.close();
    }

  } catch (error) {
    console.error('[API] Error deleting person:', error);
    res.status(500).json({
      error: 'Failed to delete person',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Analyze person details using AI
 * POST /api/analyze-person
 * Body: { personName: string, rawPageText: string, source: string }
 */
app.post('/api/analyze-person', async (req, res) => {
  try {
    const { personName, rawPageText, source } = req.body;

    if (!personName || !rawPageText) {
      return res.status(400).json({
        error: 'personName and rawPageText are required'
      });
    }

    console.log(`[API] Analyzing details for: ${personName} (${source})`);

    const analysis = await analyzePersonDetails(personName, rawPageText, source);

    res.json({
      success: true,
      personName,
      analysis
    });

  } catch (error) {
    console.error('[API] Error analyzing person:', error);
    res.status(500).json({
      error: 'Failed to analyze person details',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get database statistics
 * GET /api/stats
 */
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await neo4jConnection.getStats();

    res.json({
      success: true,
      ...stats
    });

  } catch (error) {
    console.error('[API] Error fetching stats:', error);
    res.status(500).json({
      error: 'Failed to fetch stats',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

interface NameVariant {
  name: string;
  confidence: 'high' | 'medium' | 'low';
}

interface NameVariants {
  hebrew: string;
  variants: NameVariant[];
  primaryVariant: string;
}

/**
 * Generate English name variants from Hebrew using Groq API
 */
async function generateNameVariants(inputName: string): Promise<NameVariants> {
  const hebrewRegex = /[\u0590-\u05FF]/;
  const isHebrew = hebrewRegex.test(inputName);

  const prompt = isHebrew
    ? `You are a Hebrew to English name transliteration expert. Given the Hebrew name "${inputName}", generate 5-10 likely English spelling variants.

Consider:
1. Phonetic patterns (ק→K/C/Q, י→I/Y/E, ל→L, ת→T/TH, etc.)
2. Common American spellings of the name
3. Different transliteration conventions

Return ONLY a JSON object in this exact format (no markdown, no explanation):
{
  "variants": [
    {"name": "Spelling1", "confidence": "high"},
    {"name": "Spelling2", "confidence": "high"},
    {"name": "Spelling3", "confidence": "medium"},
    {"name": "Spelling4", "confidence": "medium"},
    {"name": "Spelling5", "confidence": "low"}
  ],
  "primaryVariant": "MostCommonSpelling"
}

Order variants from most plausible to least plausible.
Confidence levels: "high" (very common), "medium" (possible), "low" (rare but valid).
Include 5-10 variants total.`
    : `You are a name spelling variation expert. Given the English name "${inputName}", generate 5-10 common spelling variations and alternative forms.

Consider:
1. Common spelling variations (Catherine/Katherine/Kathryn, John/Jon, etc.)
2. Shortened forms (Elizabeth/Beth/Liz/Betty)
3. Formal vs informal versions (William/Will/Bill)
4. Historical or regional spellings

Return ONLY a JSON object in this exact format (no markdown, no explanation):
{
  "variants": [
    {"name": "${inputName}", "confidence": "high"},
    {"name": "Variation1", "confidence": "high"},
    {"name": "Variation2", "confidence": "medium"},
    {"name": "Variation3", "confidence": "medium"},
    {"name": "Variation4", "confidence": "low"}
  ],
  "primaryVariant": "${inputName}"
}

IMPORTANT: ALWAYS include the original spelling "${inputName}" as the first variant with high confidence.
Order other variants from most common to least common.
Confidence levels: "high" (very common), "medium" (possible), "low" (rare but valid).
Include 5-10 variants total including the original.`;

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: "json_object" }
    });

    const responseContent = completion.choices[0]?.message?.content;

    if (!responseContent) {
      throw new Error('No response from Groq API');
    }

    const parsed = JSON.parse(responseContent);

    // Handle both old format (string[]) and new format (NameVariant[])
    let variants: NameVariant[];
    if (parsed.variants && Array.isArray(parsed.variants)) {
      if (typeof parsed.variants[0] === 'string') {
        // Old format - convert to new format
        variants = parsed.variants.map((v: string, i: number) => ({
          name: v,
          confidence: i < 2 ? 'high' : i < 5 ? 'medium' : 'low'
        }));
      } else {
        // New format
        variants = parsed.variants;
      }
    } else {
      variants = [];
    }

    return {
      hebrew: inputName,
      variants,
      primaryVariant: parsed.primaryVariant || variants[0]?.name || inputName
    };

  } catch (error) {
    console.error('[API] Error calling Groq:', error);
    // Fallback: return the input name as-is
    return {
      hebrew: inputName,
      variants: [{ name: inputName, confidence: 'high' }],
      primaryVariant: inputName
    };
  }
}

/**
 * Analysis result interface
 */
interface PersonAnalysis {
  spouseName?: string;
  spouseRelationship?: string;
  addresses: Array<{ year?: string; address: string }>;
  occupations: Array<{ year?: string; occupation: string }>;
  alternativeNames: string[];
  additionalFacts: string[];
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Analyze person details from raw page text using Groq API
 */
async function analyzePersonDetails(
  personName: string,
  rawPageText: string,
  source: string
): Promise<PersonAnalysis> {
  const prompt = `You are an expert genealogist analyzing a historical record. Extract biographical information about "${personName}" from the following ${source} record.

TEXT FROM RECORD:
${rawPageText.slice(0, 8000)}

Extract the following information about ${personName} (NOT about other people mentioned):

1. SPOUSE: If married, what is the spouse's name?
2. ADDRESSES: Any addresses or locations where they lived, with years if available
3. OCCUPATIONS: Any jobs or professions mentioned, with years if available
4. ALTERNATIVE NAMES: Any nicknames, maiden names, or spelling variations
5. ADDITIONAL FACTS: Other important biographical details (immigration, military service, etc.)

IMPORTANT:
- Only extract information that CLEARLY refers to ${personName}
- Include the YEAR for addresses/occupations when available
- Be specific with addresses (city, state, street if available)
- If information is uncertain, don't include it

Return ONLY a JSON object in this exact format (no markdown, no explanation):
{
  "spouseName": "spouse's full name or null if not found",
  "spouseRelationship": "wife" or "husband" or null,
  "addresses": [
    {"year": "1928", "address": "San Francisco, California"},
    {"year": "1935", "address": "123 Main St, Los Angeles, CA"}
  ],
  "occupations": [
    {"year": "1920", "occupation": "tailor"},
    {"year": "1930", "occupation": "shop owner"}
  ],
  "alternativeNames": ["nickname1", "maiden name"],
  "additionalFacts": [
    "Immigrated from Poland in 1905",
    "Naturalized citizen in 1912"
  ],
  "confidence": "high"
}

If no information is found for a field, use empty arrays [] or null.
Confidence should be "high" if data is clear, "medium" if somewhat ambiguous, "low" if uncertain.`;

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.2,
      max_tokens: 1000,
      response_format: { type: "json_object" }
    });

    const responseContent = completion.choices[0]?.message?.content;

    if (!responseContent) {
      throw new Error('No response from Groq API');
    }

    const parsed = JSON.parse(responseContent);

    // Normalize the response
    const analysis: PersonAnalysis = {
      spouseName: parsed.spouseName || undefined,
      spouseRelationship: parsed.spouseRelationship || undefined,
      addresses: Array.isArray(parsed.addresses) ? parsed.addresses : [],
      occupations: Array.isArray(parsed.occupations) ? parsed.occupations : [],
      alternativeNames: Array.isArray(parsed.alternativeNames) ? parsed.alternativeNames : [],
      additionalFacts: Array.isArray(parsed.additionalFacts) ? parsed.additionalFacts : [],
      confidence: parsed.confidence || 'medium'
    };

    console.log(`[API] Analysis for ${personName}:`, JSON.stringify(analysis, null, 2));
    return analysis;

  } catch (error) {
    console.error('[API] Error analyzing person:', error);
    // Return empty analysis on error
    return {
      addresses: [],
      occupations: [],
      alternativeNames: [],
      additionalFacts: [],
      confidence: 'low'
    };
  }
}

// ============================================================================
// SERVER STARTUP
// ============================================================================

async function startServer() {
  console.log('\n[Server] Starting FamilySearch Extension API Server...\n');

  // Initialize Neo4j connection
  if (process.env.NEO4J_URI && process.env.NEO4J_PASSWORD) {
    try {
      console.log('[Server] Connecting to Neo4j...');
      await neo4jConnection.verifyConnectivity();

      console.log('[Server] Running database migrations...');
      await neo4jConnection.runMigrations();

      const stats = await neo4jConnection.getStats();
      console.log(`[Server] Database ready: ${stats.persons} persons, ${stats.sources} sources, ${stats.relationships} relationships\n`);
    } catch (error) {
      console.error('[Server] Neo4j initialization failed:', error);
      console.log('[Server] Continuing without Neo4j - some features will be disabled\n');
    }
  } else {
    console.log('[Server] Neo4j not configured - database features disabled\n');
  }

  // Start Express server
  app.listen(PORT, () => {
    console.log(`
====================================
  FamilySearch Extension API Server
====================================

  Server running on: http://localhost:${PORT}
  Health check:      http://localhost:${PORT}/health

  Endpoints:
    POST /api/variants        - Generate name variants from Hebrew
    POST /api/persons         - Save extracted persons
    GET  /api/persons         - Search saved persons
    GET  /api/persons/:id     - Get person with relationships
    GET  /api/persons/:id/family - Get immediate family
    POST /api/matching/find   - Find potential duplicates
    POST /api/matching/merge  - Merge duplicate persons
    GET  /api/stats           - Get database statistics

  Configuration:
    Groq API: ${process.env.GROQ_API ? 'Configured' : 'MISSING - check .env'}
    Neo4j:    ${process.env.NEO4J_URI ? 'Configured' : 'Not configured'}

====================================
`);
  });
}

// Start the server
startServer().catch(console.error);

export default app;
