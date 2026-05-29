/**
 * Raw ESC/POS Command Constants
 */
const ESC = 0x1B;
const GS = 0x1D;

const CMD_INIT = Buffer.from([ESC, 0x40, ESC, 0x47, 0x01]); // Initialize and enable double-strike printing for darker text
const CMD_ALIGN_LEFT = Buffer.from([ESC, 0x61, 0x00]);
const CMD_ALIGN_CENTER = Buffer.from([ESC, 0x61, 0x01]);
const CMD_ALIGN_RIGHT = Buffer.from([ESC, 0x61, 0x02]);

const CMD_TEXT_NORMAL = Buffer.from([GS, 0x21, 0x00]);
const CMD_TEXT_DOUBLE = Buffer.from([GS, 0x21, 0x11]); // Double width + double height
const CMD_TEXT_LARGE = Buffer.from([GS, 0x21, 0x01]); // Double height

const CMD_BOLD_ON = Buffer.from([ESC, 0x45, 0x01]);
const CMD_BOLD_OFF = Buffer.from([ESC, 0x45, 0x00]);

const CMD_CUT = Buffer.from([GS, 0x56, 0x41, 0x03]); // Full cut with feed

class EscposBuilder {
  constructor() {
    this.bufferList = [CMD_INIT];
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
    this.bufferList.push(CMD_TEXT_NORMAL);
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
  const LINE_WIDTH = is58mm ? 30 : 42;
  const mg = is58mm ? '          ' : ''; // 10 spaces visual margin offset centering for 58mm
  
  const builder = new EscposBuilder();
  const dateStr = new Date().toLocaleString();

  builder.alignCenter()
    .setFontDouble()
    .bold()
    .text(mg + 'KITCHEN ORDER')
    .setFontNormal()
    .bold(false)
    .line('=', LINE_WIDTH)
    .alignLeft()
    .bold()
    .text(mg + `TABLE: ${data.table}`)
    .text(mg + `WAITER: ${data.waiter}`)
    .bold(false)
    .text(mg + `DATE: ${dateStr}`)
    .line('-', LINE_WIDTH)
    .setFontLarge()
    .bold();

  // Print items
  data.items.forEach(item => {
    const qty = item.quantity || item.qty || 1;
    builder.text(mg + `${qty} x ${item.name}`);
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

  builder.feed(4)
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

/**
 * Generate native ESC/POS QR code commands
 */
function getQRCodeBuffer(dataStr) {
  const dataBytes = Buffer.from(dataStr, 'utf8');
  const len = dataBytes.length + 3;
  const pL = len & 0xFF;
  const pH = (len >> 8) & 0xFF;

  const modelCmd = Buffer.from([0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]);
  const sizeCmd = Buffer.from([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x09]); // cell size 9 (consumes full width of 58mm)
  const ecCmd = Buffer.from([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x30]); // Error correction Level L
  const storeCmdHeader = Buffer.from([0x1D, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30]);
  const storeCmd = Buffer.concat([storeCmdHeader, dataBytes]);
  const printCmd = Buffer.from([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30]);

  return Buffer.concat([modelCmd, sizeCmd, ecCmd, storeCmd, printCmd]);
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
  const LINE_WIDTH = is58mm ? 30 : 42; 
  const mg = is58mm ? '          ' : ''; // 10 spaces visual margin offset centering for 58mm
  const divider = mg + '-'.repeat(LINE_WIDTH) + '\n';
  
  const builder = new EscposBuilder();
  
  // Header
  builder.alignCenter()
    .bold(true)
    .text(mg + padText(hName.toUpperCase(), LINE_WIDTH, 'center'))
    .bold(false);
    
  if (hLocation) {
    builder.text(mg + padText(hLocation, LINE_WIDTH, 'center'));
  }
  if (hPhone) {
    builder.text(mg + padText('Ph: ' + hPhone, LINE_WIDTH, 'center'));
  }
  
  builder.alignLeft();
  builder.bufferList.push(Buffer.from(divider, 'utf8'));
  builder.alignCenter().bold(true).text(mg + padText('INVOICE', LINE_WIDTH, 'center')).bold(false);
  builder.alignLeft();
  builder.bufferList.push(Buffer.from(divider, 'utf8'));
  
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
  
  builder.bufferList.push(Buffer.from(divider, 'utf8'));
  
  const ACTUAL_ITEM_LEN = is58mm ? 14 : 19;
  const PRC_LEN = is58mm ? 6 : 8;
  const QTY_LEN = is58mm ? 2 : 4;
  const TOT_LEN = is58mm ? 5 : 8;
  
  builder.text(
    mg + padText('ITEM', ACTUAL_ITEM_LEN) + ' ' +
    padText('PRICE', PRC_LEN, 'right') + ' ' + 
    padText('QTY', QTY_LEN, 'right') + ' ' + 
    padText('TOTAL', TOT_LEN, 'right')
  );
  builder.bufferList.push(Buffer.from(divider, 'utf8'));

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
    let name = i.name;
    if (name.length > ACTUAL_ITEM_LEN) name = name.substring(0, ACTUAL_ITEM_LEN - 2) + '..';
    
    const qty = i.quantity || i.qty || 1;
    builder.text(
      mg + padText(name, ACTUAL_ITEM_LEN) + ' ' +
      padText(Math.round(i.price), PRC_LEN, 'right') + ' ' + 
      padText(qty, QTY_LEN, 'right') + ' ' + 
      padText(Math.round(i.price * qty), TOT_LEN, 'right')
    );
  });
  
  builder.bufferList.push(Buffer.from(divider, 'utf8'));
  
  const subtotalVal = parseFloat(data.subtotal || 0);
  const gstVal = parseFloat(data.gst || 0);
  const finalAmount = parseFloat(data.finalAmount || data.total || 0);
  
  if (gstVal > 0) {
    builder.text(mg + padText(`GST (${data.gst_percentage || 5}%):`, LINE_WIDTH - TOT_LEN, 'right') + padText(Math.round(gstVal), TOT_LEN, 'right'));
  }
  
  if (data.discountPercentage > 0) {
    const discAmt = (subtotalVal + gstVal) * (data.discountPercentage / 100);
    builder.text(mg + padText(`Disc (${data.discountPercentage}%):`, LINE_WIDTH - TOT_LEN, 'right') + padText('-' + Math.round(discAmt), TOT_LEN, 'right'));
  }
  
  builder.bufferList.push(Buffer.from(divider, 'utf8'));
  
  const totalText = 'TOTAL: Rs ' + Math.round(finalAmount);
  builder.bold(true).text(mg + padText(totalText, LINE_WIDTH, 'right')).bold(false);
  builder.bufferList.push(Buffer.from(divider, 'utf8'));
  
  builder.alignLeft();
  builder.text(mg + padText('Thank You! Visit Again!', LINE_WIDTH, 'center'));
  
  if (!data.isPaid && data.upiId) {
    builder.text(mg + padText('[Scan to Pay via UPI]', LINE_WIDTH, 'center'));
    builder.alignCenter();
    const upiLink = `upi://pay?pa=${data.upiId}&pn=${encodeURIComponent(hName)}&am=${Math.round(finalAmount)}&cu=INR`;
    const qrBuffer = getQRCodeBuffer(upiLink);
    builder.bufferList.push(qrBuffer);
  }
  
  builder.feed(1)
    .cut();
     
  return builder.build();
}

module.exports = {
  formatKOT,
  formatBill
};
