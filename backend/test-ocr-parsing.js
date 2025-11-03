// Test OCR parsing with sample file
const PDFParser = require('./src/bot/pdf-parser');
const logger = require('./src/utils/logger');
const fs = require('fs');

async function testOCRParsing() {
  try {
    console.log('\n=== Testing OCR Table Parsing ===\n');

    // Read real OCR text
    const sampleText = fs.readFileSync('./logs/real-ocr-sample.txt', 'utf8');

    // Create parser instance
    const parser = new PDFParser('dummy.pdf');
    parser.fullText = sampleText;
    parser.pdfData = { numpages: 1 };
    parser.isScanned = true;

    // Try parsing
    console.log('Full text length:', sampleText.length);
    console.log('\nAttempting to parse items...\n');

    const items = parser.parseItems();

    console.log('\n=== Results ===');
    console.log('Total items parsed:', items.length);

    if (items.length > 0) {
      console.log('\nParsed items:');
      items.forEach((item, idx) => {
        console.log(`\n${idx + 1}. Seri: ${item.seri}`);
        console.log(`   Kode Brg: ${item.kodeBrg}`);
        console.log(`   Uraian: ${item.uraian}`);
        console.log(`   Qty: ${item.qty} ${item.satuan}`);
      });

      console.log('\n✅ OCR parsing SUCCESS!');
    } else {
      console.log('\n❌ No items parsed - parsing failed');

      // Debug: show text sample
      console.log('\nText sample (first 500 chars):');
      console.log(sampleText.substring(0, 500));
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

testOCRParsing();
