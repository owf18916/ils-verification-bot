// backend/src/bot/ils-login.js
// ILS system login automation

const logger = require('../utils/logger');

class ILSLogin {
  constructor(page) {
    this.page = page;
    // Try HTTPS first (dari error log), fallback to HTTP
    this.baseUrl = 'https://202.148.14.173/ils-dev';
    this.fallbackUrl = 'http://202.148.14.173';
  }

  /**
   * Navigate to login page
   */
  async navigateToLogin() {
    try {
      logger.info('Navigating to ILS login page...');
      
      // Try primary URL
      try {
        await this.page.goto(this.baseUrl, {
          waitUntil: 'networkidle2',
          timeout: 15000
        });
      } catch (error) {
        // If primary fails, try fallback
        logger.warn('Primary URL failed, trying fallback...');
        await this.page.goto(this.fallbackUrl, {
          waitUntil: 'networkidle2',
          timeout: 15000
        });
      }
      
      // Wait for login form
      await this.page.waitForSelector('input[name="username"], input[placeholder*="username"]', {
        timeout: 10000
      });
      
      logger.success('✅ Login page loaded');
      return true;
    } catch (error) {
      logger.error('Failed to navigate to login page:', error.message);
      throw new Error('Cannot access ILS login page');
    }
  }

  /**
   * Fill credentials and submit
   */
  async fillCredentials(username, password) {
    try {
      logger.info('Filling login credentials...');

      // Find username input (flexible selector)
      const usernameSelector = 'input[name="username"], input[placeholder*="username"], input[type="text"]';
      await this.page.waitForSelector(usernameSelector);
      await this.page.type(usernameSelector, username);
      logger.debug('Username entered');

      // Small delay for natural behavior
      await new Promise(resolve => setTimeout(resolve, 500));

      // Find password input
      const passwordSelector = 'input[name="password"], input[placeholder*="password"], input[type="password"]';
      await this.page.waitForSelector(passwordSelector);
      await this.page.type(passwordSelector, password);
      logger.debug('Password entered');

      await new Promise(resolve => setTimeout(resolve, 500));

      logger.success('✅ Credentials filled');
      return true;
    } catch (error) {
      logger.error('Failed to fill credentials:', error.message);
      throw new Error('Cannot fill login form');
    }
  }

  /**
   * Click login button and wait for navigation
   */
  async submitLogin() {
    try {
      logger.info('Submitting login...');

      // Find and click login button
      const buttonSelectors = [
        'button[type="submit"]',
        'button:has-text("Log in")',
        'button:has-text("Login")',
        '.btn:has-text("Log")',
        'input[type="submit"]'
      ];

      let buttonFound = false;
      for (const selector of buttonSelectors) {
        try {
          const button = await this.page.$(selector);
          if (button) {
            await button.click();
            buttonFound = true;
            logger.debug(`Login button clicked: ${selector}`);
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!buttonFound) {
        // Fallback: press Enter
        logger.warn('Login button not found, pressing Enter');
        await this.page.keyboard.press('Enter');
      }

      // Wait for navigation
      await this.page.waitForNavigation({
        waitUntil: 'networkidle2',
        timeout: 15000
      });

      logger.success('✅ Login submitted');
      return true;
    } catch (error) {
      logger.error('Failed to submit login:', error.message);
      throw new Error('Login submission failed');
    }
  }

  /**
   * Handle "Update Password" popup if appears
   */
  async handleUpdatePasswordPopup() {
    try {
      logger.info('Checking for "Update Password" popup...');

      // Wait a bit for popup to appear
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Check if popup exists
      const popupSelectors = [
        'div:has-text("Update Password")',
        'div[role="dialog"]',
        '.modal',
        'div.swal2-popup',
        'div[class*="modal"]',
        'div[class*="popup"]'
      ];

      // Try to find close button
      const closeButtonSelectors = [
        'button[class*="close"]',
        'button[aria-label="close"]',
        'button[aria-label="Close"]',
        '.close',
        '[data-dismiss="modal"]',
        'button.swal2-close',
        'svg[class*="close"]',
        // Specific for this popup based on screenshot
        'button:has-text("×")',
        'button:has-text("Simpan")'
      ];

      // Try each close button selector
      for (const selector of closeButtonSelectors) {
        try {
          const closeButton = await this.page.$(selector);
          if (closeButton) {
            logger.info(`Found close button: ${selector}`);
            await closeButton.click();
            logger.success('✅ "Update Password" popup closed');
            
            // Wait for popup to disappear
            await new Promise(resolve => setTimeout(resolve, 1000));
            return true;
          }
        } catch (e) {
          // Try next selector
          continue;
        }
      }

      // If no close button found, try ESC key
      logger.info('Close button not found, trying ESC key...');
      await this.page.keyboard.press('Escape');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      logger.success('✅ Attempted to close popup with ESC');
      return true;
    } catch (error) {
      logger.warn('No "Update Password" popup found or already closed');
      return true; // Continue anyway
    }
  }

  /**
   * Verify successful login
   */
  async verifyLogin() {
    try {
      logger.info('Verifying login success...');

      // Wait a bit for page to settle
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check if we're on dashboard/welcome page
      const currentUrl = this.page.url();
      
      // Check for dashboard indicators
      const dashboardIndicators = [
        'Welcome',
        'Dashboard',
        'Halo mallud',
        'ILS - Welcome',
        'ILS-dev'
      ];

      const pageContent = await this.page.content();
      const isLoggedIn = dashboardIndicators.some(indicator => 
        pageContent.includes(indicator)
      );

      if (isLoggedIn) {
        logger.success('✅ Login successful - Dashboard loaded');
        
        // Handle popup if exists
        await this.handleUpdatePasswordPopup();
        
        return true;
      }

      // Check if still on login page (login failed)
      const isStillLoginPage = currentUrl.includes('login') || 
                               pageContent.includes('username') ||
                               pageContent.includes('Password');

      if (isStillLoginPage) {
        logger.error('❌ Login failed - Still on login page');
        throw new Error('Invalid credentials or login failed');
      }

      // Unknown state - but handle popup anyway
      logger.warn('⚠️ Login verification inconclusive');
      await this.handleUpdatePasswordPopup();
      
      return true; // Assume success if not on login page
    } catch (error) {
      logger.error('Login verification error:', error.message);
      throw error;
    }
  }

  /**
   * Complete login process
   */
  async login(username, password) {
    try {
      logger.info('🔐 Starting ILS login process...');
      
      await this.navigateToLogin();
      await this.fillCredentials(username, password);
      await this.submitLogin();
      await this.verifyLogin();

      logger.success('✅ ILS login completed successfully');
      return true;
    } catch (error) {
      logger.error('❌ ILS login failed:', error.message);
      throw error;
    }
  }
}

module.exports = ILSLogin;