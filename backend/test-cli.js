// backend/test-cli.js
// Quick CLI test for bot functionality

const BrowserManager = require('./src/bot/browser');
const ILSLogin = require('./src/bot/ils-login');
const ILSNavigator = require('./src/bot/ils-navigator');
const logger = require('./src/utils/logger');
const readline = require('readline');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promisify readline question
const question = (prompt) => {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
};

async function testLoginOnly() {
  const browserManager = new BrowserManager();
  
  try {
    logger.info('='.repeat(60));
    logger.info('ILS VERIFICATION BOT - LOGIN TEST (WITH POPUP CLOSE)');
    logger.info('='.repeat(60));

    // Get credentials
    console.log('\n');
    const username = await question('Enter ILS Username: ');
    const password = await question('Enter ILS Password: ');
    console.log('\n');

    // Launch browser
    await browserManager.launch({ headless: false });
    const page = await browserManager.newPage();

    // Test login
    const loginHandler = new ILSLogin(page);
    await loginHandler.login(username, password);

    logger.success('='.repeat(60));
    logger.success('✅ LOGIN TEST PASSED!');
    logger.success('Dashboard should be visible without popup');
    logger.success('='.repeat(60));

    // Keep browser open for 30 seconds
    logger.info('Browser will stay open for 30 seconds...');
    logger.info('Please verify dashboard is accessible');
    await new Promise(resolve => setTimeout(resolve, 30000));

  } catch (error) {
    logger.error('='.repeat(60));
    logger.error('❌ LOGIN TEST FAILED!');
    logger.error('Error:', error.message);
    logger.error('Stack:', error.stack);
    logger.error('='.repeat(60));
  } finally {
    await browserManager.close();
    rl.close();
    logger.info('Test completed. Exiting...');
    process.exit(0);
  }
}

async function testLoginAndNavigation() {
  const browserManager = new BrowserManager();
  
  try {
    logger.info('='.repeat(60));
    logger.info('ILS VERIFICATION BOT - FULL NAVIGATION TEST');
    logger.info('='.repeat(60));

    // Get credentials and environment
    console.log('\n');
    const username = await question('Enter ILS Username: ');
    const password = await question('Enter ILS Password: ');
    const envChoice = await question('Environment (1=Dev, 2=Prod) [1]: ');
    const environment = envChoice === '2' ? 'prod' : 'dev';
    console.log('\n');

    logger.info(`Environment: ${environment.toUpperCase()}`);

    // Launch browser
    await browserManager.launch({ headless: false });
    const page = await browserManager.newPage();

    // Test login
    const loginHandler = new ILSLogin(page);
    await loginHandler.login(username, password);

    // Test navigation
    const navigator = new ILSNavigator(page, environment);
    await navigator.navigateToScrapList();

    logger.success('='.repeat(60));
    logger.success('✅ FULL NAVIGATION TEST PASSED!');
    logger.success('You should see "List Scrap Activity" page now');
    logger.success('='.repeat(60));

    // Keep browser open for 30 seconds
    logger.info('Browser will stay open for 30 seconds...');
    await new Promise(resolve => setTimeout(resolve, 30000));

  } catch (error) {
    logger.error('='.repeat(60));
    logger.error('❌ NAVIGATION TEST FAILED!');
    logger.error('Error:', error.message);
    logger.error('Stack:', error.stack);
    logger.error('='.repeat(60));
  } finally {
    await browserManager.close();
    rl.close();
    logger.info('Test completed. Exiting...');
    process.exit(0);
  }
}

async function testBrowser() {
  const browserManager = new BrowserManager();
  
  try {
    logger.info('='.repeat(60));
    logger.info('ILS VERIFICATION BOT - BROWSER TEST');
    logger.info('='.repeat(60));

    // Launch browser
    logger.info('Testing Chromium launch...');
    await browserManager.launch({ headless: false });
    
    const page = await browserManager.newPage();
    
    // Navigate to test page
    logger.info('Navigating to Google...');
    await page.goto('https://www.google.com');
    
    logger.success('='.repeat(60));
    logger.success('✅ BROWSER TEST PASSED!');
    logger.success('Browser is working correctly');
    logger.success('='.repeat(60));

    // Keep browser open for 5 seconds
    logger.info('Browser will stay open for 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));

  } catch (error) {
    logger.error('='.repeat(60));
    logger.error('❌ BROWSER TEST FAILED!');
    logger.error('Error:', error.message);
    logger.error('='.repeat(60));
  } finally {
    await browserManager.close();
    logger.info('Test completed. Exiting...');
    process.exit(0);
  }
}

// Main menu
async function main() {
  console.log('\n='.repeat(60));
  console.log('ILS VERIFICATION BOT - TEST SUITE');
  console.log('='.repeat(60));
  console.log('\nSelect test to run:');
  console.log('1. Browser Test (Launch Chromium)');
  console.log('2. Login Test (ILS Login + Close Popup)');
  console.log('3. Navigation Test (Login + Navigate to Scrap)');
  console.log('4. Exit');
  console.log('');

  const choice = await question('Enter choice (1-4): ');

  switch (choice) {
    case '1':
      await testBrowser();
      break;
    case '2':
      await testLoginAndNavigation();
      break;
    case '3':
      await testLoginAndNavigation();
      break;
    case '4':
      logger.info('Exiting...');
      rl.close();
      process.exit(0);
      break;
    default:
      logger.error('Invalid choice');
      rl.close();
      process.exit(1);
  }
}

// Run
main().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
});