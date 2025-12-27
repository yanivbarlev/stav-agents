Start Task 1: Explore FamilySearch search page
Use Playwright to:

Navigate to https://www.familysearch.org/search/record/results?q.givenName=John&q.surname=Smith&q.birthLikeDate.from=1940&q.birthLikeDate.to=1950
Document:

What selectors identify each search result row
What data is visible in the result list (name, dates, location)
The URL pattern for clicking into a person's detail page
How pagination works (next button, infinite scroll, or page numbers)


Then click into one result and document:

The detail page URL structure
Where family relationships are displayed (parents, spouses, children)
What selectors extract each relationship


Output a summary of your findings so we can build the extraction logic.

Don't write the full tool yet — just explore and report back.