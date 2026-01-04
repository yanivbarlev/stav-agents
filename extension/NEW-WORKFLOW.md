# New Variant Selection Workflow

## What Changed:

You now have full control over which name variants to search!

## New Workflow:

### Step 1: Enter Search Criteria
- Fill in Hebrew names (and/or English if you're sure)
- Add any additional criteria (birth year, places, family names, etc.)
- Click **"Generate Name Variants"**

### Step 2: Review & Select Variants
- Extension shows 5-10 variants for each Hebrew field
- Variants are ordered by plausibility (high → medium → low confidence)
- **Top 3 are auto-selected** - you can check/uncheck any
- See **total search count** update in real-time
- ⚠️ Warning if >20 searches

### Step 3: Search
- Click **"Search Selected Combinations"**
- Opens one tab per combination
- Automatically extracts from all tabs
- Deduplicates by FamilySearch ID
- Shows which variants matched each person

## Key Features:

✅ **Confidence scores** - LLM rates each variant's plausibility
✅ **Auto-select top 3** - smart defaults, fully customizable
✅ **Real-time count** - see total searches before running
✅ **Multi-field variants** - handles spouse, parents too
✅ **Exact matches** - English names used as-is (no variants)

## Example:

**Input:**
- First Name: `קיטלין` (Hebrew)
- Last Name: `Smith` (English - exact match)
- Father: `אברהם` (Hebrew)

**Variants Generated:**
- First Name: ✅ Kaitlin (high), ✅ Caitlin (high), ✅ Katelyn (high), ⬜ Kaitlyn (medium), ⬜ Caitlyn (low)
- Last Name: ✅ Smith (exact - only one)
- Father: ✅ Abraham (high), ✅ Avraham (high), ⬜ Abram (medium)

**Total:** 3 first × 1 last = **3 searches**

## Status:

⚠️ **Backend needs restart** - Updated Groq prompt for confidence scores
⚠️ **Extension incomplete** - performSearch function needs final fixes

Run `npm run server` to restart backend with new variant format.

Then I'll complete the search function updates.
