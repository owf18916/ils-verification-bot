// backend/src/utils/cleanup-ocr.js
// Auto-cleanup utility for OCR temporary files

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class OCRCleanup {
  constructor(options = {}) {
    // Default to backend/logs directory
    // __dirname is backend/src/utils, so go up 2 levels to backend, then /logs
    this.logsDir = options.logsDir || path.join(__dirname, '../../logs');
    this.maxAge = options.maxAge || 7; // Days to keep files
    this.maxFiles = options.maxFiles || 50; // Max number of recent files to keep
    this.dryRun = options.dryRun || false; // If true, only log what would be deleted
  }

  /**
   * Clean up old OCR result files
   */
  async cleanupOCRResults() {
    try {
      logger.info('Starting OCR results cleanup...');

      const files = fs.readdirSync(this.logsDir)
        .filter(file => file.startsWith('ocr-result-') && file.endsWith('.txt'))
        .map(file => ({
          name: file,
          path: path.join(this.logsDir, file),
          stat: fs.statSync(path.join(this.logsDir, file))
        }))
        .sort((a, b) => b.stat.mtime - a.stat.mtime); // Sort by modification time (newest first)

      logger.info(`Found ${files.length} OCR result files`);

      let deletedCount = 0;
      const now = Date.now();
      const maxAgeMs = this.maxAge * 24 * 60 * 60 * 1000; // Convert days to milliseconds

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const age = now - file.stat.mtime;
        const isOld = age > maxAgeMs;
        const isBeyondLimit = i >= this.maxFiles;

        // Delete if: older than maxAge OR beyond maxFiles limit
        if (isOld || isBeyondLimit) {
          const ageDays = Math.floor(age / (24 * 60 * 60 * 1000));
          const reason = isOld ? `older than ${this.maxAge} days (${ageDays} days)` : `beyond limit (keeping ${this.maxFiles} recent files)`;

          if (this.dryRun) {
            logger.info(`[DRY RUN] Would delete: ${file.name} (${reason})`);
          } else {
            fs.unlinkSync(file.path);
            logger.info(`Deleted: ${file.name} (${reason})`);
          }
          deletedCount++;
        }
      }

      const kept = files.length - deletedCount;
      logger.success(`✅ OCR cleanup complete: ${deletedCount} deleted, ${kept} kept`);

      return { deleted: deletedCount, kept: kept };
    } catch (error) {
      logger.error('OCR cleanup failed:', error.message);
      throw error;
    }
  }

  /**
   * Clean up temp PDF files
   */
  async cleanupTempPDFs() {
    try {
      logger.info('Starting temp PDF cleanup...');

      const files = fs.readdirSync(this.logsDir)
        .filter(file => file.startsWith('temp-') && file.endsWith('.pdf'))
        .map(file => ({
          name: file,
          path: path.join(this.logsDir, file),
          stat: fs.statSync(path.join(this.logsDir, file))
        }));

      logger.info(`Found ${files.length} temp PDF files`);

      let deletedCount = 0;
      const now = Date.now();
      const maxAgeMs = 1 * 60 * 60 * 1000; // 1 hour - temp files should be deleted quickly

      for (const file of files) {
        const age = now - file.stat.mtime;
        if (age > maxAgeMs) {
          if (this.dryRun) {
            logger.info(`[DRY RUN] Would delete: ${file.name}`);
          } else {
            fs.unlinkSync(file.path);
            logger.info(`Deleted temp PDF: ${file.name}`);
          }
          deletedCount++;
        }
      }

      logger.success(`✅ Temp PDF cleanup complete: ${deletedCount} deleted`);
      return { deleted: deletedCount };
    } catch (error) {
      logger.error('Temp PDF cleanup failed:', error.message);
      throw error;
    }
  }

  /**
   * Clean up orphaned OCR temp folders
   */
  async cleanupOCRTempFolders() {
    try {
      logger.info('Starting OCR temp folders cleanup...');

      const ocrTempPath = path.join(this.logsDir, 'ocr-temp');

      if (fs.existsSync(ocrTempPath)) {
        const files = fs.readdirSync(ocrTempPath);

        if (files.length > 0) {
          logger.warn(`Found ${files.length} files in ocr-temp folder (should be empty)`);

          if (this.dryRun) {
            logger.info(`[DRY RUN] Would delete ocr-temp folder with ${files.length} files`);
          } else {
            fs.rmSync(ocrTempPath, { recursive: true, force: true });
            logger.info(`Deleted ocr-temp folder with ${files.length} orphaned files`);
            return { deleted: files.length };
          }
        } else {
          // Empty folder, remove it
          if (!this.dryRun) {
            fs.rmSync(ocrTempPath, { recursive: true, force: true });
            logger.info('Removed empty ocr-temp folder');
          }
        }
      } else {
        logger.debug('No ocr-temp folder found (clean)');
      }

      return { deleted: 0 };
    } catch (error) {
      logger.error('OCR temp folders cleanup failed:', error.message);
      throw error;
    }
  }

  /**
   * Run all cleanup tasks
   */
  async cleanupAll() {
    logger.info('='.repeat(60));
    logger.info('OCR CLEANUP - Starting full cleanup');
    logger.info('='.repeat(60));

    const results = {
      ocrResults: { deleted: 0, kept: 0 },
      tempPDFs: { deleted: 0 },
      tempFolders: { deleted: 0 }
    };

    try {
      results.ocrResults = await this.cleanupOCRResults();
      results.tempPDFs = await this.cleanupTempPDFs();
      results.tempFolders = await this.cleanupOCRTempFolders();

      const totalDeleted = results.ocrResults.deleted + results.tempPDFs.deleted + results.tempFolders.deleted;

      logger.info('='.repeat(60));
      logger.success(`✅ CLEANUP COMPLETE - Total ${totalDeleted} items deleted`);
      logger.info(`   - OCR Results: ${results.ocrResults.deleted} deleted, ${results.ocrResults.kept} kept`);
      logger.info(`   - Temp PDFs: ${results.tempPDFs.deleted} deleted`);
      logger.info(`   - Temp Folders: ${results.tempFolders.deleted} files deleted`);
      logger.info('='.repeat(60));

      return results;
    } catch (error) {
      logger.error('Full cleanup failed:', error.message);
      throw error;
    }
  }

  /**
   * Get cleanup statistics without deleting
   */
  async getStatistics() {
    try {
      const stats = {
        ocrResults: {
          total: 0,
          toDelete: 0,
          toKeep: 0,
          oldestDate: null,
          newestDate: null
        },
        tempPDFs: {
          total: 0,
          toDelete: 0
        },
        tempFolders: {
          exists: false,
          filesCount: 0
        }
      };

      // OCR Results stats
      const ocrFiles = fs.readdirSync(this.logsDir)
        .filter(file => file.startsWith('ocr-result-') && file.endsWith('.txt'))
        .map(file => ({
          name: file,
          path: path.join(this.logsDir, file),
          stat: fs.statSync(path.join(this.logsDir, file))
        }))
        .sort((a, b) => b.stat.mtime - a.stat.mtime);

      stats.ocrResults.total = ocrFiles.length;

      if (ocrFiles.length > 0) {
        stats.ocrResults.newestDate = new Date(ocrFiles[0].stat.mtime);
        stats.ocrResults.oldestDate = new Date(ocrFiles[ocrFiles.length - 1].stat.mtime);

        const now = Date.now();
        const maxAgeMs = this.maxAge * 24 * 60 * 60 * 1000;

        for (let i = 0; i < ocrFiles.length; i++) {
          const age = now - ocrFiles[i].stat.mtime;
          if (age > maxAgeMs || i >= this.maxFiles) {
            stats.ocrResults.toDelete++;
          }
        }
        stats.ocrResults.toKeep = ocrFiles.length - stats.ocrResults.toDelete;
      }

      // Temp PDFs stats
      const tempPDFs = fs.readdirSync(this.logsDir)
        .filter(file => file.startsWith('temp-') && file.endsWith('.pdf'));
      stats.tempPDFs.total = tempPDFs.length;
      stats.tempPDFs.toDelete = tempPDFs.length; // All temp PDFs should be deleted

      // OCR temp folders stats
      const ocrTempPath = path.join(this.logsDir, 'ocr-temp');
      if (fs.existsSync(ocrTempPath)) {
        stats.tempFolders.exists = true;
        stats.tempFolders.filesCount = fs.readdirSync(ocrTempPath).length;
      }

      return stats;
    } catch (error) {
      logger.error('Failed to get cleanup statistics:', error.message);
      throw error;
    }
  }
}

module.exports = OCRCleanup;
