// backend/src/bot/ils-navigator.js
// ILS system navigation functions

const logger = require('../utils/logger');

class ILSNavigator {
  constructor(page, environment = 'dev') {
    this.page = page;
    this.environment = environment; // 'dev' or 'prod'
    this.baseUrl = 'https://202.148.14.173';
    
    // Set URL prefix based on environment
    this.urlPrefix = environment === 'prod' ? '/ils' : '/ils-dev';
  }

  /**
   * Get full URL for a path
   */
  getUrl(path) {
    return `${this.baseUrl}${this.urlPrefix}${path}`;
  }

  /**
   * Navigate to Scrap module
   */
  async navigateToScrap() {
    try {
      logger.info('Navigating to Scrap module...');

      // Method 1: Try clicking the button (more reliable)
      try {
        // Wait for dashboard to load
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Find Scrap button by text content
        const scrapButton = await this.page.evaluateHandle(() => {
          const buttons = Array.from(document.querySelectorAll('a.btn'));
          return buttons.find(btn => {
            const parent = btn.closest('.card-body');
            return parent && parent.textContent.includes('Scrap');
          });
        });

        if (scrapButton.asElement()) {
          logger.info('Found Scrap button, clicking...');
          await scrapButton.asElement().click();
          
          // Wait for navigation
          await this.page.waitForNavigation({
            waitUntil: 'networkidle2',
            timeout: 10000
          });
          
          logger.success('✅ Navigated to Scrap module via button');
          return true;
        }
      } catch (e) {
        logger.warn('Could not find/click Scrap button, trying direct URL...');
      }

      // Method 2: Direct URL navigation (fallback)
      const scrapUrls = [
        this.getUrl('/scrap'),
        `${this.baseUrl}/ils-dev/scrap`,
        `${this.baseUrl}/ils/scrap`
      ];

      for (const url of scrapUrls) {
        try {
          logger.info(`Trying URL: ${url}`);
          await this.page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: 10000
          });

          // Check if we're on scrap page
          const currentUrl = this.page.url();
          if (currentUrl.includes('/scrap')) {
            logger.success(`✅ Navigated to Scrap module: ${url}`);
            return true;
          }
        } catch (e) {
          logger.warn(`Failed to navigate to ${url}: ${e.message}`);
          continue;
        }
      }

      throw new Error('Could not navigate to Scrap module');
    } catch (error) {
      logger.error('Failed to navigate to Scrap:', error.message);
      throw error;
    }
  }

  /**
   * Navigate to List Scrap Activity
   */
  async navigateToListScrapActivity() {
    try {
      logger.info('Navigating to List Scrap Activity...');

      // Wait a bit for page to load
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Look for "List Scrap Activity" link in sidebar or menu
      const linkSelectors = [
        'a:has-text("List Scrap Activity")',
        'a[href*="list"]',
        'a[href*="activity"]',
        '.menu-item:has-text("List")'
      ];

      for (const selector of linkSelectors) {
        try {
          // Use evaluate to find link containing text
          const linkFound = await this.page.evaluate((sel) => {
            const links = document.querySelectorAll('a');
            for (const link of links) {
              if (link.textContent.includes('List Scrap Activity') || 
                  link.textContent.includes('List Scrap Acitivity')) { // Typo might exist
                link.click();
                return true;
              }
            }
            return false;
          }, selector);

          if (linkFound) {
            logger.info('Clicked "List Scrap Activity" link');
            
            // Wait for navigation
            await this.page.waitForNavigation({
              waitUntil: 'networkidle2',
              timeout: 10000
            }).catch(() => {
              // Navigation might not occur if it's same page
              logger.debug('No navigation occurred (might be same page)');
            });

            logger.success('✅ Navigated to List Scrap Activity');
            return true;
          }
        } catch (e) {
          continue;
        }
      }

      // Fallback: Try direct URL
      const listUrl = this.getUrl('/scrap/list-activity');
      try {
        await this.page.goto(listUrl, {
          waitUntil: 'networkidle2',
          timeout: 10000
        });
        logger.success('✅ Navigated to List Scrap Activity via URL');
        return true;
      } catch (e) {
        logger.warn('Could not navigate via URL');
      }

      throw new Error('Could not navigate to List Scrap Activity');
    } catch (error) {
      logger.error('Failed to navigate to List Scrap Activity:', error.message);
      throw error;
    }
  }

  /**
   * Search for ticket by number
   */
  async searchTicket(ticketNumber) {
    try {
      logger.info(`Searching for ticket: ${ticketNumber}`);

      // Wait for search input
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Find search input
      const searchSelectors = [
        'input[type="search"]',
        'input[placeholder*="Search"]',
        'input[placeholder*="search"]',
        'input.search',
        '#search'
      ];

      let searchInput = null;
      for (const selector of searchSelectors) {
        try {
          searchInput = await this.page.$(selector);
          if (searchInput) {
            logger.debug(`Found search input: ${selector}`);
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!searchInput) {
        throw new Error('Search input not found');
      }

      // Clear existing search
      await searchInput.click({ clickCount: 3 });
      await this.page.keyboard.press('Backspace');

      // Type ticket number
      await searchInput.type(ticketNumber.toString());
      logger.debug(`Typed ticket number: ${ticketNumber}`);

      // Press Enter or wait for auto-search
      await this.page.keyboard.press('Enter');
      
      // Wait for search results
      await new Promise(resolve => setTimeout(resolve, 2000));

      logger.success(`✅ Searched for ticket ${ticketNumber}`);
      return true;
    } catch (error) {
      logger.error('Failed to search ticket:', error.message);
      throw error;
    }
  }

  /**
   * Click Excel download button
   */
  async clickExcelButton() {
    try {
      logger.info('Looking for Excel download button...');

      // Find Excel button (based on common patterns)
      const excelButtonSelectors = [
        'button:has-text("Excel")',
        'a:has-text("Excel")',
        '.btn-success', // Green button often used for Excel
        'button.excel',
        '[data-action="excel"]'
      ];

      // Use evaluate to find button with "Excel" text
      const clicked = await this.page.evaluate(() => {
        const buttons = document.querySelectorAll('button, a.btn');
        for (const btn of buttons) {
          if (btn.textContent.includes('Excel') || 
              btn.className.includes('excel') ||
              btn.className.includes('btn-success')) {
            btn.click();
            return true;
          }
        }
        return false;
      });

      if (!clicked) {
        throw new Error('Excel button not found');
      }

      logger.success('✅ Clicked Excel download button');
      
      // Wait for download to start
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      return true;
    } catch (error) {
      logger.error('Failed to click Excel button:', error.message);
      throw error;
    }
  }

  /**
   * Click Detail button for current ticket
   */
  async clickDetailButton() {
    try {
      logger.info('Looking for Detail button...');

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Find Detail button (cyan/info button)
      const clicked = await this.page.evaluate(() => {
        const buttons = document.querySelectorAll('button, a.btn');
        for (const btn of buttons) {
          if (btn.textContent.includes('Detail') || 
              btn.className.includes('btn-info')) {
            btn.click();
            return true;
          }
        }
        return false;
      });

      if (!clicked) {
        throw new Error('Detail button not found');
      }

      logger.success('✅ Clicked Detail button');
      
      // Wait for new page/tab to open
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      return true;
    } catch (error) {
      logger.error('Failed to click Detail button:', error.message);
      throw error;
    }
  }

  /**
   * Complete navigation flow: Dashboard → Scrap → List Activity
   */
  async navigateToScrapList() {
    try {
      logger.info('Starting navigation flow to Scrap List...');
      
      await this.navigateToScrap();
      await this.navigateToListScrapActivity();
      
      logger.success('✅ Successfully navigated to Scrap List Activity');
      return true;
    } catch (error) {
      logger.error('Navigation flow failed:', error.message);
      throw error;
    }
  }
}

module.exports = ILSNavigator;