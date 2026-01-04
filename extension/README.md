# FamilySearch Hebrew Name Search Extension

Search FamilySearch with Hebrew names - automatically generates English spelling variants using AI.

## Quick Setup

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Start the Backend Server

```bash
npm run server
```

Keep this running. You should see:
```
Server running on: http://localhost:3000
```

### Step 3: Load the Extension in Chrome

1. Go to `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `extension` folder

### Step 4: Login to FamilySearch

1. Go to https://www.familysearch.org
2. Login to your account

## How to Use

### Method 1: Generate Variants & Search

1. Click the extension icon
2. Enter Hebrew names:
   - First Name: `קיטלין`
   - Last Name: `סמית`
   - Birth Year: `1945` (optional)
3. Click **"Generate Variants & Open Searches"**
4. The extension will:
   - Generate 5-10 English variants for each name
   - Open 3 search tabs with different variant combinations
5. Wait for tabs to load with results
6. On each tab, click the extension icon
7. Click **"Extract Results from Current Page"**
8. Results will be displayed and saved to Neo4j

### Method 2: Extract from Manual Search

1. Search manually on FamilySearch
2. When you have results, click the extension icon
3. Click **"Extract Results from Current Page"**
4. Results will be extracted and saved

## How It Works

```
User enters Hebrew names
         ↓
Backend generates English variants (Groq API)
         ↓
Extension opens search tabs with variants
         ↓
User clicks "Extract Results"
         ↓
Content script extracts person data from page
         ↓
Results saved to Neo4j (via backend API)
```

## Advantages

- ✅ Uses your existing Chrome with FamilySearch login
- ✅ No port 9222 / remote debugging needed
- ✅ No firewall issues
- ✅ No bot detection (uses your real browser)
- ✅ Simple, reliable extraction
- ✅ Deduplicates results by FamilySearch ID

## Troubleshooting

### "Backend offline" message

```bash
npm run server
```

### Extension not appearing

1. Enable Developer mode in chrome://extensions
2. Click "Load unpacked"
3. Select the `extension` folder

### Extract not working

1. Make sure you're on a FamilySearch search results page
2. Wait for results to fully load
3. Check browser console (F12) for errors

### No name variants generated

Check `.env` has `GROQ_API` key:
```
GROQ_API=your_key_here
```

## Files

```
extension/
├── manifest.json       # Extension config
├── popup/
│   ├── popup.html      # UI with Hebrew name input
│   ├── popup.css       # Styling
│   └── popup.js        # Popup logic
├── background/
│   └── background.js   # Service worker
└── content/
    └── familysearch.js # Extracts data from FS pages

src/
└── server.ts           # Express API (Groq + Neo4j)
```

## Development

To modify:
1. Edit files
2. Go to chrome://extensions
3. Click refresh icon on the extension
4. Test changes
