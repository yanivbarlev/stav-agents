/**
 * URL building utilities for FamilySearch and MyHeritage search URLs
 */

// Source constants
export const SOURCES = {
  FAMILYSEARCH: 'FamilySearch',
  MYHERITAGE: 'MyHeritage'
};

/**
 * Build a FamilySearch search URL with given parameters
 * @param {string} firstName - First name to search
 * @param {string} lastName - Last name to search
 * @param {Object} searchParams - Additional search parameters
 * @param {string} [searchParams.spouseName] - Spouse's name
 * @param {string} [searchParams.fatherName] - Father's name
 * @param {string} [searchParams.motherName] - Mother's name
 * @param {number} [searchParams.birthYear] - Birth year
 * @param {number} [searchParams.birthYearRange] - Birth year range (+/-)
 * @param {number} [searchParams.deathYear] - Death year
 * @param {number} [searchParams.deathYearRange] - Death year range (+/-)
 * @param {string} [searchParams.birthPlace] - Birth place
 * @param {string} [searchParams.deathPlace] - Death place
 * @param {string} [searchParams.anyPlace] - Any place
 * @returns {string} Complete FamilySearch search URL
 */
export function buildSearchUrl(firstName, lastName, searchParams = {}) {
  const urlParams = new URLSearchParams();

  // Required name parameters
  urlParams.append('q.givenName', firstName);
  urlParams.append('q.surname', lastName);

  // Birth year with range
  if (searchParams.birthYear) {
    const range = searchParams.birthYearRange || 10;
    urlParams.append('q.birthLikeDate.from', String(searchParams.birthYear - range));
    urlParams.append('q.birthLikeDate.to', String(searchParams.birthYear + range));
  }

  // Death year with range
  if (searchParams.deathYear) {
    const range = searchParams.deathYearRange || 5;
    urlParams.append('q.deathLikeDate.from', String(searchParams.deathYear - range));
    urlParams.append('q.deathLikeDate.to', String(searchParams.deathYear + range));
  }

  // Places
  if (searchParams.birthPlace) {
    urlParams.append('q.birthLikePlace', searchParams.birthPlace);
  }

  if (searchParams.deathPlace) {
    urlParams.append('q.deathLikePlace', searchParams.deathPlace);
  }

  if (searchParams.anyPlace) {
    urlParams.append('q.anyPlace', searchParams.anyPlace);
  }

  // Family members
  if (searchParams.spouseName) {
    urlParams.append('q.spouseGivenName', searchParams.spouseName);
  }

  if (searchParams.fatherName) {
    urlParams.append('q.fatherGivenName', searchParams.fatherName);
  }

  if (searchParams.motherName) {
    urlParams.append('q.motherGivenName', searchParams.motherName);
  }

  const baseUrl = 'https://www.familysearch.org/en/search/record/results';
  return `${baseUrl}?${urlParams.toString()}`;
}

/**
 * Build a MyHeritage search URL with given parameters
 * @param {string} firstName - First name to search
 * @param {string} lastName - Last name to search
 * @param {Object} searchParams - Additional search parameters (not all supported by MyHeritage)
 * @returns {string} Complete MyHeritage search URL
 */
export function buildMyHeritageSearchUrl(firstName, lastName, searchParams = {}) {
  // MyHeritage uses a different URL format
  // Example: https://www.myheritage.co.il/research?formId=master&formMode=1&useTranslation=1&action=query&view_mode=card&qname=Name+fn.larry+fnmo.1+ln.levi+lnmsrs.false

  const urlParams = new URLSearchParams();

  // Fixed parameters
  urlParams.append('formId', 'master');
  urlParams.append('formMode', '1');
  urlParams.append('useTranslation', '1');
  urlParams.append('exactSearch', '');
  urlParams.append('p', '1');
  urlParams.append('action', 'query');
  urlParams.append('view_mode', 'card');

  // Build the qname parameter: Name fn.{firstName} fnmo.1 ln.{lastName} lnmsrs.false
  let qname = `Name fn.${firstName} fnmo.1 ln.${lastName} lnmsrs.false`;

  // Add birth year if specified
  if (searchParams.birthYear) {
    const range = searchParams.birthYearRange || 10;
    qname += ` bd.${searchParams.birthYear} bdmo.${range}`;
  }

  urlParams.append('qname', qname);

  const baseUrl = 'https://www.myheritage.co.il/research';
  return `${baseUrl}?${urlParams.toString()}`;
}

/**
 * Build all search URL permutations from selected variants for a single source
 * @param {Object} selectedVariants - Selected variants for each field
 * @param {string[]} selectedVariants.firstName - First name variants
 * @param {string[]} selectedVariants.lastName - Last name variants
 * @param {string[]} [selectedVariants.spouseName] - Spouse name variants
 * @param {string[]} [selectedVariants.fatherName] - Father name variants
 * @param {string[]} [selectedVariants.motherName] - Mother name variants
 * @param {Object} searchParams - Additional search parameters
 * @param {string} [source='FamilySearch'] - Source to build URLs for
 * @returns {Array<{url: string, source: string, firstName: string, lastName: string, spouseName: string|null, fatherName: string|null, motherName: string|null}>}
 */
export function buildSearchUrlPermutations(selectedVariants, searchParams, source = SOURCES.FAMILYSEARCH) {
  const searchUrls = [];

  // If no variants selected for optional fields, use [null] to iterate once
  const spouseVariants = selectedVariants.spouseName?.length > 0
    ? selectedVariants.spouseName
    : [null];
  const fatherVariants = selectedVariants.fatherName?.length > 0
    ? selectedVariants.fatherName
    : [null];
  const motherVariants = selectedVariants.motherName?.length > 0
    ? selectedVariants.motherName
    : [null];

  // Generate all permutations
  for (const firstName of selectedVariants.firstName) {
    for (const lastName of selectedVariants.lastName) {
      for (const spouseName of spouseVariants) {
        for (const fatherName of fatherVariants) {
          for (const motherName of motherVariants) {
            // Build search params with current variant combination
            const variantParams = { ...searchParams };
            if (spouseName) variantParams.spouseName = spouseName;
            if (fatherName) variantParams.fatherName = fatherName;
            if (motherName) variantParams.motherName = motherName;

            // Build URL based on source
            let url;
            if (source === SOURCES.MYHERITAGE) {
              url = buildMyHeritageSearchUrl(firstName, lastName, variantParams);
            } else {
              url = buildSearchUrl(firstName, lastName, variantParams);
            }

            searchUrls.push({
              url,
              source,
              firstName,
              lastName,
              spouseName,
              fatherName,
              motherName
            });
          }
        }
      }
    }
  }

  return searchUrls;
}

/**
 * Build search URL permutations for ALL sources (FamilySearch + MyHeritage)
 * @param {Object} selectedVariants - Selected variants for each field
 * @param {Object} searchParams - Additional search parameters
 * @param {string[]} [enabledSources] - Which sources to include (default: both)
 * @returns {Array<{url: string, source: string, firstName: string, lastName: string, ...}>}
 */
export function buildMultiSourceSearchUrls(selectedVariants, searchParams, enabledSources = [SOURCES.FAMILYSEARCH, SOURCES.MYHERITAGE]) {
  const allUrls = [];

  for (const source of enabledSources) {
    const sourceUrls = buildSearchUrlPermutations(selectedVariants, searchParams, source);
    allUrls.push(...sourceUrls);
  }

  return allUrls;
}
