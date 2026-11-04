# Web Font Sanitization & Runtime Loading Invariant

1. **Verify OTS Compliance for Legacy Fonts**:
   When loading local `.ttf` or `.otf` assets from user downloads or third-party sources, always check for Chromium OTS (OpenType Sanitizer) parsing errors (`kern: Bad subtable`, `glyf: Failed to parse`, etc.).
   
2. **Never Rely Solely on HTTP 200**:
   A successful HTTP 200 response from Vite/Express for a `.ttf` file does NOT guarantee the browser rendered the font. Always verify via `document.fonts.check()` or evaluate `(await new FontFace(name, url).load()).status === 'loaded'`.

3. **Binary Repair Pattern for Legacy Kern Tables**:
   If OTS rejects an old TrueType font due to `kern: Bad subtable`, safely strip the legacy `kern` table (modern CSS relies on standard OpenType positioning), re-align directory table offsets to 4-byte boundaries, and recalculate the `head` table checksum.
