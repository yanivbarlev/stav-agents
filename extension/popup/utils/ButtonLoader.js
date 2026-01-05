/**
 * ButtonLoader - Manages button loading states
 * Eliminates code duplication for button enable/disable and loading indicators
 */
export class ButtonLoader {
  /**
   * @param {string} buttonId - ID of the button element
   */
  constructor(buttonId) {
    this.button = document.getElementById(buttonId);
    if (!this.button) {
      throw new Error(`Button with id "${buttonId}" not found`);
    }
    this.btnText = this.button.querySelector('.btn-text');
    this.btnLoading = this.button.querySelector('.btn-loading');
  }

  /**
   * Start loading state - disable button and show loading indicator
   */
  start() {
    this.button.disabled = true;
    if (this.btnText) this.btnText.classList.add('hidden');
    if (this.btnLoading) this.btnLoading.classList.remove('hidden');
  }

  /**
   * Stop loading state - enable button and hide loading indicator
   */
  stop() {
    this.button.disabled = false;
    if (this.btnText) this.btnText.classList.remove('hidden');
    if (this.btnLoading) this.btnLoading.classList.add('hidden');
  }

  /**
   * Wrap an async function with automatic loading state management
   * @param {Function} asyncFn - Async function to execute
   * @returns {Promise<any>} Result of the async function
   */
  async wrap(asyncFn) {
    try {
      this.start();
      return await asyncFn();
    } finally {
      this.stop();
    }
  }
}
