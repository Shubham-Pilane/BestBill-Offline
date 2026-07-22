const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const db = require('../db/db');
const configManager = require('../config/configManager');

// Helper to format Date into local YYYY-MM-DD
function getLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper to subtract days and format as YYYY-MM-DD
function datetimeSubDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - days);
  return getLocalDateString(d);
}

// Get the date range for report based on frequency
function getDateRange(targetDate, frequency) {
  const endDate = targetDate;
  let startDate = targetDate;

  if (frequency === 'weekly') {
    startDate = datetimeSubDays(targetDate, 6);
  } else if (frequency === 'monthly') {
    startDate = datetimeSubDays(targetDate, 29);
  }

  return { startDate, endDate };
}

// Format currency
function formatCurrency(amount) {
  return `Rs. ${Number(amount).toFixed(2)}`;
}

// Compile stats from database
async function getReportData(startDate, endDate) {
  // 1. Hotel info
  const hotelRes = await db.query('SELECT name, phone, location FROM hotels LIMIT 1');
  const hotel = hotelRes.rows[0] || { name: 'BestBill POS Hotel', phone: '', location: '' };

  // 2. Revenue & orders
  const revRes = await db.query(
    `SELECT 
       COALESCE(SUM(final_amount), 0) as total_revenue,
       COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN final_amount ELSE 0 END), 0) as cash_collection,
       COALESCE(SUM(CASE WHEN payment_method IN ('upi', 'online') THEN final_amount ELSE 0 END), 0) as online_collection,
       COUNT(*) as total_orders
     FROM bills
     WHERE date(created_at) >= date($1) AND date(created_at) <= date($2)`,
    [startDate, endDate]
  );
  const rev = revRes.rows[0] || { total_revenue: 0, cash_collection: 0, online_collection: 0, total_orders: 0 };

  // 3. Dine-In vs Parcel sales
  const salesTypeRes = await db.query(
    `SELECT 
       COALESCE(SUM(CASE WHEN (o.table_id IS NOT NULL AND LOWER(COALESCE(t.table_number, '')) NOT LIKE '%parcel%' AND LOWER(COALESCE(t.table_number, '')) NOT LIKE '%token%' AND LOWER(COALESCE(t.floor, '')) NOT LIKE '%counter%') THEN b.final_amount ELSE 0 END), 0) as dine_in_sales,
       COALESCE(SUM(CASE WHEN (o.table_id IS NULL AND o.room_id IS NULL) OR LOWER(COALESCE(t.table_number, '')) LIKE '%parcel%' OR LOWER(COALESCE(t.table_number, '')) LIKE '%token%' OR LOWER(COALESCE(t.floor, '')) LIKE '%counter%' THEN b.final_amount ELSE 0 END), 0) as parcel_sales
     FROM bills b
     JOIN orders o ON b.order_id = o.id
     LEFT JOIN tables t ON o.table_id = t.id
     WHERE date(b.created_at) >= date($1) AND date(b.created_at) <= date($2)`,
    [startDate, endDate]
  );
  const salesType = salesTypeRes.rows[0] || { dine_in_sales: 0, parcel_sales: 0 };

  // 4. Payment Method summary table
  const paySummaryRes = await db.query(
    `SELECT 
       COALESCE(payment_method, 'unspecified') as method, 
       COUNT(*) as tx_count, 
       COALESCE(SUM(final_amount), 0) as total_amount
     FROM bills
     WHERE date(created_at) >= date($1) AND date(created_at) <= date($2)
     GROUP BY payment_method`,
    [startDate, endDate]
  );
  const paymentSummary = paySummaryRes.rows;

  // 5. Item Sales summary (uses order_items which is retained for 3 days)
  const itemSummaryRes = await db.query(
    `SELECT 
       mi.name as item_name, 
       SUM(oi.quantity) as qty, 
       SUM(oi.quantity * mi.price) as amount
     FROM order_items oi
     JOIN menu_items mi ON oi.menu_item_id = mi.id
     JOIN orders o ON oi.order_id = o.id
     JOIN bills b ON b.order_id = o.id
     WHERE date(b.created_at) >= date($1) AND date(b.created_at) <= date($2)
     GROUP BY mi.name
     ORDER BY qty DESC`,
    [startDate, endDate]
  );
  const itemSummary = itemSummaryRes.rows;

  return {
    hotel,
    startDate,
    endDate,
    totalRevenue: rev.total_revenue,
    cashCollection: rev.cash_collection,
    onlineCollection: rev.online_collection,
    totalOrders: rev.total_orders,
    customersServed: rev.total_orders, // estimated by total orders/transactions
    dineInSales: salesType.dine_in_sales,
    parcelSales: salesType.parcel_sales,
    paymentSummary,
    itemSummary
  };
}

// Generate PDF Report
function generatePdfReport(data, filePath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40 });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // Colors
      const primaryColor = '#1e293b';
      const secondaryColor = '#0ea5e9';
      const textColor = '#334155';
      const mutedTextColor = '#64748b';
      const lightBg = '#f8fafc';

      // 1. Header block
      doc.rect(0, 0, 612, 100).fill(primaryColor);
      doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold').text(data.hotel.name, 40, 25);
      
      let dateText = data.startDate === data.endDate 
        ? `Date: ${data.startDate}`
        : `Period: ${data.startDate} to ${data.endDate}`;
      
      doc.fillColor(secondaryColor).fontSize(12).text(dateText, 40, 52);
      doc.fillColor('#94a3b8').fontSize(9).font('Helvetica').text(`Phone: ${data.hotel.phone || 'N/A'} | Location: ${data.hotel.location || 'N/A'}`, 40, 68);

      // Title badge
      doc.rect(420, 25, 150, 25).fill(secondaryColor);
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text('SALES SUMMARY', 430, 32, { width: 130, align: 'center' });

      let y = 120;

      // 2. Summary stats grid
      doc.fillColor(primaryColor).fontSize(14).font('Helvetica-Bold').text('Key Metrics', 40, y);
      y += 20;

      const gridCols = [
        { label: 'Total Revenue', value: formatCurrency(data.totalRevenue), color: '#10b981' },
        { label: 'Total Bills/Orders', value: String(data.totalOrders), color: '#3b82f6' },
        { label: 'Cash Collection', value: formatCurrency(data.cashCollection), color: '#f59e0b' },
        { label: 'Online/UPI', value: formatCurrency(data.onlineCollection), color: '#8b5cf6' }
      ];

      // Draw grid
      let colWidth = 125;
      let gap = 14;
      gridCols.forEach((col, idx) => {
        let x = 40 + idx * (colWidth + gap);
        doc.rect(x, y, colWidth, 55).fill(lightBg);
        doc.rect(x, y, colWidth, 2).fill(col.color);
        doc.fillColor(mutedTextColor).fontSize(8).font('Helvetica-Bold').text(col.label.toUpperCase(), x + 8, y + 8);
        doc.fillColor(col.color).fontSize(13).font('Helvetica-Bold').text(col.value, x + 8, y + 25);
      });

      y += 75;

      // 3. Dine-In vs Parcel breakdown
      doc.rect(40, y, 258, 70).fill(lightBg);
      doc.rect(40, y, 2, 70).fill(secondaryColor);
      doc.fillColor(primaryColor).fontSize(10).font('Helvetica-Bold').text('Dine-In Sales', 52, y + 10);
      doc.fillColor(textColor).fontSize(14).font('Helvetica-Bold').text(formatCurrency(data.dineInSales), 52, y + 25);
      
      doc.rect(312, y, 258, 70).fill(lightBg);
      doc.rect(312, y, 2, 70).fill(secondaryColor);
      doc.fillColor(primaryColor).fontSize(10).font('Helvetica-Bold').text('Parcel / Room Sales', 324, y + 10);
      doc.fillColor(textColor).fontSize(14).font('Helvetica-Bold').text(formatCurrency(data.parcelSales), 324, y + 25);

      y += 90;

      // 4. Payment Method summary table
      doc.fillColor(primaryColor).fontSize(12).font('Helvetica-Bold').text('Payment Method Breakdown', 40, y);
      y += 15;

      // Table Header
      doc.rect(40, y, 530, 20).fill(primaryColor);
      doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
      doc.text('METHOD', 50, y + 6);
      doc.text('TRANSACTION COUNT', 220, y + 6);
      doc.text('TOTAL AMOUNT', 420, y + 6);
      y += 20;

      doc.fillColor(textColor).fontSize(9).font('Helvetica');
      data.paymentSummary.forEach((row, idx) => {
        if (idx % 2 === 1) {
          doc.rect(40, y, 530, 18).fill('#f1f5f9');
        }
        doc.fillColor(textColor).text(String(row.method).toUpperCase(), 50, y + 5);
        doc.text(String(row.tx_count), 220, y + 5);
        doc.text(formatCurrency(row.total_amount), 420, y + 5);
        y += 18;
      });

      y += 25;

      // Check page height limit for Item Summary, add new page if needed
      if (y > 450) {
        doc.addPage();
        y = 40;
      }

      // 5. Item Sales summary table
      doc.fillColor(primaryColor).fontSize(12).font('Helvetica-Bold').text('Top Selling Items', 40, y);
      y += 15;

      doc.rect(40, y, 530, 20).fill(primaryColor);
      doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
      doc.text('ITEM NAME', 50, y + 6);
      doc.text('QTY SOLD', 320, y + 6);
      doc.text('REVENUE GENERATED', 440, y + 6);
      y += 20;

      doc.fillColor(textColor).fontSize(9).font('Helvetica');
      if (data.itemSummary.length === 0) {
        doc.text('No item sales details found for this period.', 50, y + 5);
        y += 18;
      } else {
        data.itemSummary.forEach((row, idx) => {
          // If we run out of vertical space on this page, add a new page
          if (y > 700) {
            doc.addPage();
            y = 40;
            // Draw table header again on new page
            doc.rect(40, y, 530, 20).fill(primaryColor);
            doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
            doc.text('ITEM NAME', 50, y + 6);
            doc.text('QTY SOLD', 320, y + 6);
            doc.text('REVENUE GENERATED', 440, y + 6);
            y += 20;
          }

          if (idx % 2 === 1) {
            doc.rect(40, y, 530, 18).fill('#f1f5f9');
          }
          doc.fillColor(textColor).text(row.item_name, 50, y + 5);
          doc.text(String(row.qty), 320, y + 5);
          doc.text(formatCurrency(row.amount), 440, y + 5);
          y += 18;
        });
      }

      // Footer
      doc.fillColor(mutedTextColor).fontSize(8).text('Generated automatically by BestBill POS System.', 40, 740, { align: 'center' });

      doc.end();
      stream.on('finish', () => resolve(true));
      stream.on('error', err => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

// Build Nodemailer Transporter
function getMailTransporter(config) {
  const provider = config.emailReportProvider || 'gmail';
  if (provider === 'gmail') {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.emailReportSender,
        pass: config.emailReportPassword
      }
    });
  } else {
    return nodemailer.createTransport({
      host: config.emailReportSmtpHost,
      port: Number(config.emailReportSmtpPort) || 465,
      secure: config.emailReportSmtpSecure !== false,
      auth: {
        user: config.emailReportSender,
        pass: config.emailReportPassword
      }
    });
  }
}

// Generate report PDF, create email, and dispatch
async function generateAndSendReportForDate(targetDate, frequency) {
  const config = configManager.getConfig();
  const range = getDateRange(targetDate, frequency);
  
  const os = require('os');
  const tempDir = os.tmpdir();
  const pdfPath = path.join(tempDir, `sales_report_${targetDate}.pdf`);

  try {
    console.log(`[EMAIL REPORT] Compiling sales statistics for ${targetDate} (${frequency})...`);
    const data = await getReportData(range.startDate, range.endDate);

    console.log(`[EMAIL REPORT] Generating sales report PDF to: ${pdfPath}...`);
    await generatePdfReport(data, pdfPath);

    console.log(`[EMAIL REPORT] Setting up email dispatcher...`);
    const transporter = getMailTransporter(config);

    const freqLabel = String(frequency).toUpperCase();
    const periodText = range.startDate === range.endDate 
      ? `for Date: ${range.startDate}`
      : `for Period: ${range.startDate} to ${range.endDate}`;

    const mailOptions = {
      from: `"BestBill POS Reports" <${config.emailReportSender}>`,
      to: config.emailReportRecipient,
      subject: `[BestBill POS] ${freqLabel} Sales Summary ${periodText}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; color: #334155;">
          <div style="background-color: #1e293b; padding: 24px; text-align: center; color: white;">
            <h1 style="margin: 0; font-size: 20px;">Daily Sales Dispatch</h1>
            <p style="margin: 4px 0 0 0; color: #0ea5e9; font-size: 14px;">${data.hotel.name}</p>
          </div>
          <div style="padding: 24px; line-height: 1.6;">
            <p>Hello Hotel Owner,</p>
            <p>Please find attached the detailed PDF sales report generated by your BestBill POS system ${periodText}.</p>
            
            <div style="background-color: #f8fafc; border-left: 4px solid #0ea5e9; padding: 16px; border-radius: 4px; margin: 20px 0;">
              <h3 style="margin: 0 0 12px 0; color: #1e293b;">Executive Summary</h3>
              <table style="width: 100%; font-size: 14px;">
                <tr>
                  <td style="color: #64748b; padding: 4px 0;">Total Revenue:</td>
                  <td style="font-weight: bold; color: #10b981; text-align: right;">${formatCurrency(data.totalRevenue)}</td>
                </tr>
                <tr>
                  <td style="color: #64748b; padding: 4px 0;">Cash Collection:</td>
                  <td style="font-weight: bold; color: #f59e0b; text-align: right;">${formatCurrency(data.cashCollection)}</td>
                </tr>
                <tr>
                  <td style="color: #64748b; padding: 4px 0;">Online/UPI Collection:</td>
                  <td style="font-weight: bold; color: #8b5cf6; text-align: right;">${formatCurrency(data.onlineCollection)}</td>
                </tr>
                <tr>
                  <td style="color: #64748b; padding: 4px 0;">Dine-In Sales:</td>
                  <td style="font-weight: bold; text-align: right;">${formatCurrency(data.dineInSales)}</td>
                </tr>
                <tr>
                  <td style="color: #64748b; padding: 4px 0;">Parcel Sales:</td>
                  <td style="font-weight: bold; text-align: right;">${formatCurrency(data.parcelSales)}</td>
                </tr>
                <tr>
                  <td style="color: #64748b; padding: 4px 0;">Total Orders/Bills:</td>
                  <td style="font-weight: bold; text-align: right;">${data.totalOrders}</td>
                </tr>
              </table>
            </div>

            <p style="font-size: 13px; color: #64748b;">Note: Internet is only required to send this email. The billing application itself remains completely offline.</p>
          </div>
          <div style="background-color: #f1f5f9; padding: 16px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
            This email was generated automatically by BestBill POS client.
          </div>
        </div>
      `,
      attachments: [
        {
          filename: `${freqLabel}_Sales_Report_${targetDate}.pdf`,
          path: pdfPath
        }
      ]
    };

    console.log(`[EMAIL REPORT] Dispatching email via SMTP...`);
    await transporter.sendMail(mailOptions);
    console.log(`[EMAIL REPORT] Email successfully dispatched to ${config.emailReportRecipient}`);
    
    // Cleanup temp PDF file
    if (fs.existsSync(pdfPath)) {
      fs.unlinkSync(pdfPath);
    }
    return true;
  } catch (err) {
    console.error(`[EMAIL REPORT FAILED] Error processing report for date ${targetDate}:`, err.message);
    // Cleanup temp PDF if exists
    if (fs.existsSync(pdfPath)) {
      fs.unlinkSync(pdfPath);
    }
    return false;
  }
}

// Send Verification Test Email
async function sendTestEmail(settings) {
  const os = require('os');
  const tempDir = os.tmpdir();
  const testDate = getLocalDateString(new Date());
  const pdfPath = path.join(tempDir, `test_report_${testDate}.pdf`);

  // Build mock statistics for test PDF
  const mockData = {
    hotel: { name: 'BestBill Test Hotel Connection', phone: '9822401802', location: 'Staging Environment' },
    startDate: testDate,
    endDate: testDate,
    totalRevenue: 8750.00,
    cashCollection: 4250.00,
    onlineCollection: 4500.00,
    totalOrders: 12,
    customersServed: 12,
    dineInSales: 6200.00,
    parcelSales: 2550.00,
    paymentSummary: [
      { method: 'cash', tx_count: 5, total_amount: 4250.00 },
      { method: 'upi', tx_count: 6, total_amount: 4000.00 },
      { method: 'online', tx_count: 1, total_amount: 500.00 }
    ],
    itemSummary: [
      { item_name: 'Paneer Butter Masala', qty: 5, amount: 950.00 },
      { item_name: 'Veg Biryani', qty: 4, amount: 800.00 },
      { item_name: 'Butter Naan', qty: 15, amount: 600.00 }
    ]
  };

  try {
    await generatePdfReport(mockData, pdfPath);

    const transporter = getMailTransporter(settings);

    const mailOptions = {
      from: `"BestBill Connection Test" <${settings.emailReportSender}>`,
      to: settings.emailReportRecipient,
      subject: `[BestBill POS] Verification Test Email`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; color: #334155;">
          <h2 style="color: #10b981;">SMTP Connection Successful!</h2>
          <p>This email was triggered via the **Test Connection** button on your BestBill settings dashboard.</p>
          <p>If you are receiving this message, it confirms that your SMTP details are **correct** and Nodemailer is able to authenticate and dispatch emails from your account.</p>
          <p>A mock sales PDF report is attached to verify attachment rendering.</p>
          <br>
          <p>Best regards,<br>BestBill POS Team</p>
        </div>
      `,
      attachments: [
        {
          filename: `Test_Sales_Report.pdf`,
          path: pdfPath
        }
      ]
    };

    await transporter.sendMail(mailOptions);
    
    if (fs.existsSync(pdfPath)) {
      fs.unlinkSync(pdfPath);
    }
    return { success: true, message: 'SMTP credentials verified! Test email successfully sent.' };
  } catch (err) {
    if (fs.existsSync(pdfPath)) {
      fs.unlinkSync(pdfPath);
    }
    throw err;
  }
}

// Background scheduler execution loop
let isRunningCheck = false;

async function checkAndSendReports() {
  if (isRunningCheck) return;
  isRunningCheck = true;

  try {
    const config = configManager.getConfig();
    
    // Check if both module licensing and dispatch settings are enabled
    if (!config.emailReportModuleEnabled || !config.emailReportEnabled) {
      isRunningCheck = false;
      return;
    }

    if (!config.emailReportRecipient || !config.emailReportSender || !config.emailReportPassword) {
      isRunningCheck = false;
      return;
    }

    const todayStr = getLocalDateString(new Date());
    let lastSent = config.lastEmailReportDate;

    // First time launch: initialize last sent as yesterday so we don't trigger years of archives
    if (!lastSent) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      lastSent = getLocalDateString(yesterday);
      config.lastEmailReportDate = lastSent;
      configManager.saveConfig(config);
      console.log(`[EMAIL REPORT] Initializing lastEmailReportDate config to: ${lastSent}`);
    }

    // Set next date to check (lastSent + 1 day)
    const nextDate = new Date(lastSent);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextCheckStr = getLocalDateString(nextDate);

    const today = new Date(todayStr);

    // Scenario A: Check date is in the past (Catch up)
    if (nextDate < today) {
      console.log(`[EMAIL REPORT] Missed report detected for date ${nextCheckStr}. Attempting to catch up...`);
      const success = await generateAndSendReportForDate(nextCheckStr, config.emailReportFrequency);
      if (success) {
        config.lastEmailReportDate = nextCheckStr;
        configManager.saveConfig(config);
      }
    } 
    // Scenario B: Check date is today (Standard Schedule)
    else if (nextCheckStr === todayStr) {
      const now = new Date();
      const reportTimeStr = config.emailReportTime || '23:00';
      const [rHour, rMin] = reportTimeStr.split(':').map(Number);
      
      const reportTimeToday = new Date();
      reportTimeToday.setHours(rHour, rMin, 0, 0);

      if (now >= reportTimeToday) {
        console.log(`[EMAIL REPORT] Report time reached for today (${nextCheckStr}). Dispatches executing...`);
        const success = await generateAndSendReportForDate(nextCheckStr, config.emailReportFrequency);
        if (success) {
          config.lastEmailReportDate = nextCheckStr;
          configManager.saveConfig(config);
        }
      }
    }
  } catch (err) {
    console.error('[EMAIL REPORT SCHEDULER ERROR]', err.message);
  } finally {
    isRunningCheck = false;
  }
}

// Start scheduler checking
function startScheduler() {
  console.log('[EMAIL REPORT] Background scheduler active (Checking every 1 minute).');
  // First run after 10 seconds of server bootup
  setTimeout(() => {
    checkAndSendReports().catch(err => console.error('[EMAIL REPORT SCHEDULER BOOTUP ERROR]', err));
  }, 10000);

  // Set interval checking
  setInterval(checkAndSendReports, 60000);
}

module.exports = {
  startScheduler,
  sendTestEmail,
  generateAndSendReportForDate
};
