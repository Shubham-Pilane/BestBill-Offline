const fs = require('fs');
let createCanvas;
let GlobalFonts;
try {
  const canvasPkg = require('@napi-rs/canvas');
  createCanvas = canvasPkg.createCanvas;
  GlobalFonts = canvasPkg.GlobalFonts;

  // Register system Devanagari font (Nirmala UI / Mangal) on Windows for crisp Marathi printing
  if (GlobalFonts && process.platform === 'win32') {
    const fontPaths = [
      'C:/Windows/Fonts/Nirmala.ttc',
      'C:/Windows/Fonts/nirmala.ttf',
      'C:/Windows/Fonts/mangal.ttf'
    ];
    for (const p of fontPaths) {
      if (fs.existsSync(p)) {
        try {
          GlobalFonts.registerFromPath(p, 'Nirmala UI');
          console.log(`[DevanagariNodeRenderer] Registered font from ${p}`);
          break;
        } catch (e) {
          console.warn(`[DevanagariNodeRenderer] Failed to register font ${p}:`, e.message);
        }
      }
    }
  }
} catch (e) {
  console.warn('[DevanagariNodeRenderer] @napi-rs/canvas not available:', e.message);
  createCanvas = null;
}

// Check if text contains Devanagari Unicode characters (\u0900-\u097F)
function containsDevanagari(text) {
  if (!text) return false;
  return /[\u0900-\u097F]/.test(String(text));
}

// Convert @napi-rs/canvas instance to ESC/POS GS v 0 1-bit raster graphic buffer
function canvasToEscposRaster(canvas) {
  if (!canvas || canvas.width === 0 || canvas.height === 0) {
    return Buffer.alloc(0);
  }

  const ctx = canvas.getContext('2d');
  const width = Math.floor(canvas.width / 8) * 8;
  const height = canvas.height;
  if (width === 0 || height === 0) return Buffer.alloc(0);

  const imgData = ctx.getImageData(0, 0, width, height);
  const pixels = imgData.data;

  const bw = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    const a = pixels[i * 4 + 3] / 255;
    const blendedR = r * a + 255 * (1 - a);
    const blendedG = g * a + 255 * (1 - a);
    const blendedB = b * a + 255 * (1 - a);
    const gray = blendedR * 0.299 + blendedG * 0.587 + blendedB * 0.114;
    bw[i] = gray < 180 ? 1 : 0;
  }

  const bytesPerLine = width / 8;
  const xL = bytesPerLine % 256;
  const xH = Math.floor(bytesPerLine / 256);
  const yL = height % 256;
  const yH = Math.floor(height / 256);

  const bytes = [
    0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH
  ];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < bytesPerLine; x++) {
      let byte = 0;
      for (let b = 0; b < 8; b++) {
        const px = x * 8 + b;
        if (bw[y * width + px] === 1) {
          byte |= (1 << (7 - b));
        }
      }
      bytes.push(byte);
    }
  }

  return Buffer.from(bytes);
}

function renderItemRowToRaster(itemData, options = {}) {
  if (!createCanvas) return Buffer.alloc(0);
  const paperSize = options.paperSize || '58mm';
  const is58mm = paperSize === '58mm';
  const totalWidth = is58mm ? 384 : 576;
  const fontSize = options.fontSize || parseInt(process.env.TEST_FONT_SIZE) || 28;
  const lineHeight = Math.ceil(fontSize * 1.4);

  const itemColWidth = is58mm ? 160 : 260;
  const qtyColWidth = is58mm ? 44 : 60;
  const rateColWidth = is58mm ? 90 : 128;
  const amtColWidth = is58mm ? 90 : 128;

  const itemX = 0;
  const qtyX = itemColWidth;
  const rateX = qtyX + qtyColWidth;
  const amtX = rateX + rateColWidth;

  const fontStack = `normal ${fontSize}px "Nirmala UI", "Mangal", "Noto Sans Devanagari", "Devanagari", "Segoe UI", Arial, sans-serif`;

  const tempCanvas = createCanvas(totalWidth, 100);
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.font = fontStack;

  const words = String(itemData.name || '').trim().split(/\s+/);
  const nameLines = [];
  let currentLine = '';

  words.forEach(word => {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = tempCtx.measureText(testLine);
    if (metrics.width <= itemColWidth - 4) {
      currentLine = testLine;
    } else {
      if (currentLine) nameLines.push(currentLine);
      currentLine = word;
    }
  });
  if (currentLine) nameLines.push(currentLine);
  if (nameLines.length === 0) nameLines.push('');

  const totalHeight = nameLines.length * lineHeight + 6;
  const canvas = createCanvas(totalWidth, totalHeight);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  ctx.fillStyle = '#000000';
  ctx.font = fontStack;
  ctx.textBaseline = 'top';

  nameLines.forEach((lineText, idx) => {
    const y = idx * lineHeight + 3;
    ctx.fillText(lineText, itemX + 2, y);
  });

  const primaryY = 3;
  const qtyStr = String(itemData.qty || itemData.quantity || '1');
  const rateStr = String(itemData.price || itemData.rate || '0');
  const amtStr = String(itemData.amt || (Number(qtyStr) * Number(rateStr)) || '0');

  const qtyMetrics = ctx.measureText(qtyStr);
  const qtyDrawX = qtyX + Math.max(0, (qtyColWidth - qtyMetrics.width) / 2);
  ctx.fillText(qtyStr, qtyDrawX, primaryY);

  const rateMetrics = ctx.measureText(rateStr);
  const rateDrawX = rateX + Math.max(0, rateColWidth - rateMetrics.width - 2);
  ctx.fillText(rateStr, rateDrawX, primaryY);

  const amtMetrics = ctx.measureText(amtStr);
  const amtDrawX = amtX + Math.max(0, amtColWidth - amtMetrics.width - 2);
  ctx.fillText(amtStr, amtDrawX, primaryY);

  return canvasToEscposRaster(canvas);
}

function renderKOTItemRowToRaster(itemData, options = {}) {
  if (!createCanvas) return Buffer.alloc(0);
  const paperSize = options.paperSize || '58mm';
  const is58mm = paperSize === '58mm';
  const totalWidth = is58mm ? 384 : 576;
  const fontSize = options.fontSize || 28;
  const lineHeight = Math.ceil(fontSize * 1.4);

  const qtyColWidth = is58mm ? 64 : 80;
  const itemColWidth = totalWidth - qtyColWidth;

  const fontStack = `normal ${fontSize}px "Nirmala UI", "Mangal", "Noto Sans Devanagari", "Devanagari", "Segoe UI", Arial, sans-serif`;

  const tempCanvas = createCanvas(totalWidth, 100);
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.font = fontStack;

  const words = String(itemData.name || '').trim().split(/\s+/);
  const nameLines = [];
  let currentLine = '';

  words.forEach(word => {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = tempCtx.measureText(testLine);
    if (metrics.width <= itemColWidth - 4) {
      currentLine = testLine;
    } else {
      if (currentLine) nameLines.push(currentLine);
      currentLine = word;
    }
  });
  if (currentLine) nameLines.push(currentLine);
  if (nameLines.length === 0) nameLines.push('');

  const totalHeight = nameLines.length * lineHeight + 6;
  const canvas = createCanvas(totalWidth, totalHeight);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  ctx.fillStyle = '#000000';
  ctx.font = fontStack;
  ctx.textBaseline = 'top';

  nameLines.forEach((lineText, idx) => {
    const y = idx * lineHeight + 3;
    ctx.fillText(lineText, 2, y);
  });

  const qtyStr = String(itemData.qty || itemData.quantity || '1');
  const qtyMetrics = ctx.measureText(qtyStr);
  const qtyDrawX = itemColWidth + Math.max(0, qtyColWidth - qtyMetrics.width - 4);
  ctx.fillText(qtyStr, qtyDrawX, 3);

  return canvasToEscposRaster(canvas);
}

function renderTextLineToRaster(text, options = {}) {
  if (!createCanvas || !text) return Buffer.alloc(0);
  const paperSize = options.paperSize || '58mm';
  const is58mm = paperSize === '58mm';
  const totalWidth = is58mm ? 384 : 576;
  const defaultSize = options.isTitle ? 34 : 26;
  const envSize = options.isTitle ? parseInt(process.env.TEST_TITLE_FONT_SIZE) : parseInt(process.env.TEST_TEXT_FONT_SIZE);
  const fontSize = options.fontSize || envSize || defaultSize;
  const align = options.align || 'left';
  const isBold = options.bold !== false;

  const fontStack = `${isBold ? 'bold' : 'normal'} ${fontSize}px "Nirmala UI", "Mangal", "Noto Sans Devanagari", "Devanagari", "Segoe UI", Arial, sans-serif`;

  const lineHeight = Math.ceil(fontSize * 1.4);
  const totalHeight = lineHeight + 8;

  const canvas = createCanvas(totalWidth, totalHeight);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  ctx.fillStyle = '#000000';
  ctx.font = fontStack;
  ctx.textBaseline = 'middle';

  const metrics = ctx.measureText(text);
  let x = 4;
  if (align === 'center') {
    x = Math.max(0, (totalWidth - metrics.width) / 2);
  } else if (align === 'right') {
    x = Math.max(0, totalWidth - metrics.width - 4);
  }

  ctx.fillText(text, x, totalHeight / 2);

  return canvasToEscposRaster(canvas);
}

function renderTableHeaderToRaster(options = {}) {
  if (!createCanvas) return Buffer.alloc(0);
  const paperSize = options.paperSize || '58mm';
  const is58mm = paperSize === '58mm';
  const totalWidth = is58mm ? 384 : 576;
  const fontSize = options.fontSize || parseInt(process.env.TEST_TEXT_FONT_SIZE) || 26;
  const lineHeight = Math.ceil(fontSize * 1.4);
  const isKOT = options.isKOT || false;

  const fontStack = `bold ${fontSize}px "Nirmala UI", "Mangal", "Noto Sans Devanagari", "Devanagari", "Segoe UI", Arial, sans-serif`;

  const canvas = createCanvas(totalWidth, lineHeight + 8);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, totalWidth, lineHeight + 8);

  ctx.fillStyle = '#000000';
  ctx.font = fontStack;
  ctx.textBaseline = 'middle';

  const centerY = (lineHeight + 8) / 2;

  if (isKOT) {
    ctx.fillText('पदार्थ', 4, centerY);
    const qtyMetrics = ctx.measureText('नग');
    ctx.fillText('नग', totalWidth - qtyMetrics.width - 4, centerY);
  } else {
    const itemColWidth = is58mm ? 160 : 260;
    const qtyColWidth = is58mm ? 44 : 60;
    const rateColWidth = is58mm ? 90 : 128;
    const amtColWidth = is58mm ? 90 : 128;

    const qtyX = itemColWidth;
    const rateX = qtyX + qtyColWidth;
    const amtX = rateX + rateColWidth;

    ctx.fillText('पदार्थ', 4, centerY);

    const rateMetrics = ctx.measureText('दर');
    ctx.fillText('दर', rateX + Math.max(0, rateColWidth - rateMetrics.width - 4), centerY);

    const qtyMetrics = ctx.measureText('नग');
    ctx.fillText('नग', qtyX + Math.max(0, (qtyColWidth - qtyMetrics.width) / 2), centerY);

    const amtMetrics = ctx.measureText('एकूण');
    ctx.fillText('एकूण', amtX + Math.max(0, amtColWidth - amtMetrics.width - 4), centerY);
  }

  return canvasToEscposRaster(canvas);
}

module.exports = {
  containsDevanagari,
  canvasToEscposRaster,
  renderItemRowToRaster,
  renderKOTItemRowToRaster,
  renderTextLineToRaster,
  renderTableHeaderToRaster
};
