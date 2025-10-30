// backend/src/bot/pdf-parser.js
// Parse PDF BC 2.3/4.0 documents with OCR support

const pdfParse = require('pdf-parse');
const Tesseract = require('tesseract.js');
const { pdfToPng } = require('pdf-to-png-converter');
const logger = require('../utils/logger');
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
        const tempPath = path.join(__dirname, '../../../logs', `temp-${Date.now()}.pdf`);
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
   * Extract text using OCR (Tesseract)
   */
  async extractTextWithOCR() {
    try {
      logger.info('Starting OCR text extraction...');
      logger.info('This may take 30-60 seconds depending on PDF size...');
      
      // Convert PDF to images
      const pngPages = await pdfToPng(this.pdfPath, {
        disableFontFace: false,
        useSystemFonts: false,
        viewportScale: 2.0,
        outputFolder: path.join(__dirname, '../../../logs/ocr-temp')
      });

      logger.info(`Converted PDF to ${pngPages.length} images`);

      // OCR each page
      let ocrText = '';
      for (let i = 0; i < pngPages.length; i++) {
        logger.info(`OCR processing page ${i + 1}/${pngPages.length}...`);
        
        try {
          const result = await Tesseract.recognize(
            pngPages[i].content,
            'eng', // Use English language
            {
              logger: m => {
                if (m.status === 'recognizing text') {
                  logger.debug(`OCR progress: ${Math.round(m.progress * 100)}%`);
                }
              }
            }
          );
          
          ocrText += result.data.text + '\n\n';
          logger.success(`✅ Page ${i + 1} OCR complete`);
          
          // Clean up temp image
          const imagePath = path.join(__dirname, '../../../logs/ocr-temp', pngPages[i].name);
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
          }
        } catch (pageError) {
          logger.error(`OCR failed for page ${i + 1}:`, pageError.message);
        }
      }

      // Clean up temp folder
      const tempFolder = path.join(__dirname, '../../../logs/ocr-temp');
      if (fs.existsSync(tempFolder)) {
        fs.rmSync(tempFolder, { recursive: true, force: true });
      }

      this.fullText = ocrText;
      logger.success(`✅ OCR extraction complete (${ocrText.length} characters)`);
      
      // Save OCR result for debugging
      const ocrLogPath = path.join(__dirname, '../../../logs', `ocr-result-${Date.now()}.txt`);
      fs.writeFileSync(ocrLogPath, ocrText);
      logger.info(`OCR result saved to: ${ocrLogPath}`);
      
      return ocrText;
    } catch (error) {
      logger.error('OCR extraction failed:', error.message);
      throw new Error('Cannot extract text from scanned PDF. OCR failed.');
    }
  }

  /**
   * Check if this is a BC 2.3 or BC 4.0 document
   */
  detectDocumentType() {
    if (this.fullText.includes('BC 2.3') || this.fullText.includes('BC 23')) {
      logger.info('Document type: BC 2.3');
      return 'BC2.3';
    } else if (this.fullText.includes('BC 4.0') || this.fullText.includes('BC 40')) {
      logger.info('Document type: BC 4.0');
      return 'BC4.0';
    }
    logger.warn('Unknown document type');
    return 'Unknown';
  }

  /**
   * Find table section in PDF
   */
  findTableSection() {
    const keyword = 'LEMBAR LANJUTAN';
    const keywordAlt = 'PEMBERITAHUAN IMPOR BARANG UNTUK DITIMBUN';
    
    if (this.fullText.includes(keyword)) {
      logger.debug('Found table keyword: LEMBAR LANJUTAN');
      return true;
    }

    if (this.fullText.includes(keywordAlt)) {
      logger.debug('Found table keyword: PEMBERITAHUAN IMPOR');
      return true;
    }

    logger.error('Table section not found in PDF');
    return false;
  }

  /**
   * Parse items from PDF by splitting on "Pos Tarif/HS"
   */
  parseItems() {
    try {
      logger.info('Parsing items from PDF...');

      if (!this.findTableSection()) {
        throw new Error('Table section not found');
      }

      // Split by item pattern (number followed by "Pos Tarif/HS")
      const itemPattern = /(\d+)\s+Pos Tarif\/HS/g;
      const matches = [...this.fullText.matchAll(itemPattern)];

      logger.debug(`Found ${matches.length} items in PDF`);

      this.items = [];

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

      logger.success(`✅ Parsed ${this.items.length} items from PDF`);
      return this.items;
    } catch (error) {
      logger.error('Failed to parse PDF items:', error.message);
      throw error;
    }
  }

  /**
   * Parse individual item text block
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
}

module.exports = PDFParser;