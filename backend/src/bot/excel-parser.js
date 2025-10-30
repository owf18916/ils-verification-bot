// backend/src/bot/excel-parser.js
// Parse Excel files from ILS system

const ExcelJS = require('exceljs');
const logger = require('../utils/logger');
const path = require('path');

class ExcelParser {
  constructor(filePath) {
    this.filePath = filePath;
    this.workbook = null;
    this.worksheet = null;
    this.items = [];
  }

  /**
   * Load Excel file
   */
  async load() {
    try {
      logger.info(`Loading Excel file: ${path.basename(this.filePath)}`);
      
      this.workbook = new ExcelJS.Workbook();
      await this.workbook.xlsx.readFile(this.filePath);
      
      // Get first worksheet
      this.worksheet = this.workbook.worksheets[0];
      
      if (!this.worksheet) {
        throw new Error('No worksheet found in Excel file');
      }

      logger.success(`✅ Excel loaded: ${this.worksheet.name}`);
      logger.info(`Total rows: ${this.worksheet.rowCount}`);
      
      return true;
    } catch (error) {
      logger.error('Failed to load Excel:', error.message);
      throw error;
    }
  }

  /**
   * Get cell value safely
   */
  getCellValue(row, col) {
    try {
      const cell = this.worksheet.getCell(`${col}${row}`);
      return cell.value || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse ticket number from Row 2
   */
  getTicketNumber() {
    try {
      // Row 2: "Ticket Number : TIKET-1889"
      const cellValue = this.getCellValue(2, 'A');
      
      if (!cellValue) {
        logger.warn('Ticket number not found in Row 2');
        return null;
      }

      const ticketString = cellValue.toString();
      const match = ticketString.match(/TIKET[- ]?(\d+)/i);
      
      if (match) {
        const ticketNo = match[1];
        logger.info(`Ticket Number: ${ticketNo}`);
        return ticketNo;
      }

      logger.warn('Could not parse ticket number from:', ticketString);
      return null;
    } catch (error) {
      logger.error('Error parsing ticket number:', error.message);
      return null;
    }
  }

  /**
   * Parse all items starting from Row 5
   * Columns: B=ItemCode, C=ItemName, J=Qty, AD=AjuNumber, AG=SeriBarang
   */
  parseItems() {
    try {
      logger.info('Parsing items from Excel...');
      
      this.items = [];
      let rowNum = 5; // Start from row 5 (after headers)
      let emptyRowCount = 0;
      const maxEmptyRows = 3; // Stop after 3 consecutive empty rows

      while (emptyRowCount < maxEmptyRows && rowNum <= this.worksheet.rowCount) {
        const itemCode = this.getCellValue(rowNum, 'B');
        
        // If Item Code is empty, increment empty counter
        if (!itemCode || itemCode.toString().trim() === '') {
          emptyRowCount++;
          rowNum++;
          continue;
        }

        // Reset empty counter if we found data
        emptyRowCount = 0;

        const itemName = this.getCellValue(rowNum, 'C');
        const qty = this.getCellValue(rowNum, 'J');
        const ajuNumber = this.getCellValue(rowNum, 'AD');
        const seriBarang = this.getCellValue(rowNum, 'AG');

        // Parse qty to number
        let qtyNum = 0;
        if (qty !== null) {
          qtyNum = parseFloat(qty.toString().replace(/,/g, ''));
          if (isNaN(qtyNum)) {
            logger.warn(`Invalid qty at row ${rowNum}: ${qty}`);
            qtyNum = 0;
          }
        }

        // Parse seri to number
        let seriNum = 0;
        if (seriBarang !== null) {
          seriNum = parseInt(seriBarang.toString());
          if (isNaN(seriNum)) {
            logger.warn(`Invalid seri at row ${rowNum}: ${seriBarang}`);
            seriNum = 0;
          }
        }

        const item = {
          rowNumber: rowNum,
          itemCode: itemCode ? itemCode.toString().trim() : '',
          itemName: itemName ? itemName.toString().trim() : '',
          qty: qtyNum,
          ajuNumber: ajuNumber ? ajuNumber.toString().trim() : '',
          seriBarang: seriNum
        };

        // Validate item has minimum required data
        if (item.itemCode && item.seriBarang > 0) {
          this.items.push(item);
          logger.debug(`Row ${rowNum}: ${item.itemCode} | Seri: ${item.seriBarang} | Qty: ${item.qty}`);
        } else {
          logger.warn(`Row ${rowNum}: Skipped (missing itemCode or seriBarang)`);
        }

        rowNum++;
      }

      logger.success(`✅ Parsed ${this.items.length} items from Excel`);
      
      if (this.items.length === 0) {
        logger.warn('No valid items found in Excel');
      }

      return this.items;
    } catch (error) {
      logger.error('Failed to parse items:', error.message);
      throw error;
    }
  }

  /**
   * Group items by Aju Number
   */
  groupByAju() {
    const grouped = {};
    
    this.items.forEach(item => {
      if (!grouped[item.ajuNumber]) {
        grouped[item.ajuNumber] = [];
      }
      grouped[item.ajuNumber].push(item);
    });

    logger.info(`Items grouped into ${Object.keys(grouped).length} Aju numbers`);
    return grouped;
  }

  /**
   * Check for duplicate Seri Barang within same Aju
   */
  checkDuplicateSeri() {
    const grouped = this.groupByAju();
    const duplicates = [];

    Object.keys(grouped).forEach(ajuNumber => {
      const items = grouped[ajuNumber];
      const seriCount = {};

      items.forEach(item => {
        if (!seriCount[item.seriBarang]) {
          seriCount[item.seriBarang] = [];
        }
        seriCount[item.seriBarang].push(item);
      });

      // Check for duplicates
      Object.keys(seriCount).forEach(seri => {
        if (seriCount[seri].length > 1) {
          duplicates.push({
            ajuNumber: ajuNumber,
            seriBarang: parseInt(seri),
            items: seriCount[seri],
            count: seriCount[seri].length
          });
        }
      });
    });

    if (duplicates.length > 0) {
      logger.warn(`Found ${duplicates.length} duplicate seri cases`);
      duplicates.forEach(dup => {
        logger.warn(`  Aju ${dup.ajuNumber}, Seri ${dup.seriBarang}: ${dup.count} items`);
      });
    }

    return duplicates;
  }

  /**
   * Get summary statistics
   */
  getSummary() {
    const summary = {
      totalItems: this.items.length,
      uniqueAju: new Set(this.items.map(i => i.ajuNumber)).size,
      totalQty: this.items.reduce((sum, item) => sum + item.qty, 0),
      itemCodes: [...new Set(this.items.map(i => i.itemCode))],
      seriRange: {
        min: Math.min(...this.items.map(i => i.seriBarang)),
        max: Math.max(...this.items.map(i => i.seriBarang))
      }
    };

    return summary;
  }

  /**
   * Get all parsed items
   */
  getItems() {
    return this.items;
  }

  /**
   * Get workbook for writing
   */
  getWorkbook() {
    return this.workbook;
  }

  /**
   * Get worksheet for writing
   */
  getWorksheet() {
    return this.worksheet;
  }
}

module.exports = ExcelParser;