const { getIO } = require('../socket');
const printFormatter = require('./printFormatter');
const printerManager = require('./printerManager');
const configManager = require('../config/configManager');

/**
 * Service to generate print payloads and spool them directly to local printers and remote socket rooms.
 */
class PrintService {
  /**
   * Resolves per-printer paper size from config.json, falling back to payload or 80mm default.
   * @param {string} printerKey - 'billing' | 'kitchen'
   * @param {object} payload - the print job payload
   * @returns {string} '58mm' or '80mm'
   */
  _resolvePaperSize(printerKey, payload) {
    try {
      const config = configManager.getConfig();
      const printerCfg = config.printers?.[printerKey];
      if (printerCfg?.paperSize) return printerCfg.paperSize;
    } catch (e) { /* fallback */ }
    return payload.printerSize || '80mm';
  }

  /**
   * Spools a print job to both the local physical printer queue and remote socket clients.
   * @param {number|string} hotelId 
   * @param {object} payload 
   * @returns {boolean}
   */
  emitPrintJob(hotelId, payload) {
    try {
      // 1. Broadcast over WebSockets (for secondary agents or network dashboards)
      const io = getIO();
      if (io) {
        const roomName = `hotel-${hotelId}`;
        console.log(`[PRINT SERVICE] Broadcasting print-job (${payload.type}) to socket room: ${roomName}`);
        io.to(roomName).emit('print-job', payload);
      }

      // 2. Direct Offline Physical Printing
      // Bypasses network delays and prints instantly to the local thermal printer connected to the host PC!
      console.log(`[PRINT SERVICE] Spooling physical print job locally: [${payload.type}]`);
      if (payload.type === 'KOT') {
        // Resolve per-printer paper size from config (kitchen printer)
        const paperSize = this._resolvePaperSize('kitchen', payload);
        const binaryBuffer = printFormatter.formatKOT({ ...payload, printerSize: paperSize });
        printerManager.queueJob({ type: 'KOT', payload: binaryBuffer });
      } else if (payload.type === 'FINAL_BILL') {
        // Resolve per-printer paper size from config (billing printer)
        const paperSize = this._resolvePaperSize('billing', payload);
        const binaryBuffer = printFormatter.formatBill({ ...payload, printerSize: paperSize });
        printerManager.queueJob({ type: 'FINAL_BILL', payload: binaryBuffer });
      }

      return true;
    } catch (err) {
      console.error(`[PRINT SERVICE] Offline printing failed:`, err.message);
      return false;
    }
  }

  /**
   * Generates and spools a KOT (Kitchen Order Ticket) payload.
   */
  sendKOT({ hotelId, table, waiter, items, notes }) {
    const payload = {
      type: 'KOT',
      printer: 'kitchen',
      hotelId: Number(hotelId),
      table: String(table),
      waiter: waiter || 'Staff',
      items: items.map(item => ({
        name: item.name,
        qty: Number(item.quantity || item.qty || 1)
      })),
      notes: notes || ''
    };

    return this.emitPrintJob(hotelId, payload);
  }

  /**
   * Generates and spools a FINAL_BILL payload.
   */
  sendFinalBill({ hotelId, billId, table, subtotal, gst, finalAmount, discountPercentage, items, hotelName, hotelPhone, hotelLocation, upiId, isPaid, room_charge, booking_days, printerSize, gst_percentage }) {
    const payload = {
      type: 'FINAL_BILL',
      printer: 'billing',
      hotelId: Number(hotelId),
      billId: Number(billId),
      table: String(table),
      subtotal: Number(subtotal),
      gst: Number(gst),
      finalAmount: Number(finalAmount),
      discountPercentage: Number(discountPercentage || 0),
      items: items.map(item => ({
        name: item.name,
        price: Number(item.price),
        qty: Number(item.quantity || item.qty || 1)
      })),
      hotelName: hotelName || '',
      hotelPhone: hotelPhone || '',
      hotelLocation: hotelLocation || '',
      upiId: upiId || '',
      isPaid: Boolean(isPaid),
      room_charge: Number(room_charge || 0),
      booking_days: Number(booking_days || 1),
      printerSize: printerSize || '80mm',
      gst_percentage: Number(gst_percentage || 0)
    };

    return this.emitPrintJob(hotelId, payload);
  }
}

module.exports = new PrintService();
