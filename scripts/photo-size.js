// JPEG/PNG pixel size from a header slice. Used by prerender (no EXIF orientation).
function jpegDimensions(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8.length < 4 || u8[0] !== 0xff || u8[1] !== 0xd8) return null;
  let i = 2;
  while (i + 8 < u8.length) {
    if (u8[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = u8[i + 1];
    if (marker === 0xd8) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break;
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      const height = (u8[i + 5] << 8) | u8[i + 6];
      const width = (u8[i + 7] << 8) | u8[i + 8];
      if (width > 0 && height > 0) return { width, height };
      return null;
    }
    const len = (u8[i + 2] << 8) | u8[i + 3];
    if (len < 2) break;
    i += 2 + len;
  }
  return null;
}

function pngDimensions(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8.length < 24) return null;
  if (!(u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47)) {
    return null;
  }
  const width = (u8[16] << 24) | (u8[17] << 16) | (u8[18] << 8) | u8[19];
  const height = (u8[20] << 24) | (u8[21] << 16) | (u8[22] << 8) | u8[23];
  if (width > 0 && height > 0) return { width, height };
  return null;
}

function imageDimensions(buf) {
  return jpegDimensions(buf) || pngDimensions(buf);
}

module.exports = { jpegDimensions, pngDimensions, imageDimensions };
