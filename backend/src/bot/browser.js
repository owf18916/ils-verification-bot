// backend/src/bot/browser.js
// Puppeteer browser setup and management

const puppeteer = require('puppeteer');
const logger = require('../utils/logger');

class BrowserManager {
  constructor() {
    this.browser = null;
    this.pages = [];
  }

  /**
   * Launch browser with Chromium
   */
  async launch(options = {}) {
    try {
      logger.info('Launching Chromium browser...');
      
      this.browser = await puppeteer.launch({
        headless: options.headless || false,
        defaultViewport: null,
        ignoreHTTPSErrors: true, // ✅ Ignore SSL certificate errors
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
          '--ignore-certificate-errors', // ✅ Ignore cert errors
          '--ignore-certificate-errors-spki-list', // ✅ Additional flag
          '--allow-insecure-localhost' // ✅ Allow insecure localhost/internal
        ]
      });

      logger.info('✅ Browser launched successfully');
      return this.browser;
    } catch (error) {
      logger.error('Failed to launch browser:', error);
      throw error;
    }
  }

  /**
   * Create new page
   */
  async newPage() {
    try {
      if (!this.browser) {
        throw new Error('Browser not launched');
      }

      const page = await this.browser.newPage();
      
      // Set timeout
      page.setDefaultTimeout(30000);
      page.setDefaultNavigationTimeout(30000);

      // Track page
      this.pages.push(page);

      logger.info(`New page created (total: ${this.pages.length})`);
      return page;
    } catch (error) {
      logger.error('Failed to create new page:', error);
      throw error;
    }
  }

  /**
   * Close specific page
   */
  async closePage(page) {
    try {
      const index = this.pages.indexOf(page);
      if (index > -1) {
        await page.close();
        this.pages.splice(index, 1);
        logger.info(`Page closed (remaining: ${this.pages.length})`);
      }
    } catch (error) {
      logger.error('Failed to close page:', error);
    }
  }

  /**
   * Close all pages except main
   */
  async closeAllExceptMain() {
    try {
      const mainPage = this.pages[0];
      const otherPages = this.pages.slice(1);

      for (const page of otherPages) {
        await page.close();
      }

      this.pages = [mainPage];
      logger.info('All extra pages closed');
    } catch (error) {
      logger.error('Failed to close pages:', error);
    }
  }

  /**
   * Close browser and cleanup
   */
  async close() {
    try {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        this.pages = [];
        logger.info('✅ Browser closed');
      }
    } catch (error) {
      logger.error('Failed to close browser:', error);
      throw error;
    }
  }

  /**
   * Get all open pages
   */
  getPages() {
    return this.pages;
  }

  /**
   * Get main page
   */
  getMainPage() {
    return this.pages[0];
  }
}

module.exports = BrowserManager;