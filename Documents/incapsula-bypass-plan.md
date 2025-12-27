# Incapsula Bot Detection Bypass - Implementation Plan

**Date**: 2025-12-26
**Issue**: FamilySearch extraction tool blocked by Incapsula
**Solution**: Playwright Stealth Plugin (playwright-extra)

---

## Problem

FamilySearch uses Incapsula WAF that detects and blocks automated Playwright browsers:
```
Request unsuccessful. Incapsula incident ID: 820000530213780655-467333523220729163
```

---

## Solution: Playwright Stealth Plugin

**Expected Success Rate**: 50-65% against Incapsula
**Implementation Time**: ~2.5 hours
**Cost**: $0 (no additional services)

### Why This Approach?

✅ Works with existing Chrome profile authentication
✅ Maintains full browser control for extraction
✅ No compliance approval required
✅ Higher success than vanilla Playwright (20-30%)
✅ Can be enhanced with proxies if needed

### Alternatives Considered

- **Bright Data**: 85-95% success but requires compliance approval for authenticated sessions (uncertain)
- **Standard MCP Playwright**: Only 20-30% success (too low)

---

## Implementation Steps

### Step 1: Install Dependencies

```bash
npm install playwright-extra puppeteer-extra-plugin-stealth
npm install --save-dev @types/puppeteer-extra-plugin-stealth
```

### Step 2: Update Authentication Setup

**File**: `playwright-auth-setup.js`

Changes:
1. Replace `playwright` with `playwright-extra`
2. Add stealth plugin
3. Add anti-detection browser arguments
4. Set realistic user agent

### Step 3: Add Anti-Detection to Extraction Tool

**File**: `src/tools/familysearch.ts`

Changes:
1. Set extra HTTP headers (Sec-Fetch-*, Accept-Language, etc.)
2. Mask `navigator.webdriver` property
3. Add randomized delays (2-5 seconds)
4. Increase wait times between requests

### Step 4: Update Type Definitions

**File**: `playwright-auth-setup.d.ts`

Update to reflect playwright-extra types

### Step 5: Test Implementation

Run debug script to verify:
```bash
npm run debug:familysearch
```

Expected: No Incapsula error, search results load successfully

---

## Anti-Detection Techniques Applied

### 1. Stealth Plugin
- Removes `navigator.webdriver` flag
- Masks browser automation indicators
- Spoofs browser fingerprints (WebGL, Canvas, Fonts)
- Mimics real browser behavior

### 2. Browser Arguments
```javascript
args: [
  '--disable-blink-features=AutomationControlled',
  '--disable-dev-shm-usage',
  '--no-sandbox'
]
```

### 3. Realistic Headers
```
Sec-Fetch-Dest: document
Sec-Fetch-Mode: navigate
Sec-Fetch-Site: none
Accept-Language: en-US,en;q=0.9
```

### 4. Human-Like Timing
- Random delay variance (±20%)
- 2-5 second delays between requests
- Avoid predictable patterns

### 5. Navigator Property Masking
```javascript
Object.defineProperty(navigator, 'webdriver', {
  get: () => undefined
});
```

---

## Optional Enhancements (If Initial Success < 50%)

### Enhancement 1: Residential Proxies
Use rotating residential IPs to avoid datacenter IP detection:
- Bright Data Residential Proxies
- Smartproxy
- Oxylabs

Cost: $50-200/month

### Enhancement 2: Browser Profile Rotation
Rotate between multiple browser profiles to avoid fingerprint tracking

### Enhancement 3: Request Header Ordering
Ensure headers are in correct order matching real Chrome browser

---

## Success Criteria

✅ No Incapsula error messages
✅ Search results table loads
✅ Can extract person details from detail pages
✅ Test completes with 5 results
✅ Authentication remains functional

---

## Files Modified

1. **playwright-auth-setup.js** (~20 lines)
2. **src/tools/familysearch.ts** (~40 lines)
3. **package.json** (2 dependencies)
4. **playwright-auth-setup.d.ts** (minor update)

---

## Testing Strategy

### Test 1: Debug Script
```bash
npm run debug:familysearch
```
Verify: Page loads, no Incapsula error

### Test 2: Single Person Extraction
Extract one person's details to verify detail page access

### Test 3: Full Search
```bash
npm run test:familysearch
```
Extract 5 persons to verify pagination and full workflow

---

## Rollback Plan

If implementation breaks existing functionality:
```bash
npm uninstall playwright-extra puppeteer-extra-plugin-stealth
git checkout playwright-auth-setup.js src/tools/familysearch.ts
npm install
```

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Success rate < 40% | Medium | High | Add residential proxies |
| Breaks authentication | Low | High | Test auth first, rollback plan ready |
| Incapsula updates detection | Medium | Medium | Monitor, update stealth plugin regularly |
| Performance degradation | Low | Low | Optimize delays after testing |

---

## Next Steps After Implementation

1. Monitor success rate over 100 requests
2. If success < 40%: Add residential proxy support
3. If success 40-60%: Optimize delays and headers
4. If success > 60%: Production ready, document patterns

---

## References

- [Playwright Extra Documentation](https://github.com/berstend/puppeteer-extra/tree/master/packages/playwright-extra)
- [Stealth Plugin Guide](https://www.npmjs.com/package/puppeteer-extra-plugin-stealth)
- [Bypassing Incapsula in 2025](https://scrapfly.io/blog/posts/how-to-bypass-imperva-incapsula-anti-scraping)
- [Playwright Stealth Best Practices](https://www.zenrows.com/blog/playwright-extra)

---

## Notes

- Incapsula detection evolves continuously
- Solution may need periodic updates as detection improves
- Consider A/B testing to measure actual success rate
- FamilySearch may have stricter Incapsula rules than average sites
