// backend/src/bot/pdf-parser.js
// Parse PDF BC 2.3/4.0 documents with OCR support

const pdfParse = require('pdf-parse');
const Tesseract = require('tesseract.js');
const { pdfToPng } = require('pdf-to-png-converter');
const sharp = require('sharp');
const logger = require('../utils/logger');
const OCRCleanup = require('../utils/cleanup-ocr');
const fs = require('fs');
const path = require('path');

class PDFParser {
  constructor(pdfPath) {
    this.pdfPath = pdfPath;
    this.pdfData = null;
    this.fullText = '';
    this.items = [];
    this.isScanned = false;
  }

  /**
   * Load and parse PDF file
   */
  async load() {
    try {
      logger.info(`Loading PDF: ${this.pdfPath}`);
      
      const dataBuffer = fs.readFileSync(this.pdfPath);
      this.pdfData = await pdfParse(dataBuffer);
      this.fullText = this.pdfData.text;

      logger.success(`✅ PDF loaded: ${this.pdfData.numpages} pages`);
      
      // Check if PDF has extractable text
      const textLength = this.fullText.trim().length;
      if (textLength < 100) {
        logger.warn('PDF appears to be scanned (no extractable text)');
        logger.info('Will use OCR to extract text...');
        this.isScanned = true;
        await this.extractTextWithOCR();
      }
      
      return true;
    } catch (error) {
      logger.error('Failed to load PDF:', error.message);
      throw error;
    }
  }

  /**
   * Load PDF from buffer (for Puppeteer downloaded PDFs)
   */
  async loadFromBuffer(buffer) {
    try {
      logger.info('Loading PDF from buffer...');
      
      this.pdfData = await pdfParse(buffer);
      this.fullText = this.pdfData.text;

      logger.success(`✅ PDF loaded: ${this.pdfData.numpages} pages`);
      
      // Check if scanned
      const textLength = this.fullText.trim().length;
      if (textLength < 100) {
        logger.warn('PDF appears to be scanned, attempting OCR...');
        this.isScanned = true;
        
        // Save buffer to temp file for OCR
        const tempPath = path.join(__dirname, '../../logs', `temp-${Date.now()}.pdf`);
        fs.writeFileSync(tempPath, buffer);
        this.pdfPath = tempPath;
        
        await this.extractTextWithOCR();
        
        // Clean up temp file
        fs.unlinkSync(tempPath);
      }
      
      return true;
    } catch (error) {
      logger.error('Failed to load PDF from buffer:', error.message);
      throw error;
    }
  }

  /**
   * Extract text using OCR (Tesseract) with enhanced accuracy for scanned documents
   */
  async extractTextWithOCR() {
    try {
      logger.info('Starting enhanced OCR text extraction...');
      logger.info('This may take 30-90 seconds depending on PDF size...');

      // Ensure temp folder exists and use absolute path to prevent directory creation issues
      // Use project root /logs/ocr-temp/ instead of /backend/logs/ocr-temp/
      const tempFolder = path.resolve(__dirname, '../../../logs/ocr-temp');
      if (!fs.existsSync(tempFolder)) {
        fs.mkdirSync(tempFolder, { recursive: true });
      }

      // Convert PDF to images with higher resolution
      const pngPages = await pdfToPng(this.pdfPath, {
        disableFontFace: false,
        useSystemFonts: false,
        viewportScale: 3.0, // Increased from 2.0 for better quality
        outputFolder: tempFolder  // Use absolute path
      });

      logger.info(`Converted PDF to ${pngPages.length} images`);

      // Process pages in parallel (batches of 3 to avoid memory issues)
      const batchSize = 3;
      let ocrText = '';

      for (let i = 0; i < pngPages.length; i += batchSize) {
        const batch = pngPages.slice(i, Math.min(i + batchSize, pngPages.length));
        const batchResults = await Promise.all(
          batch.map((page, idx) => this.processPageWithOCR(page, i + idx + 1, pngPages.length))
        );

        // Combine results in order
        ocrText += batchResults.join('\n\n');

        // Delete PNG files for this batch immediately after processing
        for (const page of batch) {
          const imagePath = path.join(tempFolder, page.name);
          try {
            if (fs.existsSync(imagePath)) {
              fs.unlinkSync(imagePath);
              logger.debug(`Deleted temp PNG: ${page.name}`);
            }
          } catch (err) {
            logger.warn(`Failed to delete PNG ${page.name}:`, err.message);
          }
        }
      }

      // Clean up temp folder (should be empty now)
      if (fs.existsSync(tempFolder)) {
        const remainingFiles = fs.readdirSync(tempFolder);
        if (remainingFiles.length > 0) {
          logger.warn(`Found ${remainingFiles.length} remaining files in ocr-temp, cleaning up...`);
        }
        fs.rmSync(tempFolder, { recursive: true, force: true });
        logger.debug('Cleaned up ocr-temp folder');
      }

      // Post-process OCR text to fix common errors
      ocrText = this.postProcessOCRText(ocrText);

      this.fullText = ocrText;
      logger.success(`✅ Enhanced OCR extraction complete (${ocrText.length} characters)`);

      // Save OCR result for debugging
      const ocrLogPath = path.join(__dirname, '../../logs', `ocr-result-${Date.now()}.txt`);
      fs.writeFileSync(ocrLogPath, ocrText);
      logger.info(`OCR result saved to: ${ocrLogPath}`);

      // Auto-cleanup old OCR files (run in background, don't wait)
      this.runCleanupAsync();

      return ocrText;
    } catch (error) {
      logger.error('OCR extraction failed:', error.message);
      throw new Error('Cannot extract text from scanned PDF. OCR failed.');
    }
  }

  /**
   * Process a single page with preprocessing and OCR
   */
  async processPageWithOCR(page, pageNum, totalPages) {
    try {
      logger.info(`OCR processing page ${pageNum}/${totalPages}...`);

      // Preprocess image for better OCR accuracy
      const preprocessedImage = await this.preprocessImage(page.content);

      // Configure Tesseract paths to keep language data organized
      const langPath = path.resolve(__dirname, '../../tessdata');

      // Ensure tessdata folder exists
      if (!fs.existsSync(langPath)) {
        fs.mkdirSync(langPath, { recursive: true });
      }

      // Run OCR with Indonesian + English language support
      const result = await Tesseract.recognize(
        preprocessedImage,
        'ind+eng', // Indonesian + English for better accuracy
        {
          langPath: langPath,  // Specify where to store/load language data
          logger: m => {
            if (m.status === 'recognizing text') {
              logger.debug(`Page ${pageNum} OCR progress: ${Math.round(m.progress * 100)}%`);
            }
          }
        }
      );

      // Filter by confidence threshold
      const minConfidence = 30; // Lowered to capture more text, will clean up later
      let filteredText = '';

      if (result.data.words) {
        result.data.words.forEach(word => {
          if (word.confidence >= minConfidence) {
            filteredText += word.text + ' ';
          } else {
            logger.debug(`Skipped low confidence word: "${word.text}" (${word.confidence.toFixed(1)}%)`);
          }
        });
      } else {
        filteredText = result.data.text;
      }

      const avgConfidence = result.data.confidence || 0;
      logger.success(`✅ Page ${pageNum} OCR complete (confidence: ${avgConfidence.toFixed(1)}%)`);

      // Note: PNG cleanup is now handled after batch completes (in extractTextWithOCR)
      // This prevents race conditions with parallel processing

      return filteredText;
    } catch (pageError) {
      logger.error(`OCR failed for page ${pageNum}:`, pageError.message);
      return '';
    }
  }

  /**
   * Preprocess image for better OCR accuracy
   */
  async preprocessImage(imageBuffer) {
    try {
      // Apply image enhancements:
      // 1. Convert to grayscale
      // 2. Increase contrast
      // 3. Sharpen
      // 4. Remove noise
      const processed = await sharp(imageBuffer)
        .grayscale() // Convert to grayscale for better OCR
        .normalize() // Normalize contrast
        .sharpen() // Sharpen edges
        .threshold(128) // Binarize image (black & white)
        .toBuffer();

      return processed;
    } catch (error) {
      logger.warn('Image preprocessing failed, using original image:', error.message);
      return imageBuffer;
    }
  }

  /**
   * Post-process OCR text to fix common errors
   */
  postProcessOCRText(text) {
    try {
      let cleaned = text;

      // Fix common word/phrase errors FIRST (before character replacements)
      const phraseReplacements = {
        // Common word fixes for Indonesian
        'Kode 8rg': 'Kode Brg',
        'Kode 8RG': 'Kode Brg',
        'Pos TarifI': 'Pos Tarif',
        'Pos TarifHS': 'Pos Tarif/HS',
        'Pos Taril': 'Pos Tarif',
        'Jurnlah': 'Jumlah',
        'PEMER1TAHUAN': 'PEMBERITAHUAN',
        'PEM8ERITAHUAN': 'PEMBERITAHUAN',
        '1MPOR': 'IMPOR',
        'IMP0R': 'IMPOR',
        '8ARANG': 'BARANG',
        'LEMRAR': 'LEMBAR',
        'LANJIJTAN': 'LANJUTAN',
      };

      // Apply phrase replacements first
      for (const [wrong, correct] of Object.entries(phraseReplacements)) {
        const regex = new RegExp(wrong, 'gi');
        cleaned = cleaned.replace(regex, correct);
      }

      // REMOVED: Global character replacements that were breaking keywords
      // They were converting "PEMBERITAHUAN IMPOR" to "PEM8ER1TAHUAN 1MP0R"
      // Character-level fixes should only be done in numeric context during parsing

      // Fix spacing issues
      cleaned = cleaned.replace(/\s{2,}/g, ' '); // Multiple spaces to single

      // Remove excessive newlines (more than 3 consecutive)
      cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');

      // Trim each line
      cleaned = cleaned.split('\n').map(line => line.trim()).join('\n');

      logger.info('OCR text post-processing complete');
      return cleaned;
    } catch (error) {
      logger.warn('Post-processing failed, using original text:', error.message);
      return text;
    }
  }

  /**
   * Check if this is a BC 2.3 or BC 4.0 document
   */
  detectDocumentType() {
    // Check for BC 2.3 variations
    const bc23Patterns = ['BC 2.3', 'BC 23', 'BC23', 'BC2.3'];
    for (const pattern of bc23Patterns) {
      if (this.fullText.includes(pattern)) {
        logger.info(`Document type: BC 2.3 (matched: ${pattern})`);
        return 'BC2.3';
      }
    }

    // Check for BC 4.0 variations
    const bc40Patterns = ['BC 4.0', 'BC 40', 'BC40', 'BC4.0'];
    for (const pattern of bc40Patterns) {
      if (this.fullText.includes(pattern)) {
        logger.info(`Document type: BC 4.0 (matched: ${pattern})`);
        return 'BC4.0';
      }
    }

    // Show sample for debugging
    logger.warn('Unknown document type. Checking text sample...');
    const bcMatches = this.fullText.match(/BC[\s\.]?[\d.]+/g);
    if (bcMatches && bcMatches.length > 0) {
      logger.warn(`Found BC patterns: ${bcMatches.slice(0, 3).join(', ')}`);
    }

    return 'Unknown';
  }

  /**
   * Find table section in PDF - with debug logging
   */
  findTableSection() {
    const keywords = [
      'LEMBAR LANJUTAN',
      'PEMBERITAHUAN IMPOR BARANG UNTUK DITIMBUN',
      'PEMBERITAHUAN IMPOR',
      'Pos Tarif/HS',
      'Pos TarifHS',
      'Pos Tarif HS',
      'Pos Taril/HS',  // OCR typo variation
      'BC23',
      'BC 23',
      'BC 2.3',
      'TEMPAT PENIMBUNAN BERIKAT'
    ];

    let foundCount = 0;
    const foundKeywords = [];

    for (const keyword of keywords) {
      if (this.fullText.includes(keyword)) {
        logger.debug(`Found keyword: ${keyword}`);
        foundKeywords.push(keyword);
        foundCount++;
      }
    }

    if (foundCount > 0) {
      logger.debug(`Table section detected (${foundCount} keywords found: ${foundKeywords.join(', ')})`);
      return true;
    }

    // If no keywords found, show sample of text for debugging
    logger.warn('No table keywords found. Showing text sample...');
    const sample = this.fullText.substring(0, 500).replace(/\n/g, ' ');
    logger.warn(`Text sample: ${sample}`);

    // Try fuzzy matching - check if ANY item-like pattern exists
    // Pattern: number followed by digits (could be HS code)
    const itemPattern = /[\|\s]*\d+\s+[\[\(]?\d{4}[.,]?\d{2,3}[.,]?\d{3,4}/;
    if (itemPattern.test(this.fullText)) {
      logger.warn('Found item-like pattern, proceeding with parsing...');
      return true;
    }

    logger.error('Table section not found in PDF');
    return false;
  }

  /**
   * Parse items from PDF - handles both digital PDF and OCR formats
   */
  parseItems() {
    try {
      logger.info('Parsing items from PDF...');

      if (!this.findTableSection()) {
        throw new Error('Table section not found');
      }

      // Try multiple parsing strategies based on PDF format

      // Strategy 1: Original format (number followed by "Pos Tarif/HS")
      const itemPattern = /(\d+)\s+Pos Tarif\/HS/g;
      const matches = [...this.fullText.matchAll(itemPattern)];

      logger.debug(`Found ${matches.length} items using "Pos Tarif/HS" pattern`);

      this.items = [];

      if (matches.length > 0) {
        // Use original parsing for digital PDF
        for (let i = 0; i < matches.length; i++) {
          const match = matches[i];
          const seri = parseInt(match[1]);
          const startIndex = match.index;
          const endIndex = i < matches.length - 1 ? matches[i + 1].index : this.fullText.length;

          const itemText = this.fullText.substring(startIndex, endIndex);

          try {
            const itemData = this.parseItemText(seri, itemText);
            if (itemData) {
              this.items.push(itemData);
              logger.debug(`Parsed Seri ${seri}: ${itemData.kodeBrg} - ${itemData.qty} ${itemData.satuan}`);
            }
          } catch (error) {
            logger.warn(`Failed to parse item ${seri}:`, error.message);
          }
        }
      } else {
        // Strategy 2: OCR format (item number followed by HS code in table)
        logger.info('Trying OCR table format parsing...');
        this.parseItemsFromOCRTable();
      }

      logger.success(`✅ Parsed ${this.items.length} items from PDF`);
      return this.items;
    } catch (error) {
      logger.error('Failed to parse PDF items:', error.message);
      throw error;
    }
  }

  /**
   * Parse items from OCR table format
   * Format: "1 8479.903000 ... 1.0000 Piece (PCE)"
   * Also handles: "| 1 [8479.903000" and variations
   */
  parseItemsFromOCRTable() {
    try {
      // Pattern variations in real OCR:
      // "1 8479.903000" - normal (10 chars with dot)
      // "| 1 [8479.903000" - with pipe and bracket
      // "2 8479903000" - no dots (10 digits)
      // "5 [8479.90.3000" - extra dot
      // "7 [3926905900" - 10 digits no dots
      const lines = this.fullText.split('\n');

      // Pattern: multiple optional pipes/spaces, item number, optional bracket, HS code
      // Matches: 1234.567890 or 1234567890 or 1234.56.7890 or 1234567890 (10 digits)
      // Handles: "| | 7 [3926905900" (double pipe)
      const itemLinePattern = /^[\|\s]*(\d+)\s+\[?(\d{4}[.,]?\d{2,3}[.,]?\d{3,4}|\d{10})/;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const match = line.match(itemLinePattern);

        if (match) {
          const seri = parseInt(match[1]);
          const hsCode = match[2];

          // Get the full item block (current line + next few lines until next item)
          let itemBlock = line + '\n';
          let j = i + 1;
          while (j < lines.length && !lines[j].trim().match(itemLinePattern)) {
            itemBlock += lines[j] + '\n';
            j++;
            if (j - i > 10) break; // Limit to 10 lines per item
          }

          try {
            const itemData = this.parseOCRItemText(seri, hsCode, itemBlock);
            if (itemData) {
              this.items.push(itemData);
              logger.debug(`Parsed Seri ${seri}: ${itemData.kodeBrg} - ${itemData.qty} ${itemData.satuan}`);
            }
          } catch (error) {
            logger.warn(`Failed to parse OCR item ${seri}:`, error.message);
          }
        }
      }

      logger.info(`OCR table parsing found ${this.items.length} items`);
    } catch (error) {
      logger.error('OCR table parsing failed:', error.message);
    }
  }

  /**
   * Parse OCR item text block
   * Format example:
   * "1 8479.903000 Tidak Japan (JP) BM: 5% DTG:100% 1.0000 Piece (PCE) 24.17
   *  COMPACT FLASH (BUFFALO RC Berhub. Cukai:- 0.0200 Kg"
   * Also handles: "| 1 [8479903000" and other variations
   */
  parseOCRItemText(seri, hsCode, itemBlock) {
    try {
      // Normalize HS code: remove brackets, ensure proper format
      // "8479903000" → "8479.903000"
      // "8479.90.3000" → "8479.903000"
      let kodeBrg = hsCode.replace(/[\[\]]/g, ''); // Remove brackets

      // If no dots, add them in proper positions (4.6 format)
      if (!kodeBrg.includes('.') && kodeBrg.length >= 10) {
        kodeBrg = kodeBrg.substring(0, 4) + '.' + kodeBrg.substring(4);
      }
      // If has dots but wrong format (e.g., "8479.90.3000"), normalize it
      else if (kodeBrg.match(/^\d{4}\.\d{2}\.\d{4}$/)) {
        kodeBrg = kodeBrg.replace(/^(\d{4})\.(\d{2})\.(\d{4})$/, '$1.$2$3');
      }

      // Extract quantity and unit
      // Pattern: "1.0000 Piece (PCE)" or "3.0000 Set (SET)"
      const qtyPattern = /([\d.,]+)\s+(Piece|Set|Kg|Unit|Pcs|PCS|SET|PIECE|KG|UNIT)\s*\(([A-Z]+)\)/i;
      const qtyMatch = itemBlock.match(qtyPattern);

      if (!qtyMatch) {
        throw new Error('Quantity not found in OCR text');
      }

      // Parse quantity
      // Smart parsing: distinguish between thousand separator and decimal
      // Format: "1.0000" (decimal) vs "3.150,0000" (thousand separator + decimal)
      let qtyString = qtyMatch[1];

      // If format is like "3.150,0000" (dot for thousand, comma for decimal)
      if (qtyString.includes('.') && qtyString.includes(',')) {
        qtyString = qtyString.replace(/\./g, '').replace(',', '.');
      }
      // If format is like "1.0000" with 4+ decimals (likely decimal point, not thousand separator)
      else if (qtyString.match(/^\d+\.\d{4,}$/)) {
        // Keep as is - it's a decimal point
        qtyString = qtyString;
      }
      // If format is like "3.150" with 3 or fewer decimals (might be thousand separator)
      else if (qtyString.match(/^\d{1,3}\.\d{3}$/)) {
        // This could be "3.150" meaning 3150 (thousand separator)
        qtyString = qtyString.replace(/\./g, '');
      }
      // Default: replace comma with dot for decimal
      else {
        qtyString = qtyString.replace(',', '.');
      }

      const qty = parseFloat(qtyString);
      const satuan = qtyMatch[3].trim(); // Use the abbreviation in parentheses

      if (isNaN(qty)) {
        throw new Error(`Invalid qty: ${qtyMatch[1]}`);
      }

      // Extract description (Uraian)
      // Description is typically on the second line
      const lines = itemBlock.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      let uraian = '';

      if (lines.length > 1) {
        // Look for description line (usually contains uppercase text and product name)
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          // Description usually doesn't start with metadata keywords
          if (line && !line.match(/^(Kd barang|Langsung|Carton|BM:|Cukai|PPN|PPnBM|PPh|Tidak|Berhub|\d+\s+Carton)/i)) {
            // Extract full description (everything before "Berhub" or "Langsung")
            const descMatch = line.match(/^(.+?)(?:\s+Berhub|\s+Langsung|$)/);
            if (descMatch && descMatch[1].length > 3) {
              uraian = descMatch[1].trim();
              break;
            }
          }
        }
      }

      // If no description found in second line, try to extract from first line after HS code
      if (!uraian) {
        // Look in the first line, between HS code and quantity
        const firstLine = lines[0];
        // Try to find text between country code and quantity or BM:
        const patterns = [
          /\([A-Z]{2}\)\s+(.+?)\s+(?:BM:|DTG:|\d+[.,]\d+\s+(?:Piece|Set|Kg))/i,
          /Tidak\s+[A-Z][a-z]+\s+\([A-Z]{2}\)\s+(.+?)\s+(?:BM:|DTG:)/i
        ];

        for (const pattern of patterns) {
          const match = firstLine.match(pattern);
          if (match && match[1].length > 3) {
            uraian = match[1].trim();
            break;
          }
        }
      }

      // Clean up description: remove leading pipe, brackets, etc
      uraian = uraian.replace(/^\|+\s*/, '').trim();

      return {
        seri: seri,
        kodeBrg: kodeBrg,
        uraian: uraian,
        qty: qty,
        satuan: satuan
      };
    } catch (error) {
      logger.error(`Error parsing OCR item text for seri ${seri}:`, error.message);
      return null;
    }
  }

  /**
   * Parse individual item text block (for digital PDF)
   */
  parseItemText(seri, itemText) {
    try {
      // Extract Kode Brg
      const kodeMatch = itemText.match(/Kode Brg\s*:\s*(\w+)/);
      if (!kodeMatch) {
        throw new Error('Kode Brg not found');
      }
      const kodeBrg = kodeMatch[1].trim();

      // Extract Uraian (description)
      const uraianMatch = itemText.match(/Kode Brg\s*:\s*\w+\s+(.+?)(?=Kemasan:|Merk:|$)/s);
      const uraian = uraianMatch ? uraianMatch[1].trim().replace(/\s+/g, ' ') : '';

      // Extract Jumlah (Qty)
      // Pattern: "- 3.150,0000" or "- 470,0000"
      // Looking for pattern: dash, space, number with dots/commas, newline, dash, space, unit
      const jumlahMatch = itemText.match(/-\s*([\d.,]+)\s*\n\s*-\s*(\w+)/);
      
      if (!jumlahMatch) {
        // Try alternative pattern (sometimes formatting is different)
        const altMatch = itemText.match(/Jumlah[:\s]*([\d.,]+)\s*(\w+)/i);
        if (!altMatch) {
          throw new Error('Jumlah not found');
        }
        
        const qtyString = altMatch[1].replace(/\./g, '').replace(',', '.');
        const qty = parseFloat(qtyString);
        const satuan = altMatch[2].trim();

        return {
          seri: seri,
          kodeBrg: kodeBrg,
          uraian: uraian,
          qty: qty,
          satuan: satuan
        };
      }

      // Parse qty: "3.150,0000" → 3150
      const qtyString = jumlahMatch[1]
        .replace(/\./g, '')     // Remove dots (thousand separator)
        .replace(',', '.');      // Replace comma with dot (decimal)
      
      const qty = parseFloat(qtyString);
      const satuan = jumlahMatch[2].trim();

      if (isNaN(qty)) {
        throw new Error(`Invalid qty: ${jumlahMatch[1]}`);
      }

      return {
        seri: seri,
        kodeBrg: kodeBrg,
        uraian: uraian,
        qty: qty,
        satuan: satuan
      };
    } catch (error) {
      logger.error(`Error parsing item text for seri ${seri}:`, error.message);
      return null;
    }
  }

  /**
   * Find item by Seri Barang
   */
  findBySeri(seri) {
    const item = this.items.find(i => i.seri === parseInt(seri));
    
    if (!item) {
      logger.warn(`Seri ${seri} not found in PDF`);
      return null;
    }

    return item;
  }

  /**
   * Find item by Kode Brg
   */
  findByKodeBarang(kodeBrg) {
    const items = this.items.filter(i => 
      i.kodeBrg.toUpperCase() === kodeBrg.toUpperCase()
    );

    if (items.length === 0) {
      logger.warn(`Kode Brg ${kodeBrg} not found in PDF`);
      return null;
    }

    return items;
  }

  /**
   * Get all items
   */
  getItems() {
    return this.items;
  }

  /**
   * Get summary
   */
  getSummary() {
    return {
      totalItems: this.items.length,
      totalQty: this.items.reduce((sum, item) => sum + item.qty, 0),
      kodeBrgList: [...new Set(this.items.map(i => i.kodeBrg))],
      seriRange: {
        min: Math.min(...this.items.map(i => i.seri)),
        max: Math.max(...this.items.map(i => i.seri))
      }
    };
  }

  /**
   * Run cleanup asynchronously (don't wait for completion)
   */
  runCleanupAsync() {
    // Run cleanup in background without blocking
    setImmediate(async () => {
      try {
        logger.debug('Running auto-cleanup for OCR files...');
        const cleanup = new OCRCleanup({
          maxAge: 7,      // Keep files for 7 days
          maxFiles: 50,   // Keep max 50 recent files
          dryRun: false
        });

        const results = await cleanup.cleanupOCRResults();

        if (results.deleted > 0) {
          logger.info(`Auto-cleanup: Deleted ${results.deleted} old OCR files, kept ${results.kept}`);
        } else {
          logger.debug('Auto-cleanup: No old OCR files to delete');
        }
      } catch (error) {
        // Don't throw error - cleanup failure should not break parsing
        logger.warn('Auto-cleanup failed (non-critical):', error.message);
      }
    });
  }
}

module.exports = PDFParser;