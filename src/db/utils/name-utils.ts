/**
 * Name Utility Functions
 *
 * Functions for name comparison, normalization, and fuzzy matching.
 * Supports both Hebrew and English names.
 */

// ============================================================================
// NORMALIZATION
// ============================================================================

/**
 * Normalize a name for comparison
 * - Lowercase
 * - Remove diacritics
 * - Remove punctuation
 * - Trim whitespace
 */
export function normalizeName(name: string): string {
  if (!name) return '';

  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9\s\u0590-\u05FF]/g, '') // Keep letters, numbers, spaces, Hebrew
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Split a full name into first and last names
 */
export function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);

  if (parts.length === 0) {
    return { firstName: '', lastName: '' };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

// ============================================================================
// SIMILARITY ALGORITHMS
// ============================================================================

/**
 * Calculate Levenshtein distance between two strings
 * Returns the minimum number of single-character edits needed
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;

  // Create distance matrix
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  // Initialize first column
  for (let i = 0; i <= m; i++) {
    dp[i][0] = i;
  }

  // Initialize first row
  for (let j = 0; j <= n; j++) {
    dp[0][j] = j;
  }

  // Fill in the rest
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],     // Deletion
          dp[i][j - 1],     // Insertion
          dp[i - 1][j - 1]  // Substitution
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * Calculate Levenshtein similarity (0-1)
 * 1 = identical, 0 = completely different
 */
export function levenshteinSimilarity(str1: string, str2: string): number {
  if (!str1 && !str2) return 1;
  if (!str1 || !str2) return 0;

  const normalized1 = normalizeName(str1);
  const normalized2 = normalizeName(str2);

  if (normalized1 === normalized2) return 1;

  const maxLen = Math.max(normalized1.length, normalized2.length);
  if (maxLen === 0) return 1;

  const distance = levenshteinDistance(normalized1, normalized2);
  return 1 - distance / maxLen;
}

/**
 * Generate Soundex code for a name
 * Phonetic algorithm for encoding names by sound
 */
export function soundex(name: string): string {
  if (!name) return '';

  const normalized = normalizeName(name).replace(/[^a-z]/g, '');
  if (!normalized) return '';

  // Soundex encoding table
  const codes: { [key: string]: string } = {
    b: '1', f: '1', p: '1', v: '1',
    c: '2', g: '2', j: '2', k: '2', q: '2', s: '2', x: '2', z: '2',
    d: '3', t: '3',
    l: '4',
    m: '5', n: '5',
    r: '6',
  };

  // First letter
  let result = normalized[0].toUpperCase();
  let lastCode = codes[normalized[0]] || '';

  // Remaining letters
  for (let i = 1; i < normalized.length && result.length < 4; i++) {
    const code = codes[normalized[i]] || '';

    if (code && code !== lastCode) {
      result += code;
      lastCode = code;
    } else if (!code) {
      lastCode = ''; // Vowels reset the last code
    }
  }

  // Pad with zeros
  return (result + '000').slice(0, 4);
}

/**
 * Check if two names have matching Soundex codes
 */
export function soundexMatch(name1: string, name2: string): boolean {
  return soundex(name1) === soundex(name2);
}

/**
 * Generate Metaphone code for a name
 * More accurate phonetic encoding than Soundex
 */
export function metaphone(name: string): string {
  if (!name) return '';

  let str = normalizeName(name).replace(/[^a-z]/g, '').toUpperCase();
  if (!str) return '';

  let result = '';

  // Handle special first letter cases
  if (str.startsWith('KN') || str.startsWith('GN') || str.startsWith('PN') ||
      str.startsWith('AE') || str.startsWith('WR')) {
    str = str.slice(1);
  }

  if (str.startsWith('WH')) {
    str = 'W' + str.slice(2);
  }

  if (str.startsWith('X')) {
    str = 'S' + str.slice(1);
  }

  let i = 0;
  while (i < str.length) {
    const c = str[i];
    const next = str[i + 1] || '';
    const prev = str[i - 1] || '';

    // Skip duplicate adjacent letters except 'C'
    if (c === prev && c !== 'C') {
      i++;
      continue;
    }

    switch (c) {
      case 'A':
      case 'E':
      case 'I':
      case 'O':
      case 'U':
        // Only code vowel if at beginning
        if (i === 0) result += c;
        break;

      case 'B':
        // B is silent if at end after M
        if (!(i === str.length - 1 && prev === 'M')) {
          result += 'P';
        }
        break;

      case 'C':
        if (next === 'H') {
          result += 'X';
          i++;
        } else if (next === 'I' || next === 'E' || next === 'Y') {
          result += 'S';
        } else {
          result += 'K';
        }
        break;

      case 'D':
        if (next === 'G' && 'IEY'.includes(str[i + 2] || '')) {
          result += 'J';
          i += 2;
        } else {
          result += 'T';
        }
        break;

      case 'G':
        if (next === 'H' && !'AEIOUY'.includes(str[i + 2] || '')) {
          i++;
        } else if (next === 'N') {
          // GN at end is silent
          if (i !== str.length - 2) result += 'K';
        } else if ('IEY'.includes(next)) {
          result += 'J';
        } else {
          result += 'K';
        }
        break;

      case 'H':
        // H is silent after vowels or before consonants
        if ('AEIOUY'.includes(prev) || !'AEIOUY'.includes(next)) {
          // Silent
        } else {
          result += 'H';
        }
        break;

      case 'K':
        if (prev !== 'C') result += 'K';
        break;

      case 'P':
        if (next === 'H') {
          result += 'F';
          i++;
        } else {
          result += 'P';
        }
        break;

      case 'Q':
        result += 'K';
        break;

      case 'S':
        if (next === 'H') {
          result += 'X';
          i++;
        } else if (next === 'I' && (str[i + 2] === 'O' || str[i + 2] === 'A')) {
          result += 'X';
        } else {
          result += 'S';
        }
        break;

      case 'T':
        if (next === 'H') {
          result += '0'; // Theta
          i++;
        } else if (next === 'I' && (str[i + 2] === 'O' || str[i + 2] === 'A')) {
          result += 'X';
        } else {
          result += 'T';
        }
        break;

      case 'W':
      case 'Y':
        // W and Y are only coded if followed by vowel
        if ('AEIOUY'.includes(next)) {
          result += c;
        }
        break;

      case 'X':
        result += 'KS';
        break;

      case 'Z':
        result += 'S';
        break;

      case 'F':
      case 'J':
      case 'L':
      case 'M':
      case 'N':
      case 'R':
      case 'V':
        result += c;
        break;
    }

    i++;
  }

  return result;
}

/**
 * Check if two names have matching Metaphone codes
 */
export function metaphoneMatch(name1: string, name2: string): boolean {
  return metaphone(name1) === metaphone(name2);
}

// ============================================================================
// COMBINED NAME SIMILARITY
// ============================================================================

/**
 * Calculate overall name similarity using multiple algorithms
 *
 * @param name1 First name
 * @param name2 Second name
 * @returns Similarity score 0-1
 */
export function calculateNameSimilarity(name1: string, name2: string): number {
  if (!name1 && !name2) return 1;
  if (!name1 || !name2) return 0;

  // Exact match after normalization
  if (normalizeName(name1) === normalizeName(name2)) return 1;

  // Calculate component scores
  const levenshtein = levenshteinSimilarity(name1, name2);
  const soundexScore = soundexMatch(name1, name2) ? 1 : 0;
  const metaphoneScore = metaphoneMatch(name1, name2) ? 1 : 0;

  // Weighted average
  // Levenshtein is most precise, phonetic matches are backup
  return (levenshtein * 0.6) + (soundexScore * 0.2) + (metaphoneScore * 0.2);
}

/**
 * Calculate full name similarity (first + last)
 */
export function calculateFullNameSimilarity(
  fullName1: string,
  fullName2: string
): number {
  const { firstName: first1, lastName: last1 } = splitName(fullName1);
  const { firstName: first2, lastName: last2 } = splitName(fullName2);

  const firstSimilarity = calculateNameSimilarity(first1, first2);
  const lastSimilarity = calculateNameSimilarity(last1, last2);

  // Last name weighted slightly higher
  return (firstSimilarity * 0.45) + (lastSimilarity * 0.55);
}

// ============================================================================
// NAME VARIANT HELPERS
// ============================================================================

/**
 * Common Hebrew to English name mappings
 */
export const HEBREW_NAME_MAPPINGS: { [key: string]: string[] } = {
  'משה': ['Moses', 'Moshe', 'Moishe', 'Morris'],
  'יעקב': ['Jacob', 'Yaakov', 'Jack', 'James'],
  'אברהם': ['Abraham', 'Avraham', 'Abe'],
  'יצחק': ['Isaac', 'Yitzhak', 'Itzik'],
  'דוד': ['David', 'Dovid'],
  'שלמה': ['Solomon', 'Shlomo'],
  'שמואל': ['Samuel', 'Shmuel', 'Sam'],
  'יוסף': ['Joseph', 'Yosef', 'Joe'],
  'בנימין': ['Benjamin', 'Binyamin', 'Ben'],
  'שרה': ['Sarah', 'Sara'],
  'רבקה': ['Rebecca', 'Rivka'],
  'רחל': ['Rachel', 'Rochel'],
  'לאה': ['Leah', 'Lea'],
  'מרים': ['Miriam', 'Mary'],
  'חנה': ['Hannah', 'Chana', 'Anna'],
  'אסתר': ['Esther', 'Ester'],
  'דבורה': ['Deborah', 'Devorah'],
};

/**
 * Check if two names are known variants of each other
 */
export function areKnownVariants(name1: string, name2: string): boolean {
  const normalized1 = normalizeName(name1);
  const normalized2 = normalizeName(name2);

  // Check Hebrew mappings
  for (const [hebrew, englishVariants] of Object.entries(HEBREW_NAME_MAPPINGS)) {
    const allVariants = [hebrew, ...englishVariants].map(n => normalizeName(n));

    if (allVariants.includes(normalized1) && allVariants.includes(normalized2)) {
      return true;
    }
  }

  return false;
}
