/**
 * Relevance Scoring Utility
 * Scores and sorts search results by how closely they match the searched name variants
 */

/**
 * Calculate Jaro-Winkler similarity between two strings
 * Returns a value between 0 (no similarity) and 1 (identical)
 * @param {string} s1 - First string
 * @param {string} s2 - Second string
 * @returns {number} Similarity score 0-1
 */
function jaroWinkler(s1, s2) {
  if (!s1 || !s2) return 0;

  s1 = s1.toLowerCase().trim();
  s2 = s2.toLowerCase().trim();

  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const matchWindow = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Find matches
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2.length);

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  // Count transpositions
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro = (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;

  // Winkler modification: boost for common prefix
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(s1.length, s2.length)); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * Calculate the best match score between a name and a list of variants
 * @param {string} name - The name to score (from search result)
 * @param {string[]} variants - List of searched variants
 * @returns {number} Best similarity score 0-1
 */
function bestMatchScore(name, variants) {
  if (!name || !variants || variants.length === 0) return 0;

  let bestScore = 0;
  for (const variant of variants) {
    const score = jaroWinkler(name, variant);
    if (score > bestScore) {
      bestScore = score;
    }
  }
  return bestScore;
}

/**
 * Extract first and last name from a full name
 * @param {string} fullName - Full name string
 * @returns {{firstName: string, lastName: string}}
 */
function parseFullName(fullName) {
  if (!fullName) return { firstName: '', lastName: '' };

  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };

  return {
    firstName: parts[0],
    lastName: parts[parts.length - 1]
  };
}

/**
 * Calculate relevance score for a person against searched variants
 * @param {Object} person - Person object with fullName, firstName, lastName
 * @param {Object} searchedVariants - Object with firstName and lastName arrays
 * @returns {number} Relevance score (0-100, higher is better match)
 */
export function calculateRelevanceScore(person, searchedVariants) {
  const { firstName: resultFirstName, lastName: resultLastName } = parseFullName(person.fullName);

  // Also try the explicit firstName/lastName if available
  const firstNameToCheck = person.firstName || resultFirstName;
  const lastNameToCheck = person.lastName || resultLastName;

  // Score first name match (0-1)
  const firstNameScore = bestMatchScore(firstNameToCheck, searchedVariants.firstName || []);

  // Score last name match (0-1) - weighted more heavily since last name is more important for identification
  const lastNameScore = bestMatchScore(lastNameToCheck, searchedVariants.lastName || []);

  // Bonus for matching the exact variant that was searched
  let exactMatchBonus = 0;
  if (person.matchedVariant) {
    const [matchedFirst, matchedLast] = person.matchedVariant.split(' ');
    const firstExact = jaroWinkler(firstNameToCheck, matchedFirst);
    const lastExact = jaroWinkler(lastNameToCheck, matchedLast);
    if (firstExact > 0.9 && lastExact > 0.9) {
      exactMatchBonus = 10;
    }
  }

  // Combined score: 40% first name, 60% last name (last name is more distinctive)
  // Scaled to 0-100
  const combinedScore = (firstNameScore * 40 + lastNameScore * 60) + exactMatchBonus;

  return Math.round(combinedScore * 100) / 100;
}

/**
 * Sort persons by relevance to searched variants
 * @param {Array} persons - Array of person objects
 * @param {Object} searchedVariants - Object with firstName and lastName arrays
 * @returns {Array} Sorted array (highest relevance first)
 */
export function sortByRelevance(persons, searchedVariants) {
  if (!persons || persons.length === 0) return persons;
  if (!searchedVariants) return persons;

  // Calculate scores for all persons
  const scoredPersons = persons.map(person => ({
    person,
    score: calculateRelevanceScore(person, searchedVariants)
  }));

  // Sort by score descending
  scoredPersons.sort((a, b) => b.score - a.score);

  // Log for debugging
  console.log('[RelevanceScoring] Sorted results:');
  scoredPersons.slice(0, 5).forEach(({ person, score }) => {
    console.log(`  ${score.toFixed(1)}: ${person.fullName} (matched: ${person.matchedVariant})`);
  });

  // Return sorted persons with score attached
  return scoredPersons.map(({ person, score }) => {
    person.relevanceScore = score;
    return person;
  });
}
