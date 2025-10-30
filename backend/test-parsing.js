// backend/test-parsing.js
// Test Excel and PDF parsing modules

const ExcelParser = require('./src/bot/excel-parser');
const PDFParser = require('./src/bot/pdf-parser');
const Validator = require('./src/bot/validator');
const ExcelWriter = require('./src/bot/excel-writer');
const logger = require('./src/utils/logger');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (prompt) => {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
};

async function testExcelParsing() {
  try {
    logger.info('='.repeat(60));
    logger.info('EXCEL PARSING TEST');
    logger.info('='.repeat(60));

    const excelPath = await question('\nEnter Excel file path: ');
    
    if (!excelPath || excelPath.trim() === '') {
      throw new Error('Excel path required');
    }

    // Parse Excel
    logger.info('\n--- Parsing Excel ---');
    const parser = new ExcelParser(excelPath.trim());
    await parser.load();
    
    const ticketNumber = parser.getTicketNumber();
    const items = parser.parseItems();
    const summary = parser.getSummary();

    // Display results
    logger.success('\n✅ Excel Parsing Results:');
    logger.info(`Ticket Number: ${ticketNumber}`);
    logger.info(`Total Items: ${summary.totalItems}`);
    logger.info(`Unique Aju: ${summary.uniqueAju}`);
    logger.info(`Total Qty: ${summary.totalQty}`);
    logger.info(`Item Codes: ${summary.itemCodes.join(', ')}`);
    logger.info(`Seri Range: ${summary.seriRange.min} - ${summary.seriRange.max}`);

    // Check duplicates
    const duplicates = parser.checkDuplicateSeri();
    if (duplicates.length > 0) {
      logger.warn(`\nFound ${duplicates.length} duplicate seri cases`);
    }

    // Show first 5 items
    logger.info('\nFirst 5 items:');
    items.slice(0, 5).forEach((item, idx) => {
      logger.info(`${idx + 1}. Row ${item.rowNumber}: ${item.itemCode} | Seri: ${item.seriBarang} | Qty: ${item.qty}`);
    });

    logger.success('\n✅ Excel parsing test passed!');
    return true;
  } catch (error) {
    logger.error('\n❌ Excel parsing test failed:', error.message);
    return false;
  }
}

async function testPDFParsing() {
  try {
    logger.info('='.repeat(60));
    logger.info('PDF PARSING TEST');
    logger.info('='.repeat(60));

    const pdfPath = await question('\nEnter PDF file path: ');
    
    if (!pdfPath || pdfPath.trim() === '') {
      throw new Error('PDF path required');
    }

    // Parse PDF
    logger.info('\n--- Parsing PDF ---');
    const parser = new PDFParser(pdfPath.trim());
    await parser.load();
    
    const docType = parser.detectDocumentType();
    const items = parser.parseItems();
    const summary = parser.getSummary();

    // Display results
    logger.success('\n✅ PDF Parsing Results:');
    logger.info(`Document Type: ${docType}`);
    logger.info(`Total Items: ${summary.totalItems}`);
    logger.info(`Total Qty: ${summary.totalQty}`);
    logger.info(`Kode Brg List: ${summary.kodeBrgList.join(', ')}`);
    logger.info(`Seri Range: ${summary.seriRange.min} - ${summary.seriRange.max}`);

    // Show first 5 items
    logger.info('\nFirst 5 items:');
    items.slice(0, 5).forEach((item, idx) => {
      logger.info(`${idx + 1}. Seri ${item.seri}: ${item.kodeBrg} | ${item.qty} ${item.satuan}`);
    });

    logger.success('\n✅ PDF parsing test passed!');
    return true;
  } catch (error) {
    logger.error('\n❌ PDF parsing test failed:', error.message);
    return false;
  }
}

async function testFullValidation() {
  try {
    logger.info('='.repeat(60));
    logger.info('FULL VALIDATION TEST (Excel + PDF)');
    logger.info('='.repeat(60));

    const excelPath = await question('\nEnter Excel file path: ');
    const pdfPath = await question('Enter PDF file path: ');
    
    if (!excelPath || !pdfPath) {
      throw new Error('Both Excel and PDF paths required');
    }

    // Parse Excel
    logger.info('\n--- Step 1: Parsing Excel ---');
    const excelParser = new ExcelParser(excelPath.trim());
    await excelParser.load();
    const ticketNumber = excelParser.getTicketNumber();
    const excelItems = excelParser.parseItems();
    logger.success(`✅ Parsed ${excelItems.length} items from Excel`);

    // Parse PDF
    logger.info('\n--- Step 2: Parsing PDF ---');
    const pdfParser = new PDFParser(pdfPath.trim());
    await pdfParser.load();
    const pdfItems = pdfParser.parseItems();
    logger.success(`✅ Parsed ${pdfItems.length} items from PDF`);

    // Validate
    logger.info('\n--- Step 3: Validating ---');
    const validator = new Validator({
      nameSimilarityThreshold: 0.75,
      allowMultiItemSameSeri: true
    });

    const processedItems = validator.processDuplicateSeri(excelItems);
    const validationResult = validator.validateBatch(processedItems, pdfParser);

    // Write results
    logger.info('\n--- Step 4: Writing Results ---');
    const writer = new ExcelWriter(excelParser);
    writer.writeAllResults(validationResult.results);
    writer.addSummarySheet(validationResult.summary, ticketNumber);

    // Save
    const outputPath = path.join(
      path.dirname(excelPath),
      `VERIFIED_${path.basename(excelPath)}`
    );
    await writer.save(outputPath.trim());

    // Display summary
    logger.success('\n='.repeat(60));
    logger.success('✅ VALIDATION COMPLETE');
    logger.success('='.repeat(60));
    logger.info('\nSummary:');
    logger.info(`Total Items: ${validationResult.summary.total}`);
    logger.info(`✅ OK: ${validationResult.summary.ok}`);
    logger.info(`⚠️  Warning: ${validationResult.summary.warning}`);
    logger.info(`❌ Error: ${validationResult.summary.error}`);
    logger.info(`Success Rate: ${validationResult.summary.successRate}`);
    logger.info(`\nOutput saved to: ${outputPath}`);

    return true;
  } catch (error) {
    logger.error('\n❌ Validation test failed:', error.message);
    logger.error(error);
    return false;
  }
}

async function main() {
  console.log('\n='.repeat(60));
  console.log('ILS VERIFICATION BOT - PARSING TEST SUITE');
  console.log('='.repeat(60));
  console.log('\nSelect test to run:');
  console.log('1. Test Excel Parsing');
  console.log('2. Test PDF Parsing');
  console.log('3. Test Full Validation (Excel + PDF)');
  console.log('4. Exit');
  console.log('');

  const choice = await question('Enter choice (1-4): ');

  switch (choice) {
    case '1':
      await testExcelParsing();
      break;
    case '2':
      await testPDFParsing();
      break;
    case '3':
      await testFullValidation();
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

  rl.close();
  process.exit(0);
}

main().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
});