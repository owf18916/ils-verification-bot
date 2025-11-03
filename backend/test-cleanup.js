// backend/test-cleanup.js
// Test OCR cleanup functionality

const OCRCleanup = require('./src/utils/cleanup-ocr');
const logger = require('./src/utils/logger');
const fs = require('fs');
const path = require('path');

async function createTestFiles() {
  logger.info('Creating test OCR files...');

  const logsDir = path.join(__dirname, 'logs');
  const now = Date.now();

  // Create test files with different ages
  const testFiles = [
    { name: `ocr-result-${now - 8 * 24 * 60 * 60 * 1000}.txt`, content: 'Old file (8 days ago)' },
    { name: `ocr-result-${now - 5 * 24 * 60 * 60 * 1000}.txt`, content: 'Old file (5 days ago)' },
    { name: `ocr-result-${now - 1 * 24 * 60 * 60 * 1000}.txt`, content: 'Recent file (1 day ago)' },
    { name: `ocr-result-${now}.txt`, content: 'New file (today)' },
    { name: `temp-${now - 2 * 60 * 60 * 1000}.pdf`, content: 'Temp PDF (2 hours ago)' },
  ];

  for (const file of testFiles) {
    const filePath = path.join(logsDir, file.name);
    fs.writeFileSync(filePath, file.content);
    logger.info(`Created: ${file.name}`);
  }

  logger.success(`✅ Created ${testFiles.length} test files`);
}

async function testCleanup() {
  try {
    console.log('\n' + '='.repeat(60));
    console.log('OCR CLEANUP - TEST SUITE');
    console.log('='.repeat(60) + '\n');

    // Step 1: Create test files
    await createTestFiles();

    console.log('\n');

    // Step 2: Get statistics
    logger.info('Getting cleanup statistics...');
    const cleanup = new OCRCleanup({
      maxAge: 7,      // Keep files for 7 days
      maxFiles: 50    // Keep max 50 files
    });

    const stats = await cleanup.getStatistics();

    console.log('\n📊 Cleanup Statistics:');
    console.log('  OCR Results:');
    console.log(`    - Total: ${stats.ocrResults.total}`);
    console.log(`    - To Delete: ${stats.ocrResults.toDelete}`);
    console.log(`    - To Keep: ${stats.ocrResults.toKeep}`);
    if (stats.ocrResults.oldestDate) {
      console.log(`    - Oldest: ${stats.ocrResults.oldestDate.toLocaleString()}`);
      console.log(`    - Newest: ${stats.ocrResults.newestDate.toLocaleString()}`);
    }

    console.log('  Temp PDFs:');
    console.log(`    - Total: ${stats.tempPDFs.total}`);
    console.log(`    - To Delete: ${stats.tempPDFs.toDelete}`);

    console.log('  Temp Folders:');
    console.log(`    - Exists: ${stats.tempFolders.exists}`);
    console.log(`    - Files: ${stats.tempFolders.filesCount}`);

    console.log('\n');

    // Step 3: Dry run
    logger.info('Running dry run (no actual deletion)...');
    const dryRunCleanup = new OCRCleanup({
      maxAge: 7,
      maxFiles: 50,
      dryRun: true
    });

    await dryRunCleanup.cleanupAll();

    console.log('\n');

    // Step 4: Ask for confirmation
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise((resolve) => {
      rl.question('Proceed with actual cleanup? (y/n): ', resolve);
    });

    rl.close();

    if (answer.toLowerCase() === 'y') {
      console.log('\n');
      logger.info('Running actual cleanup...');

      const actualCleanup = new OCRCleanup({
        maxAge: 7,
        maxFiles: 50,
        dryRun: false
      });

      const results = await actualCleanup.cleanupAll();

      console.log('\n✅ Cleanup test completed successfully!');
    } else {
      console.log('\n⏭️  Cleanup cancelled.');
    }

  } catch (error) {
    logger.error('Cleanup test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run test
testCleanup();
