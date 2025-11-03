// backend/src/api/routes.js
// API Routes

const express = require('express');
const router = express.Router();
const OCRCleanup = require('../utils/cleanup-ocr');
const logger = require('../utils/logger');

/**
 * GET /api/cleanup/stats
 * Get OCR cleanup statistics
 */
router.get('/cleanup/stats', async (req, res) => {
  try {
    const cleanup = new OCRCleanup();
    const stats = await cleanup.getStatistics();

    res.json({
      success: true,
      stats: stats
    });
  } catch (error) {
    logger.error('Failed to get cleanup stats:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/cleanup/run
 * Run OCR cleanup manually
 *
 * Body (optional):
 * {
 *   "maxAge": 7,        // Days to keep files (default: 7)
 *   "maxFiles": 50,     // Max files to keep (default: 50)
 *   "dryRun": false     // If true, only simulate (default: false)
 * }
 */
router.post('/cleanup/run', async (req, res) => {
  try {
    const { maxAge, maxFiles, dryRun } = req.body;

    const cleanup = new OCRCleanup({
      maxAge: maxAge || 7,
      maxFiles: maxFiles || 50,
      dryRun: dryRun || false
    });

    logger.info(`Running manual cleanup (maxAge: ${maxAge || 7} days, maxFiles: ${maxFiles || 50}, dryRun: ${dryRun || false})`);

    const results = await cleanup.cleanupAll();

    res.json({
      success: true,
      results: results,
      message: dryRun ? 'Dry run completed (no files deleted)' : 'Cleanup completed successfully'
    });
  } catch (error) {
    logger.error('Cleanup failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/cleanup/ocr-results
 * Clean up only OCR result files
 */
router.post('/cleanup/ocr-results', async (req, res) => {
  try {
    const { maxAge, maxFiles, dryRun } = req.body;

    const cleanup = new OCRCleanup({
      maxAge: maxAge || 7,
      maxFiles: maxFiles || 50,
      dryRun: dryRun || false
    });

    const results = await cleanup.cleanupOCRResults();

    res.json({
      success: true,
      results: results,
      message: `Deleted ${results.deleted} files, kept ${results.kept} files`
    });
  } catch (error) {
    logger.error('OCR results cleanup failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api
 * API info
 */
router.get('/', (req, res) => {
  res.json({
    name: 'ILS Verification Bot API',
    version: '1.0.0',
    endpoints: {
      'GET /api/cleanup/stats': 'Get cleanup statistics',
      'POST /api/cleanup/run': 'Run full cleanup',
      'POST /api/cleanup/ocr-results': 'Clean up OCR results only'
    }
  });
});

module.exports = router;
