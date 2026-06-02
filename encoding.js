// @ts-check
/// <reference types="node" />

/**
 * Auto-detect file encoding and read content as UTF-8 string.
 * Handles GBK/GB2312 (common for Chinese files) and other encodings.
 */

const fs = require('fs');
const jschardet = require('jschardet');
const iconv = require('iconv-lite');

const FALLBACK_ENCODING = 'GB2312';

/**
 * Reads a text/binary file and converts it to a UTF-8 string.
 *
 * Strategy:
 * 1. Try UTF-8 (direct), since most modern files use it.
 * 2. If that fails (non-UTF-8 bytes), detect with jschardet.
 * 3. Decode from the detected encoding via iconv-lite.
 *
 * @param {string} filePath
 * @returns {string}
 */
function readFileAuto(filePath) {
  const buf = fs.readFileSync(filePath);

  // If UTF-8, use the raw buffer directly.
  const utf8Str = buf.toString('utf-8');
  if (!containsReplacementCharacters(utf8Str, buf)) {
    return utf8Str;
  }

  // Detect encoding from the raw buffer.
  const result = jschardet.detect(buf);
  const srcEncoding = (result && result.encoding) ? result.encoding : FALLBACK_ENCODING;

  try {
    return iconv.decode(buf, srcEncoding);
  } catch (_err) {
    // Final fallback: try common Chinese encodings.
    try {
      return iconv.decode(buf, FALLBACK_ENCODING);
    } catch (__err) {
      return iconv.decode(buf, 'utf-8');
    }
  }
}

/**
 * Checks whether the utf-8 decoded string has replacement characters (�),
 * indicating the original buffer was NOT valid UTF-8.
 *
 * @param {string} str
 * @param {Buffer} buf
 * @returns {boolean}
 */
function containsReplacementCharacters(str, buf) {
  return str.indexOf('\uFFFD') !== -1;
}

module.exports = { readFileAuto };
