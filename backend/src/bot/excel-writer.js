// backend/src/bot/excel-writer.js
// Write validation results back to Excel

const logger = require('../utils/logger');
const path = require('path');

class ExcelWriter {
  constructor(excelParser) {
    this.parser = excelParser;
    this.workbook = excelParser.getWorkbook();
    this.worksheet = excelParser.getWorksheet();
  }

  /**
   * Setup header row with new columns
   */
  setupHeaders() {
    try {
      logger.info('Setting up result columns...');

      const headers = {
        'AH': 'Verifikasi Item Code',
        'AI': 'Verifikasi Qty',
        'AJ': 'BC Kode Barang',
        'AK': 'BC Qty',
        'AL': 'BC Satuan',
        'AM': 'Issues'
      };

      // Add headers to row 4
      Object.keys(headers).forEach(col => {
        const cell = this.worksheet.getCell(`${col}4`);
        cell.value = headers[col];
        cell.font = { bold: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE0E0E0' }
        };
      });

      logger.success('✅ Headers added');
      return true;
    } catch (error) {
      logger.error('Failed to setup headers:', error.message);
      return false;
    }
  }

  /**
   * Write validation result for a single row
   */
  writeResult(rowNumber, validationResult) {
    try {
      const {
        validation,
        bcData,
        issues
      } = validationResult;

      // Column AH: Verifikasi Item Code
      const cellAH = this.worksheet.getCell(`AH${rowNumber}`);
      cellAH.value = validation.itemCode || 'N/A';
      this.applyCellStyle(cellAH, validation.itemCode);

      // Column AI: Verifikasi Qty
      const cellAI = this.worksheet.getCell(`AI${rowNumber}`);
      cellAI.value = validation.qty || 'N/A';
      this.applyCellStyle(cellAI, validation.qty);

      // Column AJ: BC Kode Barang
      const cellAJ = this.worksheet.getCell(`AJ${rowNumber}`);
      cellAJ.value = bcData ? bcData.kodeBrg : 'N/A';

      // Column AK: BC Qty
      const cellAK = this.worksheet.getCell(`AK${rowNumber}`);
      cellAK.value = bcData ? bcData.qty : 0;

      // Column AL: BC Satuan
      const cellAL = this.worksheet.getCell(`AL${rowNumber}`);
      cellAL.value = bcData ? bcData.satuan : 'N/A';

      // Column AM: Issues
      const cellAM = this.worksheet.getCell(`AM${rowNumber}`);
      cellAM.value = issues && issues.length > 0 ? issues.join('; ') : '';

      logger.debug(`Row ${rowNumber}: Written results`);
      return true;
    } catch (error) {
      logger.error(`Failed to write row ${rowNumber}:`, error.message);
      return false;
    }
  }

  /**
   * Apply cell style based on validation status
   */
  applyCellStyle(cell, status) {
    if (status === 'OK') {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF90EE90' } // Light green
      };
      cell.font = { color: { argb: 'FF006400' } }; // Dark green text
    } else if (status === 'ERROR') {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFF6B6B' } // Light red
      };
      cell.font = { color: { argb: 'FF8B0000' }, bold: true }; // Dark red text
    } else if (status === 'NOT MATCH' || status === 'OVER LIMIT' || status === 'WARNING') {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFEB3B' } // Yellow
      };
      cell.font = { color: { argb: 'FF000000' } }; // Black text
    }
  }

  /**
   * Write all validation results
   */
  writeAllResults(validationResults) {
    try {
      logger.info(`Writing ${validationResults.length} validation results...`);

      this.setupHeaders();

      let successCount = 0;
      validationResults.forEach(result => {
        if (this.writeResult(result.rowNumber, result)) {
          successCount++;
        }
      });

      logger.success(`✅ Written ${successCount}/${validationResults.length} results`);
      return true;
    } catch (error) {
      logger.error('Failed to write results:', error.message);
      return false;
    }
  }

  /**
   * Add summary sheet
   */
  addSummarySheet(summary, ticketNumber) {
    try {
      logger.info('Adding summary sheet...');

      // Create or get summary sheet
      let summarySheet = this.workbook.getWorksheet('Summary');
      if (!summarySheet) {
        summarySheet = this.workbook.addWorksheet('Summary');
      }

      // Clear existing content
      summarySheet.spliceRows(1, summarySheet.rowCount);

      // Add title
      summarySheet.getCell('A1').value = 'VERIFICATION SUMMARY';
      summarySheet.getCell('A1').font = { bold: true, size: 14 };

      // Add ticket info
      summarySheet.getCell('A3').value = 'Ticket Number:';
      summarySheet.getCell('B3').value = ticketNumber || 'N/A';
      summarySheet.getCell('A4').value = 'Verification Date:';
      summarySheet.getCell('B4').value = new Date().toISOString().split('T')[0];

      // Add summary data
      let row = 6;
      const summaryData = [
        ['Total Items', summary.total],
        ['Items OK', summary.ok],
        ['Items with Warning', summary.warning],
        ['Items with Error', summary.error],
        ['Success Rate', summary.successRate],
        ['', ''],
        ['Issues Breakdown', ''],
        ['Item Code Issues', summary.issues.itemCode],
        ['Qty Issues', summary.issues.qty]
      ];

      summaryData.forEach(([label, value]) => {
        summarySheet.getCell(`A${row}`).value = label;
        summarySheet.getCell(`B${row}`).value = value;
        
        if (label === 'Success Rate') {
          const rate = parseFloat(summary.successRate);
          const cell = summarySheet.getCell(`B${row}`);
          if (rate >= 90) {
            cell.font = { color: { argb: 'FF006400' }, bold: true };
          } else if (rate >= 70) {
            cell.font = { color: { argb: 'FFFF8C00' }, bold: true };
          } else {
            cell.font = { color: { argb: 'FF8B0000' }, bold: true };
          }
        }
        
        row++;
      });

      // Auto-fit columns
      summarySheet.getColumn('A').width = 25;
      summarySheet.getColumn('B').width = 15;

      logger.success('✅ Summary sheet added');
      return true;
    } catch (error) {
      logger.error('Failed to add summary sheet:', error.message);
      return false;
    }
  }

  /**
   * Save Excel file
   */
  async save(outputPath) {
    try {
      logger.info(`Saving Excel to: ${outputPath}`);
      
      await this.workbook.xlsx.writeFile(outputPath);
      
      logger.success(`✅ Excel saved: ${path.basename(outputPath)}`);
      return outputPath;
    } catch (error) {
      logger.error('Failed to save Excel:', error.message);
      throw error;
    }
  }
}

module.exports = ExcelWriter;