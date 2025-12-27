/**
 * Type definitions for playwright-auth-setup
 * Note: Uses playwright-extra with stealth plugin for anti-detection
 */
import { BrowserContext } from 'playwright';

export function createAuthenticatedBrowserFromCopy(headless?: boolean): Promise<BrowserContext>;
export function createAuthenticatedBrowserFromMainProfile(headless?: boolean): Promise<BrowserContext>;
export function setupCopiedProfile(): Promise<string>;
export function testFamilySearchAuth(useCopiedProfile?: boolean): Promise<void>;

export const CHROME_USER_DATA_DIR: string;
export const PLAYWRIGHT_PROFILE_DIR: string;
