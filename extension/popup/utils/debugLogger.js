/**
 * Debug Logger - Collects logs and exports to file
 */

class DebugLogger {
  constructor() {
    this.logs = [];
    this.startTime = Date.now();
  }

  log(source, message, data = null) {
    const timestamp = Date.now() - this.startTime;
    const entry = {
      timestamp,
      source,
      message,
      data: data ? JSON.stringify(data, null, 2) : null
    };
    this.logs.push(entry);

    // Also log to console
    const prefix = `[DEBUG ${timestamp}ms] [${source}]`;
    if (data) {
      console.log(prefix, message, data);
    } else {
      console.log(prefix, message);
    }
  }

  error(source, message, error = null) {
    const timestamp = Date.now() - this.startTime;
    const entry = {
      timestamp,
      source,
      message,
      error: error ? (error.stack || error.message || String(error)) : null,
      isError: true
    };
    this.logs.push(entry);
    console.error(`[DEBUG ${timestamp}ms] [${source}] ERROR:`, message, error);
  }

  clear() {
    this.logs = [];
    this.startTime = Date.now();
  }

  getLogsAsText() {
    let text = '=== HEIR SEARCH DEBUG LOG ===\n';
    text += `Generated: ${new Date().toISOString()}\n`;
    text += `Total entries: ${this.logs.length}\n`;
    text += '================================\n\n';

    for (const entry of this.logs) {
      const timeStr = `[${entry.timestamp}ms]`;
      const srcStr = `[${entry.source}]`;
      const errStr = entry.isError ? ' ERROR' : '';

      text += `${timeStr} ${srcStr}${errStr} ${entry.message}\n`;
      if (entry.data) {
        text += `  Data: ${entry.data}\n`;
      }
      if (entry.error) {
        text += `  Error: ${entry.error}\n`;
      }
      text += '\n';
    }

    return text;
  }

  exportToFile() {
    const text = this.getLogsAsText();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `heir-search-debug-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log('[DebugLogger] Log file exported');
  }
}

// Global singleton
export const debugLogger = new DebugLogger();

// Make it accessible globally for debugging
if (typeof window !== 'undefined') {
  window.debugLogger = debugLogger;
}
