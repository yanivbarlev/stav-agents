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

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: [
    'chrome-extension://*',
    'http://localhost:*',
    'https://www.familysearch.org'
  ],
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
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    groqConfigured: !!process.env.GROQ_API,
    neo4jConfigured: !!(process.env.NEO4J_URI && process.env.NEO4J_PASSWORD)
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

    // TODO: Implement Neo4j storage
    // For now, just log and return success
    const savedCount = persons.length;

    // Log to console for debugging
    persons.forEach((person: any, index: number) => {
      console.log(`  ${index + 1}. ${person.fullName} (${person.fsId})`);
    });

    res.json({
      success: true,
      savedCount,
      message: `Saved ${savedCount} persons`
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
 */
app.get('/api/persons', async (req, res) => {
  try {
    // TODO: Implement Neo4j query
    res.json({
      persons: [],
      total: 0
    });
  } catch (error) {
    console.error('[API] Error fetching persons:', error);
    res.status(500).json({
      error: 'Failed to fetch persons'
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

// ============================================================================
// SERVER STARTUP
// ============================================================================

app.listen(PORT, () => {
  console.log(`
====================================
  FamilySearch Extension API Server
====================================

  Server running on: http://localhost:${PORT}
  Health check:      http://localhost:${PORT}/health

  Endpoints:
    POST /api/variants  - Generate name variants from Hebrew
    POST /api/persons   - Save extracted persons
    GET  /api/persons   - Get saved persons

  Configuration:
    Groq API: ${process.env.GROQ_API ? 'Configured' : 'MISSING - check .env'}
    Neo4j:    ${process.env.NEO4J_URI ? 'Configured' : 'Not configured'}

====================================
`);
});

export default app;
