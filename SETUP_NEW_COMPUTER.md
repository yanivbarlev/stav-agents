# Setup on New Computer

Follow these steps to run the FamilySearch extraction tool on a new computer.

---

## Prerequisites

- Node.js installed (v18 or higher)
- Chrome browser installed
- Git installed
- FamilySearch account (already logged in on original computer)

---

## Step-by-Step Setup

### 1. Clone the Repository

```bash
git clone https://github.com/yanivbarlev/stav-agents.git
cd stav-agents
```

### 2. Install Dependencies

```bash
npm install
```

This installs:
- Playwright with stealth plugin
- TypeScript
- All other dependencies

### 3. Install Playwright Chrome

```bash
npm run install:playwright
```

### 4. Log Into FamilySearch in Chrome

**IMPORTANT**: You must log into FamilySearch in your Chrome browser on this new computer.

1. Open Chrome
2. Go to https://www.familysearch.org
3. Click "Sign In"
4. Log in with your credentials
5. Verify you're logged in (see your account name in top right)

### 5. Close Chrome Completely

**CRITICAL**: Close ALL Chrome windows before running setup.

- Close all Chrome windows
- Check Task Manager to ensure no Chrome processes are running

### 6. Run Setup to Copy Profile

```bash
npm run setup:clean
```

This will:
- Copy your Chrome profile (with FamilySearch cookies)
- Create `chrome-profile-copy/` directory
- Test authentication
- Show success message if working

**Expected Output**:
```
✅ Profile copy complete (6 items copied)
✅ Successfully launched with copied profile (stealth enabled)
✅ SUCCESS: Authenticated and viewing search results!
```

### 7. Verify It Works

```bash
node test-simple-url.js
```

Should show:
```
✅ Success! Authenticated and on FamilySearch
Page Title: Search the Family Tree
```

---

## That's It!

You're now ready to run the extraction tools:

```bash
# Run the extraction test
npm run test:familysearch

# Debug any issues
npm run debug:familysearch
```

---

## Troubleshooting

### "Redirected to login page"

**Problem**: Cookies aren't working
**Solution**:
1. Make sure you're logged into FamilySearch in Chrome
2. Close Chrome completely
3. Run `npm run setup:clean` again

### "EBUSY: resource busy or locked"

**Problem**: Chrome is still running
**Solution**:
1. Close all Chrome windows
2. Open Task Manager (Ctrl+Shift+Esc)
3. End any chrome.exe processes
4. Try again

### "Incapsula incident ID"

**Problem**: Stealth plugin not loaded
**Solution**:
1. Delete `node_modules/`
2. Run `npm install` again
3. Verify playwright-extra is installed

### "Profile copy not found"

**Problem**: Setup hasn't been run yet
**Solution**: Run `npm run setup` (with Chrome closed)

---

## Important Notes

### Security

- ⚠️ **NEVER commit** the `chrome-profile-copy/` directory
- ⚠️ It contains your authentication cookies
- ⚠️ Already in `.gitignore` for protection

### Refreshing Cookies

If your session expires:
1. Log out and back in to FamilySearch in Chrome
2. Close Chrome
3. Run `npm run setup:clean`

### Multiple Computers

Each computer needs its own setup:
- Clone repo ✓
- Install dependencies ✓
- **Log into FamilySearch in Chrome** ✓
- Run setup to copy profile ✓

You **cannot** copy `chrome-profile-copy/` between computers - Chrome profiles are machine-specific.

---

## Quick Reference

```bash
# Fresh setup on new computer
git clone https://github.com/yanivbarlev/stav-agents.git
cd stav-agents
npm install
npm run install:playwright

# Log into FamilySearch in Chrome, then close Chrome

# Copy profile with cookies
npm run setup:clean

# Test it works
node test-simple-url.js

# Run extraction
npm run test:familysearch
```

---

## No .env File Needed!

This project uses **browser cookies** for authentication, not environment variables. The authentication happens through:

1. You log into FamilySearch in Chrome (normal browsing)
2. Setup script copies your Chrome cookies
3. Playwright uses those cookies to stay logged in

**Advantages**:
- No passwords stored in code
- No API keys needed
- Works exactly like using Chrome manually
- More secure than storing credentials

**Disadvantages**:
- Must run setup on each computer
- Cookies expire (need to refresh occasionally)
- Requires Chrome browser installed
