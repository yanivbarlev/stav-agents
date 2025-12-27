# FamilySearch Genealogy Extraction Agents

Automated tools for extracting genealogy data from FamilySearch, Ancestry, and MyHeritage using Playwright with persistent authentication.

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. One-Time Authentication Setup

**Important**: You must close Chrome for this step!

```bash
# Close all Chrome windows, then run:
npm run setup
```

This copies your Chrome profile (with FamilySearch cookies) to `chrome-profile-copy/`.

After setup completes, you can reopen Chrome - Playwright will use the copied profile independently.

### 3. Verify Authentication
The setup script automatically tests FamilySearch. You should see:
```
✅ SUCCESS: Authenticated and viewing search results!
```

**Tested Working URLs**:
- ✅ Family Tree Search: `https://www.familysearch.org/en/search/tree/name`
- ✅ Historic Records: `https://www.familysearch.org/en/search/record/results?[params]`
- ✅ Tree Search Results: `https://www.familysearch.org/en/search/tree/results?[params]`

## Usage

### In Your Code

```javascript
const { createAuthenticatedBrowserFromCopy } = require('./playwright-auth-setup');

async function extractFamilySearchData() {
  // Launch browser with your authentication
  const context = await createAuthenticatedBrowserFromCopy();
  const page = await context.newPage();

  // Navigate to FamilySearch (already authenticated!)
  await page.goto('https://www.familysearch.org/search/record/results?...');

  // Extract data...

  await context.close();
}

extractFamilySearchData();
```

### Available Functions

```javascript
// Option 1: Use copied profile (recommended - works even if Chrome is running)
const context = await createAuthenticatedBrowserFromCopy(headless = false);

// Option 2: Use main Chrome profile (requires Chrome to be closed)
const context = await createAuthenticatedBrowserFromMainProfile(headless = false);

// Option 3: Manually copy profile (if you need to refresh cookies)
await setupCopiedProfile();
```

## NPM Scripts

```bash
# Setup authentication (one-time, requires Chrome closed)
npm run setup

# Clean and re-setup (if authentication expires)
npm run setup:clean

# Test authentication
npm run test:auth
```

## Project Structure

```
stav-agents/
├── playwright-auth-setup.js    # Main authentication configuration
├── playwright-auth-config.js/ts # Alternative configs (legacy)
├── chrome-profile-copy/         # Copied Chrome profile (gitignored)
├── Documents/
│   ├── tasks.md                 # Task list
│   └── findings.md             # Research findings from exploration
├── SETUP_INSTRUCTIONS.md        # Detailed setup guide
└── README.md                    # This file
```

## Configuration

### Chrome Profile Location
**Windows**: `C:\Users\{User}\AppData\Local\Google\Chrome\User Data\Default`
**macOS**: `~/Library/Application Support/Google/Chrome/Default`
**Linux**: `~/.config/google-chrome/Default`

The setup script automatically detects your OS and finds the profile.

### Copied Profile Location
`./chrome-profile-copy/` (in this project directory)

## Troubleshooting

### "EBUSY: resource busy or locked"
Chrome is still running. Close all Chrome windows and check Task Manager for lingering processes.

### "Redirected to login page"
1. Make sure you're logged into FamilySearch in Chrome
2. Close Chrome completely
3. Run `npm run setup:clean`

### Profile is stale
If your cookies expire or you log out:
```bash
npm run setup:clean
```

### Need to use different Chrome profile
Edit `playwright-auth-setup.js` and change:
```javascript
const PROFILE_NAME = 'Default';  // Change to 'Profile 1', 'Profile 2', etc.
```

## Security Notes

- The `chrome-profile-copy/` directory contains your authentication cookies
- This directory is in `.gitignore` - **never commit it**
- Be careful sharing this project - the copied profile can access your accounts

## Research & Documentation

- See `Documents/findings.md` for detailed FamilySearch page structure analysis
- See `Documents/tasks.md` for project task list
- See `SETUP_INSTRUCTIONS.md` for detailed setup guide

## Next Steps

1. ✅ Playwright configured with Chrome profile authentication
2. ✅ FamilySearch page structure documented
3. 🔲 Implement FamilySearch data extraction tool
4. 🔲 Add Ancestry support
5. 🔲 Add MyHeritage support
6. 🔲 Build family tree graph database

## License

MIT
