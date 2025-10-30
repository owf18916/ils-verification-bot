// backend/src/bot/validator.js
// Validation logic for item verification

const stringSimilarity = require('string-similarity');
const logger = require('../utils/logger');

class Validator {
  constructor(options = {}) {
    this.options = {
      nameSimilarityThreshold: options.nameSimilarityThreshold || 0.75,
      allowMultiItemSameSeri: options.allowMultiItemSameSeri !== false, // default true
      strictMode: options.strictMode || false
    };

    logger.info('Validator initialized:', this.options);
  }

  /**
   * Validate single item against BC data
   */
  validateItem(excelItem, bcItem) {
    try {
      const result = {
        rowNumber: excelItem.rowNumber,
        excelData: {
          itemCode: excelItem.itemCode,
          itemName: excelItem.itemName,
          qty: excelItem.qty,
          seriBarang: excelItem.seriBarang
        },
        bcData: null,
        validation: {
          itemCode: null,
          qty: null,
          overall: null
        },
        issues: []
      };

      // Check if BC item exists
      if (!bcItem) {
        result.validation.itemCode = 'ERROR';
        result.validation.qty = 'ERROR';
        result.validation.overall = 'ERROR';
        result.issues.push(`Seri ${excelItem.seriBarang} tidak ditemukan di BC`);
        
        logger.warn(`Row ${excelItem.rowNumber}: Seri ${excelItem.seriBarang} not found in BC`);
        return result;
      }

      // Store BC data
      result.bcData = {
        kodeBrg: bcItem.kodeBrg,
        uraian: bcItem.uraian,
        qty: bcItem.qty,
        satuan: bcItem.satuan,
        seri: bcItem.seri
      };

      // Validate Item Code
      const itemCodeValidation = this.validateItemCode(
        excelItem.itemCode,
        bcItem.kodeBrg
      );
      result.validation.itemCode = itemCodeValidation.status;
      if (itemCodeValidation.message) {
        result.issues.push(itemCodeValidation.message);
      }

      // Validate Qty
      const qtyValidation = this.validateQty(
        excelItem.qty,
        bcItem.qty
      );
      result.validation.qty = qtyValidation.status;
      if (qtyValidation.message) {
        result.issues.push(qtyValidation.message);
      }

      // Overall status
      if (result.validation.itemCode === 'OK' && result.validation.qty === 'OK') {
        result.validation.overall = 'OK';
      } else if (result.validation.itemCode === 'ERROR' || result.validation.qty === 'ERROR') {
        result.validation.overall = 'ERROR';
      } else {
        result.validation.overall = 'WARNING';
      }

      // Log result
      const statusIcon = result.validation.overall === 'OK' ? '✅' : 
                        result.validation.overall === 'ERROR' ? '❌' : '⚠️';
      logger.info(`${statusIcon} Row ${excelItem.rowNumber}: ${result.validation.overall}`);

      return result;
    } catch (error) {
      logger.error('Validation error:', error.message);
      return {
        rowNumber: excelItem.rowNumber,
        validation: { overall: 'ERROR' },
        issues: [`Validation error: ${error.message}`]
      };
    }
  }

  /**
   * Validate Item Code match
   */
  validateItemCode(excelCode, bcCode) {
    // Normalize codes
    const excelNorm = excelCode.toString().trim().toUpperCase();
    const bcNorm = bcCode.toString().trim().toUpperCase();

    // Exact match
    if (excelNorm === bcNorm) {
      return {
        status: 'OK',
        similarity: 1.0,
        message: null
      };
    }

    // Fuzzy match
    const similarity = stringSimilarity.compareTwoStrings(excelNorm, bcNorm);
    
    if (similarity >= this.options.nameSimilarityThreshold) {
      return {
        status: 'OK',
        similarity: similarity,
        message: `Item Code match (${(similarity * 100).toFixed(0)}% similar)`
      };
    }

    // No match
    return {
      status: 'NOT MATCH',
      similarity: similarity,
      message: `Item Code mismatch (Excel: ${excelCode}, BC: ${bcCode})`
    };
  }

  /**
   * Validate Qty
   */
  validateQty(excelQty, bcQty) {
    const excelNum = parseFloat(excelQty);
    const bcNum = parseFloat(bcQty);

    if (isNaN(excelNum) || isNaN(bcNum)) {
      return {
        status: 'ERROR',
        message: 'Invalid qty values'
      };
    }

    if (excelNum <= bcNum) {
      return {
        status: 'OK',
        message: null
      };
    }

    return {
      status: 'OVER LIMIT',
      message: `Qty over limit (Req: ${excelNum}, BC: ${bcNum})`
    };
  }

  /**
   * Process duplicate seri items
   * Sum qty for items with same seri in same aju
   */
  processDuplicateSeri(items) {
    if (!this.options.allowMultiItemSameSeri) {
      logger.info('Multi-item same seri NOT allowed, processing individually');
      return items;
    }

    logger.info('Processing duplicate seri items (sum qty)...');

    // Group by Aju + Seri
    const groups = {};
    items.forEach(item => {
      const key = `${item.ajuNumber}_${item.seriBarang}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item);
    });

    // Process groups
    const processed = [];
    Object.keys(groups).forEach(key => {
      const group = groups[key];
      
      if (group.length === 1) {
        // No duplicate, use as is
        processed.push({
          ...group[0],
          qtyToCheck: group[0].qty,
          isDuplicate: false
        });
      } else {
        // Duplicate seri - sum qty
        const totalQty = group.reduce((sum, item) => sum + item.qty, 0);
        
        logger.warn(`Duplicate seri found: Aju ${group[0].ajuNumber}, Seri ${group[0].seriBarang} (${group.length} items, total qty: ${totalQty})`);
        
        // Add all items with summed qty
        group.forEach(item => {
          processed.push({
            ...item,
            qtyToCheck: totalQty, // Use total qty for validation
            isDuplicate: true,
            duplicateCount: group.length
          });
        });
      }
    });

    logger.info(`Processed ${processed.length} items (${items.length} original)`);
    return processed;
  }

  /**
   * Validate batch of items
   */
  validateBatch(excelItems, pdfParser) {
    logger.info(`Validating ${excelItems.length} items...`);

    const results = [];
    
    for (const excelItem of excelItems) {
      try {
        // Find matching BC item by seri
        const bcItem = pdfParser.findBySeri(excelItem.seriBarang);
        
        // Validate
        const result = this.validateItem(excelItem, bcItem);
        results.push(result);
      } catch (error) {
        logger.error(`Error validating row ${excelItem.rowNumber}:`, error.message);
        results.push({
          rowNumber: excelItem.rowNumber,
          validation: { overall: 'ERROR' },
          issues: [`Validation failed: ${error.message}`]
        });
      }
    }

    // Summary
    const summary = this.generateSummary(results);
    logger.info('Validation summary:', summary);

    return {
      results: results,
      summary: summary
    };
  }

  /**
   * Generate validation summary
   */
  generateSummary(results) {
    const total = results.length;
    const ok = results.filter(r => r.validation.overall === 'OK').length;
    const warning = results.filter(r => r.validation.overall === 'WARNING').length;
    const error = results.filter(r => r.validation.overall === 'ERROR').length;

    const itemCodeIssues = results.filter(r => 
      r.validation.itemCode && r.validation.itemCode !== 'OK'
    ).length;

    const qtyIssues = results.filter(r => 
      r.validation.qty && r.validation.qty !== 'OK'
    ).length;

    return {
      total: total,
      ok: ok,
      warning: warning,
      error: error,
      successRate: total > 0 ? ((ok / total) * 100).toFixed(2) + '%' : '0%',
      issues: {
        itemCode: itemCodeIssues,
        qty: qtyIssues
      }
    };
  }
}

module.exports = Validator;