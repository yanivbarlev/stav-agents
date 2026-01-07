/**
 * Date Utility Functions
 *
 * Functions for parsing and comparing genealogical dates.
 * Handles fuzzy dates like "About 1920", "1920-1925", "Before 1900".
 */

// ============================================================================
// DATE PARSING
// ============================================================================

/**
 * Parsed date result with uncertainty information
 */
export interface ParsedDate {
  year?: number;
  month?: number;
  day?: number;
  isApproximate: boolean;
  isRange: boolean;
  rangeStart?: number;
  rangeEnd?: number;
  original: string;
}

/**
 * Parse a date string into structured components
 * Handles various genealogical date formats:
 * - "1920" - exact year
 * - "About 1920", "Circa 1920", "c. 1920" - approximate
 * - "1920-1925" - range
 * - "Before 1920", "After 1920" - bounded
 * - "Jan 1920", "1 Jan 1920", "1920-01-01" - with month/day
 */
export function parseDate(dateStr: string): ParsedDate {
  if (!dateStr) {
    return { isApproximate: false, isRange: false, original: '' };
  }

  const original = dateStr.trim();
  let text = original.toLowerCase();

  const result: ParsedDate = {
    isApproximate: false,
    isRange: false,
    original,
  };

  // Check for approximate markers
  const approximatePatterns = [
    /^(about|circa|c\.|ca\.|abt\.?|approximately|around)\s*/i,
    /\s*(about|circa|c\.|ca\.|abt\.?|approximately|around)$/i,
  ];

  for (const pattern of approximatePatterns) {
    if (pattern.test(text)) {
      result.isApproximate = true;
      text = text.replace(pattern, '').trim();
    }
  }

  // Check for "before" or "after"
  if (/^before\s+/i.test(text)) {
    result.isApproximate = true;
    result.isRange = true;
    text = text.replace(/^before\s+/i, '');
    const year = extractYear(text);
    if (year) {
      result.rangeEnd = year;
      result.year = year - 10; // Estimate 10 years before
    }
    return result;
  }

  if (/^after\s+/i.test(text)) {
    result.isApproximate = true;
    result.isRange = true;
    text = text.replace(/^after\s+/i, '');
    const year = extractYear(text);
    if (year) {
      result.rangeStart = year;
      result.year = year + 10; // Estimate 10 years after
    }
    return result;
  }

  // Check for year range (1920-1925)
  const rangeMatch = text.match(/(\d{4})\s*[-–—to]\s*(\d{4})/);
  if (rangeMatch) {
    result.isRange = true;
    result.rangeStart = parseInt(rangeMatch[1], 10);
    result.rangeEnd = parseInt(rangeMatch[2], 10);
    result.year = Math.round((result.rangeStart + result.rangeEnd) / 2);
    result.isApproximate = true;
    return result;
  }

  // Try to parse ISO date (YYYY-MM-DD)
  const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    result.year = parseInt(isoMatch[1], 10);
    result.month = parseInt(isoMatch[2], 10);
    result.day = parseInt(isoMatch[3], 10);
    return result;
  }

  // Try to parse "1 Jan 1920" or "Jan 1920"
  const months: { [key: string]: number } = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
  };

  const monthDayYearMatch = text.match(/(\d{1,2})?\s*([a-z]+)\s+(\d{4})/i);
  if (monthDayYearMatch) {
    const monthName = monthDayYearMatch[2].toLowerCase();
    if (months[monthName]) {
      result.month = months[monthName];
      result.year = parseInt(monthDayYearMatch[3], 10);
      if (monthDayYearMatch[1]) {
        result.day = parseInt(monthDayYearMatch[1], 10);
      }
      return result;
    }
  }

  // Extract just the year
  const year = extractYear(text);
  if (year) {
    result.year = year;
  }

  return result;
}

/**
 * Extract year from a date string
 */
export function extractYear(dateStr: string): number | null {
  if (!dateStr) return null;

  // Look for 4-digit year
  const match = dateStr.match(/\b(1[0-9]{3}|20[0-2][0-9])\b/);
  if (match) {
    return parseInt(match[1], 10);
  }

  return null;
}

/**
 * Extract year from date text (convenience function)
 */
export function extractYearFromDate(dateText?: string): number | null {
  if (!dateText) return null;
  const parsed = parseDate(dateText);
  return parsed.year || null;
}

// ============================================================================
// DATE COMPARISON
// ============================================================================

/**
 * Calculate similarity between two dates (0-1)
 *
 * @param date1 First date string
 * @param date2 Second date string
 * @param yearTolerance Maximum year difference for partial match (default 2)
 * @returns Similarity score 0-1
 */
export function calculateDateSimilarity(
  date1?: string,
  date2?: string,
  yearTolerance: number = 2
): number {
  if (!date1 && !date2) return 1; // Both unknown = no conflict
  if (!date1 || !date2) return 0.5; // One unknown = neutral

  const parsed1 = parseDate(date1);
  const parsed2 = parseDate(date2);

  // If neither has a year, neutral
  if (!parsed1.year && !parsed2.year) return 0.5;

  // If only one has a year
  if (!parsed1.year || !parsed2.year) return 0.5;

  const yearDiff = Math.abs(parsed1.year - parsed2.year);

  // Handle ranges
  if (parsed1.isRange && parsed1.rangeStart && parsed1.rangeEnd) {
    // Check if date2's year falls within date1's range
    if (parsed2.year >= parsed1.rangeStart && parsed2.year <= parsed1.rangeEnd) {
      return 0.9;
    }
  }

  if (parsed2.isRange && parsed2.rangeStart && parsed2.rangeEnd) {
    // Check if date1's year falls within date2's range
    if (parsed1.year >= parsed2.rangeStart && parsed1.year <= parsed2.rangeEnd) {
      return 0.9;
    }
  }

  // Exact year match
  if (yearDiff === 0) {
    // Bonus for matching month/day
    if (parsed1.month && parsed2.month) {
      if (parsed1.month === parsed2.month) {
        if (parsed1.day && parsed2.day && parsed1.day === parsed2.day) {
          return 1.0; // Perfect match
        }
        return 0.98; // Same year and month
      }
    }
    return 0.95; // Same year
  }

  // Within tolerance
  if (yearDiff <= yearTolerance) {
    // Account for approximate dates being more forgiving
    const baseScore = 1 - (yearDiff / (yearTolerance * 2));
    const approximateBonus = (parsed1.isApproximate || parsed2.isApproximate) ? 0.1 : 0;
    return Math.min(0.9, baseScore + approximateBonus);
  }

  // Beyond tolerance but close
  if (yearDiff <= yearTolerance * 2) {
    return 0.7 - (yearDiff - yearTolerance) * 0.1;
  }

  if (yearDiff <= 10) {
    return 0.5 - (yearDiff - yearTolerance * 2) * 0.05;
  }

  // More than 10 years apart
  return Math.max(0, 0.3 - (yearDiff - 10) * 0.03);
}

/**
 * Check if two dates are compatible (could be the same event)
 */
export function areDatesCompatible(
  date1?: string,
  date2?: string,
  yearTolerance: number = 2
): boolean {
  return calculateDateSimilarity(date1, date2, yearTolerance) >= 0.7;
}

/**
 * Check if date1 is before date2
 */
export function isDateBefore(date1?: string, date2?: string): boolean | null {
  if (!date1 || !date2) return null;

  const year1 = extractYear(date1);
  const year2 = extractYear(date2);

  if (!year1 || !year2) return null;

  return year1 < year2;
}

// ============================================================================
// DATE FORMATTING
// ============================================================================

/**
 * Format a parsed date for display
 */
export function formatDate(parsed: ParsedDate): string {
  if (!parsed.year) return parsed.original || 'Unknown';

  let result = '';

  if (parsed.isRange && parsed.rangeStart && parsed.rangeEnd) {
    return `${parsed.rangeStart}-${parsed.rangeEnd}`;
  }

  if (parsed.day && parsed.month) {
    const monthNames = [
      '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    result = `${parsed.day} ${monthNames[parsed.month]} ${parsed.year}`;
  } else if (parsed.month) {
    const monthNames = [
      '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    result = `${monthNames[parsed.month]} ${parsed.year}`;
  } else {
    result = String(parsed.year);
  }

  if (parsed.isApproximate) {
    result = `About ${result}`;
  }

  return result;
}

/**
 * Get the best year estimate from a date string
 * For matching purposes
 */
export function getBestYearEstimate(dateStr?: string): number | null {
  if (!dateStr) return null;

  const parsed = parseDate(dateStr);

  if (parsed.year) return parsed.year;

  if (parsed.isRange && parsed.rangeStart && parsed.rangeEnd) {
    return Math.round((parsed.rangeStart + parsed.rangeEnd) / 2);
  }

  return null;
}
