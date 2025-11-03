// Simple cleanup test
const OCRCleanup = require('./src/utils/cleanup-ocr');
const logger = require('./src/utils/logger');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function test() {
  try {
    console.log('\n=== OCR Cleanup Test ===\n');

    const logsDir = path.join(__dirname, 'logs');

    // Create old file (8 days ago) by modifying mtime
    const oldFileName = `ocr-result-${Date.now() - 8 * 24 * 60 * 60 * 1000}.txt`;
    const oldFilePath = path.join(logsDir, oldFileName);
    fs.writeFileSync(oldFilePath, 'Old file content (8 days)');

    // Set modification time to 8 days ago using touch command
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const touchDate = eightDaysAgo.toISOString().split('T')[0].replace(/-/g, '');
    await execPromise(`touch -t ${touchDate}0000 "${oldFilePath}"`);
    logger.info(`Created old file: ${oldFileName}`);

    // Create recent file
    const newFileName = `ocr-result-${Date.now()}.txt`;
    const newFilePath = path.join(logsDir, newFileName);
    fs.writeFileSync(newFilePath, 'Recent file content');
    logger.info(`Created recent file: ${newFileName}`);

    console.log('\n--- Before Cleanup ---');

    // Get stats
    const cleanup = new OCRCleanup({ maxAge: 7, maxFiles: 50 });
    const stats = await cleanup.getStatistics();

    console.log(`Total OCR files: ${stats.ocrResults.total}`);
    console.log(`Files to delete: ${stats.ocrResults.toDelete}`);
    console.log(`Files to keep: ${stats.ocrResults.toKeep}`);

    if (stats.ocrResults.oldestDate) {
      console.log(`Oldest: ${stats.ocrResults.oldestDate.toLocaleString()}`);
    }

    console.log('\n--- Running Cleanup ---');

    const results = await cleanup.cleanupOCRResults();

    console.log(`\n✅ Deleted: ${results.deleted} files`);
    console.log(`✅ Kept: ${results.kept} files`);

    // Verify
    const filesAfter = fs.readdirSync(logsDir)
      .filter(f => f.startsWith('ocr-result-') && f.endsWith('.txt'));

    console.log(`\nFiles remaining: ${filesAfter.length}`);

    // Check if old file was deleted
    const oldFileExists = fs.existsSync(oldFilePath);
    const newFileExists = fs.existsSync(newFilePath);

    console.log(`Old file (8 days) deleted: ${!oldFileExists ? '✅ YES' : '❌ NO'}`);
    console.log(`Recent file kept: ${newFileExists ? '✅ YES' : '❌ NO'}`);

    console.log('\n✅ Cleanup test completed!\n');

  } catch (error) {
    logger.error('Test failed:', error.message);
    console.error(error);
  }
}

test();
