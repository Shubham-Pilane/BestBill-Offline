/**
 * Raw ESC/POS Command Constants
 */
const ESC = 0x1B;
const GS = 0x1D;

const CMD_INIT = Buffer.from([ESC, 0x40, ESC, 0x32, ESC, 0x45, 0x30, ESC, 0x47, 0x30]); // Initialize, Default Line Spacing, Emphasized OFF, Double-strike OFF
const CMD_ALIGN_LEFT = Buffer.from([ESC, 0x61, 0x00]);
const CMD_ALIGN_CENTER = Buffer.from([ESC, 0x61, 0x01]);
const CMD_ALIGN_RIGHT = Buffer.from([ESC, 0x61, 0x02]);

const CMD_TEXT_NORMAL = Buffer.from([GS, 0x21, 0x00]);
const CMD_TEXT_DOUBLE = Buffer.from([GS, 0x21, 0x11]); // Double width + double height
const CMD_TEXT_LARGE = Buffer.from([GS, 0x21, 0x01]); // Double height

const CMD_BOLD_ON = Buffer.from([ESC, 0x45, 0x31, ESC, 0x47, 0x31]); // Emphasized + Double-strike
const CMD_BOLD_OFF = Buffer.from([ESC, 0x45, 0x30, ESC, 0x47, 0x30]);

const CMD_CUT = Buffer.from([GS, 0x56, 0x41, 0x03]); // Full cut with feed

class EscposBuilder {
  constructor(is58mm = true) {
    this.bufferList = [CMD_INIT];
    this.is58mm = is58mm;
    // Force Font A (standard 12x24 font) for both sizes to ensure consistent, readable text
    this.bufferList.push(Buffer.from([ESC, 0x4D, 0x00])); 
    // Set custom compact line spacing: ESC 3 28 (28 dots)
    this.bufferList.push(Buffer.from([ESC, 0x33, 28]));
    // Use standard normal font to prevent aspect ratio distortion
    this.normalFont = CMD_TEXT_NORMAL;
  }

  alignCenter() {
    this.bufferList.push(CMD_ALIGN_CENTER);
    return this;
  }

  alignLeft() {
    this.bufferList.push(CMD_ALIGN_LEFT);
    return this;
  }

  alignRight() {
    this.bufferList.push(CMD_ALIGN_RIGHT);
    return this;
  }

  bold(on = true) {
    this.bufferList.push(on ? CMD_BOLD_ON : CMD_BOLD_OFF);
    return this;
  }

  setFontNormal() {
    this.bufferList.push(this.normalFont);
    return this;
  }

  setFontDouble() {
    this.bufferList.push(CMD_TEXT_DOUBLE);
    return this;
  }

  setFontLarge() {
    this.bufferList.push(CMD_TEXT_LARGE);
    return this;
  }

  text(str = '') {
    this.bufferList.push(Buffer.from(str + '\n', 'utf8'));
    return this;
  }

  line(char = '-', length = 32) {
    this.bufferList.push(Buffer.from(char.repeat(length) + '\n', 'utf8'));
    return this;
  }

  feed(lines = 3) {
    this.bufferList.push(Buffer.from([ESC, 0x64, lines]));
    return this;
  }

  cut() {
    this.bufferList.push(CMD_CUT);
    return this;
  }

  build() {
    return Buffer.concat(this.bufferList);
  }
}

/**
 * Format KOT (Kitchen Order Ticket) ESC/POS payload
 * @param {Object} data - { table, waiter, items: [{ name, quantity }], notes, printerSize }
 * @returns {Buffer} raw binary ESC/POS payload
 */
function formatKOT(data) {
  const is58mm = data.printerSize === '58mm';
  // Use character limit from settings if provided, otherwise default to 31 (58mm) or 42 (80mm)
  const LINE_WIDTH = data.charLimit ? Number(data.charLimit) : (is58mm ? 31 : 42);
  const mg = '';
  
  const builder = new EscposBuilder(is58mm);
  const dateStr = new Date().toLocaleString();

  let tStr = String(data.table);
  if (!tStr.toLowerCase().includes('room') && !tStr.toLowerCase().includes('parcel')) {
    tStr = `Table ${tStr}`;
  }
  if (data.floor && !tStr.toLowerCase().includes('parcel')) {
    tStr += ` - ${data.floor}`;
  }

  builder.alignCenter()
    .setFontDouble()
    .bold()
    .text(mg + 'KITCHEN ORDER')
    .setFontNormal()
    .bold(false)
    .line('=', LINE_WIDTH)
    .alignLeft()
    .bold()
    .text(mg + tStr);
    
  if (data.waiter && data.waiter.toLowerCase() !== 'owner') {
    builder.text(mg + `WAITER: ${data.waiter}`);
  }

  builder.bold(false)
    .text(mg + `DATE: ${dateStr}`)
    .line('-', LINE_WIDTH)
    .setFontNormal();

  // Print items
  const qtyLen = is58mm ? 4 : 6;
  const itemLen = LINE_WIDTH - qtyLen - 1;
  
  builder.bold(true).text(mg + padText('ITEM', itemLen) + ' ' + padText('QTY', qtyLen, 'right')).bold(false);
  builder.line('-', LINE_WIDTH);

  data.items.forEach(item => {
    const qty = item.quantity || item.qty || 1;
    const nameStr = toTitleCase(String(item.name));
    const firstChunk = nameStr.substring(0, itemLen);
    let remainingStr = nameStr.substring(itemLen);
    
    builder.text(mg + padText(firstChunk, itemLen) + ' ' + padText(qty, qtyLen, 'right'));
    
    const SUB_CHUNK_LEN = itemLen - 2;
    while (remainingStr.length > 0) {
      const subChunk = remainingStr.substring(0, SUB_CHUNK_LEN);
      builder.text(mg + "  " + padText(subChunk, LINE_WIDTH - 2));
      remainingStr = remainingStr.substring(SUB_CHUNK_LEN);
    }
  });

  builder.setFontNormal()
    .bold(false)
    .line('-', LINE_WIDTH);

  if (data.notes) {
    builder.bold()
      .text(mg + 'NOTES:')
      .text(mg + data.notes)
      .bold(false)
      .line('-', LINE_WIDTH);
  }

  builder.feed(3)
    .cut();

  return builder.build();
}

const padText = (text, length, align = 'left') => {
  text = String(text !== undefined && text !== null ? text : '');
  if (text.length > length) {
    return text.substring(0, length);
  }
  if (align === 'right') return text.padStart(length, ' ');
  if (align === 'center') {
    const pad = Math.floor((length - text.length) / 2);
    return ' '.repeat(pad) + text + ' '.repeat(length - text.length - pad);
  }
  return text.padEnd(length, ' ');
};

const toTitleCase = (str) => {
  return str.split(' ').map(word => word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : '').join(' ');
};

function getQRCodeBuffer(dataStr, is58mm = true) {
  try {
    const qrcode = require('qrcode');
    const qr = qrcode.create(dataStr, { errorCorrectionLevel: 'L' });
    const size = qr.modules.size;
    const data = qr.modules.data;
    
    const printerWidthDots = is58mm ? 384 : 576;
    
    // Scale so the QR occupies about 60% of the paper width for 58mm, and 42% for 80mm (to keep it compact and elegant)
    const targetSize = printerWidthDots * (is58mm ? 0.6 : 0.42);
    const scale = Math.floor(targetSize / size) || 1;
    
    const qrSizeDots = size * scale;
    const leftMarginDots = Math.max(0, Math.floor((printerWidthDots - qrSizeDots) / 2));
    
    const widthBytes = Math.ceil(printerWidthDots / 8);
    const height = qrSizeDots;
    
    const buffer = Buffer.alloc(widthBytes * height, 0);
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (data[y * size + x]) { 
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const destX = leftMarginDots + x * scale + sx;
              const destY = y * scale + sy;
              if (destX < printerWidthDots) {
                const byteIdx = destY * widthBytes + Math.floor(destX / 8);
                const bitIdx = 7 - (destX % 8);
                buffer[byteIdx] |= (1 << bitIdx);
              }
            }
          }
        }
      }
    }
    
    const header = Buffer.from([
      0x1D, 0x76, 0x30, 0x00, 
      widthBytes & 0xFF, (widthBytes >> 8) & 0xFF,
      height & 0xFF, (height >> 8) & 0xFF
    ]);
    
    return Buffer.concat([header, buffer]);
  } catch (err) {
    console.error('QR code generation failed:', err);
    return Buffer.from([]);
  }
}

/**
 * Format Final Bill ESC/POS payload
 * @param {Object} data - { hotelName, hotelPhone, hotelLocation, billId, table, items: [{ name, quantity, price }], subtotal, gst, total, discount, printerSize }
 * @returns {Buffer} raw binary ESC/POS payload
 */
function formatBill(data) {
  const hName = data.hotelName || 'BESTBILL HOTEL';
  const hLocation = data.hotelLocation || '';
  const hPhone = data.hotelPhone || '';
  
  const is58mm = data.printerSize === '58mm';
  // Use character limit from settings if provided, otherwise default to 31 (58mm) or 42 (80mm)
  const LINE_WIDTH = data.charLimit ? Number(data.charLimit) : (is58mm ? 31 : 42); 
  const mg = '';
  
  const builder = new EscposBuilder(is58mm);

  const ACTUAL_ITEM_LEN = is58mm ? 15 : (LINE_WIDTH === 48 ? 25 : 19);
  const PRC_LEN = is58mm ? 5 : 8;
  const QTY_LEN = is58mm ? 3 : 4;
  const TOT_LEN = is58mm ? 5 : 8;

  const isToken = String(data.table || '').toLowerCase().includes('token');

  if (isToken) {
    builder.alignLeft();
    builder.bold(true);
    builder.text(
      mg + padText('ITEM', ACTUAL_ITEM_LEN) + ' ' +
      padText('PRICE', PRC_LEN, 'right') + ' ' + 
      padText('QTY', QTY_LEN, 'right') + ' ' + 
      padText('TOTAL', TOT_LEN, 'right')
    );
    builder.line('-', LINE_WIDTH);
    builder.bold(false);

    (data.items || []).forEach(i => {
      const qty = i.quantity || i.qty || 1;
      const nameStr = toTitleCase(String(i.name));
      const firstChunk = nameStr.substring(0, ACTUAL_ITEM_LEN);
      let remainingStr = nameStr.substring(ACTUAL_ITEM_LEN);
      
      builder.text(
        mg + padText(firstChunk, ACTUAL_ITEM_LEN) + ' ' +
        padText(Math.round(i.price), PRC_LEN, 'right') + ' ' + 
        padText(qty, QTY_LEN, 'right') + ' ' + 
        padText(Math.round(i.price * qty), TOT_LEN, 'right')
      );

      const SUB_CHUNK_LEN = ACTUAL_ITEM_LEN - 2;
      while (remainingStr.length > 0) {
        const subChunk = remainingStr.substring(0, SUB_CHUNK_LEN);
        builder.text(mg + "  " + padText(subChunk, LINE_WIDTH - 2));
        remainingStr = remainingStr.substring(SUB_CHUNK_LEN);
      }
    });
    
    builder.line('-', LINE_WIDTH);
    
    const subtotalVal = parseFloat(data.subtotal || 0);
    const gstVal = parseFloat(data.gst || 0);
    const finalAmount = parseFloat(data.finalAmount || data.total || 0);
    
    let addedSubItems = false;
    if (gstVal > 0) {
      builder.text(mg + padText(`GST (${data.gst_percentage || 5}%):`, LINE_WIDTH - TOT_LEN, 'right') + padText(Math.round(gstVal), TOT_LEN, 'right'));
      addedSubItems = true;
    }
    
    if (data.discountPercentage > 0) {
      const discAmt = (subtotalVal + gstVal) * (data.discountPercentage / 100);
      builder.text(mg + padText(`Disc (${data.discountPercentage}%):`, LINE_WIDTH - TOT_LEN, 'right') + padText('-' + Math.round(discAmt), TOT_LEN, 'right'));
      addedSubItems = true;
    }
    
    if (addedSubItems) {
      builder.line('-', LINE_WIDTH);
    }
    
    const totalText = 'TOTAL: Rs ' + Math.round(finalAmount);
    builder.bold(true).text(mg + padText(totalText, LINE_WIDTH, 'right')).bold(false);
    builder.line('-', LINE_WIDTH);
    builder.feed(3).cut();
    return builder.build();
  }
  
  // Header
  builder.alignCenter()
    .bold(true)
    .setFontDouble()
    .text(hName.toUpperCase())
    .setFontNormal();
    
  if (hLocation) {
    builder.text(hLocation);
  }
  if (hPhone) {
    builder.text('Ph: ' + hPhone);
  }
  if (data.hotelEmail) {
    builder.text('Email: ' + data.hotelEmail);
  }
  if (data.hotelFssai) {
    builder.text('FSSAI No: ' + data.hotelFssai);
  }
  
  builder.alignLeft();
  builder.bold(true);
  builder.line('-', LINE_WIDTH);
  builder.alignCenter().setFontLarge().text('INVOICE').setFontNormal();
  builder.alignLeft();
  builder.line('-', LINE_WIDTH);
  
  if (data.table) {
    let tStr = '';
    const tableStr = String(data.table);
    if (tableStr.toLowerCase().includes('room') || tableStr.toLowerCase().includes('parcel')) {
      tStr = tableStr;
    } else {
      tStr = `Table: ${tableStr}`;
    }
    builder.text(mg + padText(tStr, LINE_WIDTH));
  }
  
  builder.text(mg + padText(`Bill No: #${data.billId || ''}`, LINE_WIDTH));
  
  const d = new Date();
  const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + 
                  d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  builder.text(mg + padText(`Date: ${dateStr}`, LINE_WIDTH));

  if (data.guestName) {
    builder.text(mg + padText(`Guest: ${data.guestName.toUpperCase()}`, LINE_WIDTH));
  }
  if (data.checkInDate) {
    const checkInDateObj = new Date(data.checkInDate);
    const checkOutDateObj = new Date(checkInDateObj.getTime() + (data.booking_days || 1) * 86400000);
    const checkInStr = checkInDateObj.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const checkOutStr = checkOutDateObj.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    
    builder.text(mg + padText(`Check-In: ${checkInStr}`, LINE_WIDTH));
    builder.text(mg + padText(`Check-Out: ${checkOutStr}`, LINE_WIDTH));
  }
  
  builder.line('-', LINE_WIDTH);
  
  builder.text(
    mg + padText('ITEM', ACTUAL_ITEM_LEN) + ' ' +
    padText('PRICE', PRC_LEN, 'right') + ' ' + 
    padText('QTY', QTY_LEN, 'right') + ' ' + 
    padText('TOTAL', TOT_LEN, 'right')
  );
  builder.line('-', LINE_WIDTH);
  builder.bold(false);

  if (data.room_charge > 0) {
    const rDays = data.booking_days || 1;
    builder.text(
      mg + padText('Room Charge', ACTUAL_ITEM_LEN) + ' ' +
      padText(Math.round(data.room_charge / rDays), PRC_LEN, 'right') + ' ' + 
      padText(rDays, QTY_LEN, 'right') + ' ' + 
      padText(Math.round(data.room_charge), TOT_LEN, 'right')
    );
  }
  
  (data.items || []).forEach(i => {
    const qty = i.quantity || i.qty || 1;
    const nameStr = toTitleCase(String(i.name));
    const firstChunk = nameStr.substring(0, ACTUAL_ITEM_LEN);
    let remainingStr = nameStr.substring(ACTUAL_ITEM_LEN);
    
    builder.text(
      mg + padText(firstChunk, ACTUAL_ITEM_LEN) + ' ' +
      padText(Math.round(i.price), PRC_LEN, 'right') + ' ' + 
      padText(qty, QTY_LEN, 'right') + ' ' + 
      padText(Math.round(i.price * qty), TOT_LEN, 'right')
    );

    const SUB_CHUNK_LEN = ACTUAL_ITEM_LEN - 2;
    while (remainingStr.length > 0) {
      const subChunk = remainingStr.substring(0, SUB_CHUNK_LEN);
      builder.text(mg + "  " + padText(subChunk, LINE_WIDTH - 2));
      remainingStr = remainingStr.substring(SUB_CHUNK_LEN);
    }
  });
  
  builder.line('-', LINE_WIDTH);
  
  const subtotalVal = parseFloat(data.subtotal || 0);
  const gstVal = parseFloat(data.gst || 0);
  const finalAmount = parseFloat(data.finalAmount || data.total || 0);
  
  let addedSubItems = false;
  if (gstVal > 0) {
    builder.text(mg + padText(`GST (${data.gst_percentage || 5}%):`, LINE_WIDTH - TOT_LEN, 'right') + padText(Math.round(gstVal), TOT_LEN, 'right'));
    addedSubItems = true;
  }
  
  if (data.discountPercentage > 0) {
    const discAmt = (subtotalVal + gstVal) * (data.discountPercentage / 100);
    builder.text(mg + padText(`Disc (${data.discountPercentage}%):`, LINE_WIDTH - TOT_LEN, 'right') + padText('-' + Math.round(discAmt), TOT_LEN, 'right'));
    addedSubItems = true;
  }
  
  if (addedSubItems) {
    builder.line('-', LINE_WIDTH);
  }
  
  const totalText = 'TOTAL: Rs ' + Math.round(finalAmount);
  builder.bold(true).text(mg + padText(totalText, LINE_WIDTH, 'right')).bold(false);
  builder.line('-', LINE_WIDTH);
  
  builder.alignLeft();
  builder.text(mg + padText('Thank You! Visit Again!', LINE_WIDTH, 'center'));
  builder.bold(false);
  
  if (!data.isPaid && data.upiId) {
    builder.text(mg + padText('[Scan to Pay via UPI]', LINE_WIDTH, 'center'));
    builder.alignCenter();
    const upiLink = `upi://pay?pa=${data.upiId}&pn=${encodeURIComponent(hName)}&am=${Math.round(finalAmount)}&cu=INR`;
    const qrBuffer = getQRCodeBuffer(upiLink, is58mm);
    builder.bufferList.push(qrBuffer);
  }
  
  builder.feed(3)
    .cut();
     
  return builder.build();
}

module.exports = {
  formatKOT,
  formatBill
};
