// backend/src/utils/helpers.js
// Utility helper functions

const logger = require('./logger');

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @returns {Promise} - Result of function or throws error
 */
async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffFactor = 2,
    onRetry = null
  } = options;

  let lastError;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.debug(`Attempt ${attempt}/${maxRetries}`);
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        logger.error(`All ${maxRetries} attempts failed`);
        break;
      }

      logger.warn(`Attempt ${attempt} failed: ${error.message}`);
      logger.info(`Retrying in ${delay}ms...`);

      if (onRetry) {
        await onRetry(attempt, error);
      }

      await sleep(delay);
      delay = Math.min(delay * backoffFactor, maxDelay);
    }
  }

  throw lastError;
}

/**
 * Wait for a condition to be true with timeout
 * @param {Function} condition - Function that returns boolean
 * @param {Object} options - Wait options
 * @returns {Promise<boolean>}
 */
async function waitForCondition(condition, options = {}) {
  const {
    timeout = 30000,
    interval = 500,
    timeoutMessage = 'Condition not met within timeout'
  } = options;

  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const result = await condition();
      if (result) {
        return true;
      }
    } catch (error) {
      logger.debug('Condition check error:', error.message);
    }
    await sleep(interval);
  }

  throw new Error(timeoutMessage);
}

/**
 * Sleep/delay function
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Safe page navigation with retry and error handling
 * @param {Page} page - Puppeteer page
 * @param {string} url - URL to navigate to
 * @param {Object} options - Navigation options
 * @returns {Promise}
 */
async function safeNavigate(page, url, options = {}) {
  const {
    maxRetries = 3,
    waitUntil = 'networkidle2',
    timeout = 30000
  } = options;

  return await retryWithBackoff(
    async () => {
      logger.info(`Navigating to: ${url}`);
      await page.goto(url, {
        waitUntil: waitUntil,
        timeout: timeout
      });
      logger.success('Navigation successful');
    },
    {
      maxRetries: maxRetries,
      onRetry: async (attempt, error) => {
        logger.warn(`Navigation failed (attempt ${attempt}): ${error.message}`);
      }
    }
  );
}

/**
 * Safe element click with retry
 * @param {Page} page - Puppeteer page
 * @param {string} selector - Element selector
 * @param {Object} options - Click options
 * @returns {Promise}
 */
async function safeClick(page, selector, options = {}) {
  const {
    maxRetries = 3,
    waitTimeout = 10000,
    clickDelay = 500
  } = options;

  return await retryWithBackoff(
    async () => {
      logger.debug(`Looking for element: ${selector}`);
      await page.waitForSelector(selector, { timeout: waitTimeout });
      
      const element = await page.$(selector);
      if (!element) {
        throw new Error(`Element not found: ${selector}`);
      }

      await element.click();
      logger.debug(`Clicked: ${selector}`);
      
      // Wait a bit after click
      await sleep(clickDelay);
    },
    {
      maxRetries: maxRetries,
      onRetry: async (attempt, error) => {
        logger.warn(`Click failed (attempt ${attempt}): ${error.message}`);
      }
    }
  );
}

/**
 * Safe text input with retry
 * @param {Page} page - Puppeteer page
 * @param {string} selector - Input selector
 * @param {string} text - Text to type
 * @param {Object} options - Type options
 * @returns {Promise}
 */
async function safeType(page, selector, text, options = {}) {
  const {
    maxRetries = 3,
    waitTimeout = 10000,
    clearFirst = true,
    typeDelay = 100
  } = options;

  return await retryWithBackoff(
    async () => {
      logger.debug(`Typing into: ${selector}`);
      await page.waitForSelector(selector, { timeout: waitTimeout });
      
      if (clearFirst) {
        await page.click(selector, { clickCount: 3 });
        await page.keyboard.press('Backspace');
      }

      await page.type(selector, text, { delay: typeDelay });
      logger.debug(`Typed ${text.length} characters`);
    },
    {
      maxRetries: maxRetries,
      onRetry: async (attempt, error) => {
        logger.warn(`Type failed (attempt ${attempt}): ${error.message}`);
      }
    }
  );
}

/**
 * Wait for page to be fully loaded
 * @param {Page} page - Puppeteer page
 * @param {Object} options - Wait options
 * @returns {Promise}
 */
async function waitForPageLoad(page, options = {}) {
  const {
    timeout = 30000,
    waitUntil = 'networkidle2'
  } = options;

  try {
    logger.debug('Waiting for page to load...');
    
    await Promise.race([
      page.waitForNavigation({ waitUntil: waitUntil, timeout: timeout }),
      sleep(timeout)
    ]);

    // Additional wait for dynamic content
    await sleep(1000);
    
    logger.success('Page loaded');
  } catch (error) {
    logger.warn('Page load timeout, but continuing...');
  }
}

/**
 * Check if element exists without throwing error
 * @param {Page} page - Puppeteer page
 * @param {string} selector - Element selector
 * @param {number} timeout - Wait timeout
 * @returns {Promise<boolean>}
 */
async function elementExists(page, selector, timeout = 5000) {
  try {
    await page.waitForSelector(selector, { timeout: timeout });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get element text safely
 * @param {Page} page - Puppeteer page
 * @param {string} selector - Element selector
 * @returns {Promise<string|null>}
 */
async function getElementText(page, selector) {
  try {
    const element = await page.$(selector);
    if (!element) return null;
    
    return await page.evaluate(el => el.textContent, element);
  } catch (error) {
    logger.debug(`Could not get text for ${selector}:`, error.message);
    return null;
  }
}

/**
 * Take screenshot with timestamp
 * @param {Page} page - Puppeteer page
 * @param {string} name - Screenshot name
 * @param {string} path - Save path
 * @returns {Promise}
 */
async function takeScreenshot(page, name, path = './logs') {
  try {
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const filename = `${path}/${name}-${timestamp}.png`;
    
    await page.screenshot({ path: filename, fullPage: true });
    logger.info(`Screenshot saved: ${filename}`);
    
    return filename;
  } catch (error) {
    logger.error('Failed to take screenshot:', error.message);
    return null;
  }
}

module.exports = {
  retryWithBackoff,
  waitForCondition,
  sleep,
  safeNavigate,
  safeClick,
  safeType,
  waitForPageLoad,
  elementExists,
  getElementText,
  takeScreenshot
};