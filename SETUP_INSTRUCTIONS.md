# Playwright Authentication Setup Instructions

## Problem
Chrome locks its profile files (especially Cookies) while running, preventing Playwright from accessing them.

## Solution: One-Time Profile Copy

Follow these steps **once** to set up Playwright with your FamilySearch authentication:

### Step 1: Close Chrome
- Close all Chrome windows
- Check Task Manager to ensure no Chrome processes are running

### Step 2: Run the Setup Script
```bash
node playwright-auth-setup.js
```

This will:
- Copy your Chrome profile (including cookies/sessions) to `chrome-profile-copy/`
- Test navigation to FamilySearch
- Verify you stay logged in

### Step 3: Reopen Chrome
- You can now reopen Chrome and continue using it normally
- Playwright will use the copied profile independently

### Step 4: Verify Success
You should see:
```
✅ SUCCESS: Authenticated and viewing search results!
```

## Usage in Your Scripts

After setup, use the authenticated browser in your code:

```javascript
const { createAuthenticatedBrowserFromCopy } = require('./playwright-auth-setup');

async function myScript() {
  const context = await createAuthenticatedBrowserFromCopy();
  const page = await context.newPage();

  // Now you're authenticated!
  await page.goto('https://www.familysearch.org/...');

  // ... do your work ...

  await context.close();
}
```

## Updating the Copied Profile

If you log out or need to refresh the authentication:

1. Close Chrome
2. Delete the `chrome-profile-copy/` directory
3. Re-run `node playwright-auth-setup.js`

## Alternative: Use Main Profile (Requires Closing Chrome Each Time)

If you prefer not to use a copied profile, you can use the main profile directly, but you'll need to close Chrome before each run:

```javascript
const { createAuthenticatedBrowserFromMainProfile } = require('./playwright-auth-setup');

// Chrome must be closed!
const context = await createAuthenticatedBrowserFromMainProfile();
```

## Troubleshooting

### "EBUSY: resource busy or locked"
- Chrome is still running. Close all Chrome windows and try again.
- Check Task Manager for lingering chrome.exe processes.

### "Redirected to login page"
- The cookies weren't copied or have expired.
- Make sure you're logged into FamilySearch in Chrome first.
- Close Chrome completely and re-run the setup.

### "Target page has been closed"
- The profile directory is locked.
- Close Chrome and try again.

## Files Created

- `chrome-profile-copy/` - Your copied Chrome profile (do not commit to git!)
- `.gitignore` should include `chrome-profile-copy/`
