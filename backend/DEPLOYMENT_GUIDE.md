# Deployment Guide - OCR Parsing Fix

## Overview

Fixes untuk handle real-world OCR format variations sudah di-commit dan di-push ke branch:
```
claude/fix-pdf-document-context-011CUkLDLG3EoRJDEdkQ1aoe
```

## What Was Fixed

### Problem
OCR berhasil extract text (20,099 characters) tapi parsing mengembalikan 0 items karena:
1. Format OCR berbeda dari ekspektasi (ada pipe `|`, bracket `[`)
2. HS code variations (dengan/tanpa titik)
3. Double pipes `| |` di beberapa line

### Solution
- ✅ Enhanced pattern matching untuk handle pipes dan brackets
- ✅ HS code normalization (semua format → standard format)
- ✅ Smart quantity parsing (1.0000 → 1, bukan 10000)
- ✅ Description cleanup (remove leading pipes)
- ✅ Support untuk 10-digit HS codes

## Deployment Steps

### Option 1: Pull dari Git (Recommended)

```bash
# 1. Navigate to production directory
cd /home/deployer/projects/ils-verification-bot

# 2. Fetch latest changes
git fetch origin

# 3. Checkout the fix branch
git checkout claude/fix-pdf-document-context-011CUkLDLG3EoRJDEdkQ1aoe

# 4. Pull latest changes
git pull origin claude/fix-pdf-document-context-011CUkLDLG3EoRJDEdkQ1aoe

# 5. Install dependencies (if not already installed)
cd backend
npm install

# 6. Restart your service (if running as a service)
# pm2 restart ils-bot  # If using pm2
# Or restart manually
```

### Option 2: Manual File Copy (If Git Not Available)

Copy file berikut dari development ke production:

**File yang di-update:**
```
backend/src/bot/pdf-parser.js
```

**Test files (optional):**
```
backend/test-ocr-parsing.js
backend/logs/real-ocr-sample.txt
```

## Verification

### Test dengan Sample OCR

```bash
cd /home/deployer/projects/ils-verification-bot/backend
node test-ocr-parsing.js
```

**Expected Output:**
```
Total items parsed: 8

1. Seri: 1, Kode: 8479.903000, Qty: 1 PCE
2. Seri: 2, Kode: 8479.903000, Qty: 1 SET
3. Seri: 3, Kode: 8479.903000, Qty: 3 PCE
4. Seri: 4, Kode: 8479.903000, Qty: 2 PCE
5. Seri: 5, Kode: 8479.903000, Qty: 4 PCE
6. Seri: 6, Kode: 8479.903000, Qty: 1 PCE
7. Seri: 7, Kode: 3926.905900, Qty: 1 PCE
8. Seri: 8, Kode: 8479.903000, Qty: 3 PCE

✅ OCR parsing SUCCESS!
```

### Test dengan PDF Asli

```bash
cd backend
npm run test:parsing
# Pilih option 2: Test PDF Parsing
# Masukkan path ke PDF hasil scan Anda
```

**Expected Log Output:**
```
[INFO] Starting enhanced OCR text extraction...
[SUCCESS] ✅ Enhanced OCR extraction complete (XXXX characters)
[INFO] Parsing items from PDF...
[DEBUG] Table section detected (3 keywords found)
[DEBUG] Found 0 items using "Pos Tarif/HS" pattern
[INFO] Trying OCR table format parsing...
[DEBUG] Parsed Seri 1: 8479.903000 - 1 PCE
[DEBUG] Parsed Seri 2: 8479.903000 - 1 SET
...
[SUCCESS] ✅ Parsed X items from PDF

Document Type: BC2.3
Total Items: X (should be > 0 now!)
Total Qty: (sum of quantities)
```

## What Changed

### Code Changes

**File:** `backend/src/bot/pdf-parser.js`

**Key Methods Modified:**

1. **parseItemsFromOCRTable()** - Line 379-425
   - Enhanced pattern: `/^[\|\s]*(\d+)\s+\[?(\d{4}[.,]?\d{2,3}[.,]?\d{3,4}|\d{10})/`
   - Handles multiple pipes and brackets
   - Supports all HS code variations

2. **parseOCRItemText()** - Line 434-544
   - HS code normalization
   - Smart quantity parsing (decimal vs thousand separator)
   - Description cleanup

3. **detectDocumentType()** - Line 277-287
   - Added "BC23" and "BC40" detection (OCR may remove spaces)

4. **findTableSection()** - Line 292-317
   - Multiple keyword variations for robustness

## Supported OCR Formats

### HS Code Formats
```
8479.903000      → 8479.903000 ✅
8479903000       → 8479.903000 ✅
8479.90.3000     → 8479.903000 ✅
[8479.903000     → 8479.903000 ✅
[8479903000      → 8479.903000 ✅
3926905900       → 3926.905900 ✅
```

### Item Line Formats
```
1 8479.903000                    ✅
| 1 [8479.903000                 ✅
2 8479903000                     ✅
| | 7 [3926905900                ✅ (was failing before)
```

### Quantity Formats
```
1.0000           → 1.0    ✅
3.150,0000       → 3150.0 ✅
470,0000         → 470.0  ✅
```

## Troubleshooting

### Issue: Still Getting 0 Items

**Check:**
1. OCR extraction completed successfully?
   - Look for: `✅ Enhanced OCR extraction complete`
   - Check character count > 1000

2. Table section detected?
   - Look for: `Table section detected`
   - If not, check OCR result file in `/logs/ocr-result-*.txt`

3. Pattern matching working?
   - Look for: `Trying OCR table format parsing...`
   - Should see debug logs: `Parsed Seri X: ...`

**Debug Command:**
```bash
# View latest OCR result
ls -lt /home/deployer/projects/ils-verification-bot/logs/ocr-result-*.txt | head -1
cat $(ls -t /home/deployer/projects/ils-verification-bot/logs/ocr-result-*.txt | head -1)
```

### Issue: Wrong Quantities

**Example:** Getting 10000 instead of 1

This should be fixed now with smart parsing. If still occurring:
1. Check OCR result file - verify format of quantity
2. Look for pattern: `X.0000 Piece (PCE)`
3. Report the specific line format

### Issue: Missing Items

**Check:**
1. Does item line match pattern?
2. Look for unusual characters before item number
3. Check if HS code has unusual format

**Report:**
```bash
# Get sample of problematic lines
grep -B2 -A5 "Pos Tarif" /logs/ocr-result-*.txt | head -20
```

## Performance

### OCR Processing Time
- **Single page:** ~3-5 seconds
- **5 pages:** ~15-25 seconds
- **10 pages:** ~30-60 seconds

With batch processing (3 pages parallel):
- **10 pages:** ~30-45 seconds (improved)

### Memory Usage
- ~200-500MB per PDF (depending on pages and resolution)
- Temp files auto-cleanup after processing

## Rollback Plan

If issues occur, rollback to previous version:

```bash
cd /home/deployer/projects/ils-verification-bot
git log --oneline -10  # Find previous commit
git checkout <previous-commit-hash>
# Restart service
```

**Previous stable commits:**
- `b9c2c6f` - Original parser (before OCR enhancements)
- `1ea05cc` - Basic OCR (before table format fix)

## Support

If masih ada issue setelah deployment:

1. **Collect logs:**
   ```bash
   tail -100 /home/deployer/projects/ils-verification-bot/logs/bot-$(date +%Y-%m-%d).log
   ```

2. **Get OCR output:**
   ```bash
   ls -lt /home/deployer/projects/ils-verification-bot/logs/ocr-result-*.txt | head -1
   ```

3. **Share:**
   - Log output
   - First 50 lines of OCR result
   - Description of expected vs actual behavior

## Summary

✅ **Fixed:** Real-world OCR format parsing
✅ **Fixed:** Pipe and bracket handling
✅ **Fixed:** HS code normalization
✅ **Fixed:** Quantity parsing accuracy
✅ **Fixed:** Missing item 7 (double pipe issue)
✅ **Tested:** With production OCR format
✅ **Backward Compatible:** Digital PDFs still work

**Ready for Production Deployment** 🚀
