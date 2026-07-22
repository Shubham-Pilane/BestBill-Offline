const db = require('../db/db');
const configManager = require('../config/configManager');

// Helper to get local date string YYYY-MM-DD
function getLocalDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Collect analytics metrics from local SQLite database for given date
 */
async function getDailyAnalyticsData(targetDateStr) {
  try {
    // 1. Hotel information
    const hotelRes = await db.query('SELECT name, location, phone FROM hotels LIMIT 1');
    const hotel = hotelRes.rows[0] || { name: 'BestBill Hotel', location: '', phone: '' };

    // 2. Revenue and billing counts
    const revRes = await db.query(
      `SELECT 
         COALESCE(SUM(final_amount), 0) as total_revenue,
         COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN final_amount ELSE 0 END), 0) as cash_collection,
         COALESCE(SUM(CASE WHEN payment_method IN ('upi', 'online', 'card') THEN final_amount ELSE 0 END), 0) as online_collection,
         COUNT(*) as total_orders
       FROM bills
       WHERE date(created_at) = date($1)`,
      [targetDateStr]
    );
    const rev = revRes.rows[0] || { total_revenue: 0, cash_collection: 0, online_collection: 0, total_orders: 0 };

    // 3. Dine-in vs Parcel breakdown
    const salesTypeRes = await db.query(
      `SELECT 
         COALESCE(SUM(CASE WHEN (o.table_id IS NOT NULL AND LOWER(COALESCE(t.table_number, '')) NOT LIKE '%parcel%' AND LOWER(COALESCE(t.table_number, '')) NOT LIKE '%token%' AND LOWER(COALESCE(t.floor, '')) NOT LIKE '%counter%') THEN b.final_amount ELSE 0 END), 0) as dine_in_sales,
         COALESCE(SUM(CASE WHEN (o.table_id IS NULL AND o.room_id IS NULL) OR LOWER(COALESCE(t.table_number, '')) LIKE '%parcel%' OR LOWER(COALESCE(t.table_number, '')) LIKE '%token%' OR LOWER(COALESCE(t.floor, '')) LIKE '%counter%' THEN b.final_amount ELSE 0 END), 0) as parcel_sales
       FROM bills b
       JOIN orders o ON b.order_id = o.id
       LEFT JOIN tables t ON o.table_id = t.id
       WHERE date(b.created_at) = date($1)`,
      [targetDateStr]
    );
    const salesType = salesTypeRes.rows[0] || { dine_in_sales: 0, parcel_sales: 0 };

    // 4. Payment summary table
    const paySummaryRes = await db.query(
      `SELECT 
         COALESCE(payment_method, 'unspecified') as method, 
         COUNT(*) as tx_count, 
         COALESCE(SUM(final_amount), 0) as total_amount
       FROM bills
       WHERE date(created_at) = date($1)
       GROUP BY payment_method`,
      [targetDateStr]
    );
    const paymentSummary = paySummaryRes.rows || [];

    // 5. Top 10 item sales summary
    const itemSummaryRes = await db.query(
      `SELECT 
         mi.name as item_name, 
         SUM(oi.quantity) as qty, 
         SUM(oi.quantity * mi.price) as amount
       FROM order_items oi
       JOIN menu_items mi ON oi.menu_item_id = mi.id
       JOIN orders o ON oi.order_id = o.id
       JOIN bills b ON b.order_id = o.id
       WHERE date(b.created_at) = date($1)
       GROUP BY mi.name
       ORDER BY qty DESC
       LIMIT 10`,
      [targetDateStr]
    );
    const topItems = itemSummaryRes.rows || [];

    return {
      hotel,
      targetDateStr,
      total_revenue: Number(rev.total_revenue || 0),
      total_orders: Number(rev.total_orders || 0),
      cash_collection: Number(rev.cash_collection || 0),
      online_collection: Number(rev.online_collection || 0),
      dine_in_sales: Number(salesType.dine_in_sales || 0),
      parcel_sales: Number(salesType.parcel_sales || 0),
      paymentSummary,
      topItems
    };
  } catch (err) {
    console.error('[CLOUD SYNC DATA ERROR]', err.message);
    throw err;
  }
}

function isRealNetworkError(err) {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  const causeCode = err.cause?.code || err.code || '';
  const networkCodes = ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'UND_ERR_CONNECT_TIMEOUT'];
  
  if (networkCodes.includes(causeCode)) return true;
  if (msg.includes('fetch failed') && (causeCode || msg.includes('getaddrinfo') || msg.includes('connect') || msg.includes('econnrefused'))) return true;
  return false;
}

/**
 * Execute Cloud Sync to Supabase instance using zero-dependency native fetch
 */
async function performCloudSync() {
  const config = configManager.getConfig();
  if (!config.cloudSyncEnabled) {
    return { success: false, reason: 'Sync disabled in settings' };
  }

  const defaultUrl = 'https://vejvxpjswlmcsbfiqywp.supabase.co';
  const defaultKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlanZ4cGpzd2xtY3NiZmlxeXdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1MzI3NTMsImV4cCI6MjEwMDEwODc1M30.oliBQIW9k8TL_d5q73bza7tt-CSK34yY-prJrYTfcBI';

  let supabaseUrl = (config.cloudSyncUrl || '').trim().replace(/\/$/, '');
  let supabaseKey = (config.cloudSyncAnonKey || '').trim();

  if (!supabaseUrl || supabaseUrl.includes('vcjexpj')) {
    supabaseUrl = defaultUrl;
  }
  if (!supabaseKey || supabaseKey.startsWith('sb_publishable')) {
    supabaseKey = defaultKey;
  }

  const ownerEmail = (config.cloudSyncOwnerEmail || '').trim();
  const ownerPassword = (config.cloudSyncOwnerPassword || '').trim();
  const hotelCode = (config.cloudSyncHotelCode || 'HOTEL_001').trim();

  if (!supabaseUrl || !supabaseKey || !ownerEmail || !ownerPassword) {
    console.warn('[CLOUD SYNC] Skipping sync: Supabase URL, Key, or Owner credentials missing.');
    return { success: false, reason: 'Missing owner email or password for Cloud Sync. Please configure in Profile settings.' };
  }

  try {
    console.log(`[CLOUD SYNC] Initiating 15-min sync for hotel ${hotelCode}...`);

    // 1. Authenticate with Supabase Auth REST API using native fetch
    let authData;
    const authUrl = `${supabaseUrl}/auth/v1/token?grant_type=password`;
    let authResponse = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: ownerEmail, password: ownerPassword })
    });

    if (!authResponse.ok) {
      const errBody = await authResponse.json().catch(() => ({}));
      const isInvalidCreds = authResponse.status === 400 || authResponse.status === 401 || authResponse.status === 422 ||
        errBody.error === 'invalid_grant' ||
        errBody.error_code === 'invalid_credentials' ||
        (errBody.error_description && errBody.error_description.toLowerCase().includes('invalid')) ||
        (errBody.message && errBody.message.toLowerCase().includes('invalid'));
      
      // Auto-Registration Fallback: If login fails with invalid credentials, the account might not exist.
      if (isInvalidCreds) {
        console.log(`[CLOUD SYNC] User not found or invalid login. Attempting auto-registration for ${ownerEmail}...`);
        
        // Ensure email is valid format before trying signup, otherwise Supabase blocks it
        if (!ownerEmail.includes('@')) {
           throw new Error(`Email address "${ownerEmail}" is invalid. Please use a valid email format (e.g. name@domain.com)`);
        }

        const signupUrl = `${supabaseUrl}/auth/v1/signup`;
        const signupRes = await fetch(signupUrl, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email: ownerEmail, password: ownerPassword })
        });
        
        const signupData = await signupRes.json().catch(() => ({}));

        if (!signupRes.ok) {
          const signupMsg = signupData.error_description || signupData.msg || signupData.message || '';
          if (signupMsg.toLowerCase().includes('already registered') || signupMsg.toLowerCase().includes('already exists')) {
            throw new Error(`Account "${ownerEmail}" already exists in cloud database. Incorrect password entered for this existing account.`);
          }
          throw new Error(`Auto-Registration failed: ${signupMsg || signupRes.status}`);
        }

        if (signupData.access_token) {
          authData = signupData;
        } else {
          // Retry Login after successful Signup
          console.log(`[CLOUD SYNC] Auto-registration successful. Retrying login...`);
          authResponse = await fetch(authUrl, {
            method: 'POST',
            headers: {
              'apikey': supabaseKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email: ownerEmail, password: ownerPassword })
          });

          if (!authResponse.ok) {
             const retryErr = await authResponse.json().catch(() => ({}));
             throw new Error(retryErr.error_description || retryErr.message || `Auth HTTP ${authResponse.status}`);
          }
          authData = await authResponse.json();
        }
      } else {
        throw new Error(errBody.error_description || errBody.message || `Auth HTTP ${authResponse.status}`);
      }
    } else {
      authData = await authResponse.json();
    }

    const accessToken = authData.access_token;
    const ownerId = authData.user?.id;

    if (!accessToken || !ownerId) {
      throw new Error('Supabase authentication failed: Invalid response tokens');
    }

    // 2. Register/upsert Hotel entry in `hotels` table
    const todayStr = getLocalDateString();
    const analytics = await getDailyAnalyticsData(todayStr);

    // Ensure unique hotel_code per owner to prevent 409 conflict on duplicate key "hotels_hotel_code_key"
    const effectiveHotelCode = (hotelCode && hotelCode !== 'HOTEL_001') 
      ? hotelCode 
      : `HOTEL_${ownerId.slice(0, 8).toUpperCase()}`;

    const hotelPayload = {
      owner_id: ownerId,
      hotel_code: effectiveHotelCode,
      hotel_name: analytics.hotel.name || 'BestBill POS Hotel',
      location: analytics.hotel.location || '',
      phone: analytics.hotel.phone || ''
    };

    const hotelRes = await fetch(`${supabaseUrl}/rest/v1/hotels?on_conflict=owner_id`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(hotelPayload)
    });

    if (!hotelRes.ok) {
      // Fallback try with on_conflict=hotel_code
      await fetch(`${supabaseUrl}/rest/v1/hotels?on_conflict=hotel_code`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify(hotelPayload)
      }).catch(err => console.log('[CLOUD SYNC] Hotel table notice:', err.message));
    }

    // 3. Upsert Analytics Snapshots in `analytics_snapshots` table for past 30 days
    const datesRes = await db.query(
      `SELECT DISTINCT date(created_at) as snapshot_date 
       FROM bills 
       WHERE date(created_at) >= date('now', '-30 days')
       ORDER BY snapshot_date DESC`
    ).catch(() => ({ rows: [] }));

    let datesToSync = (datesRes.rows || []).map(r => r.snapshot_date);
    if (!datesToSync.includes(todayStr)) {
      datesToSync.push(todayStr);
    }

    for (const dateStr of datesToSync) {
      const analytics = await getDailyAnalyticsData(dateStr);
      const snapshotPayload = {
        hotel_code: effectiveHotelCode,
        owner_id: ownerId,
        snapshot_date: dateStr,
        total_revenue: analytics.total_revenue,
        total_orders: analytics.total_orders,
        cash_collection: analytics.cash_collection,
        online_collection: analytics.online_collection,
        dine_in_sales: analytics.dine_in_sales,
        parcel_sales: analytics.parcel_sales,
        payment_summary: analytics.paymentSummary,
        top_items: analytics.topItems,
        synced_at: new Date().toISOString()
      };

      const checkSnapRes = await fetch(`${supabaseUrl}/rest/v1/analytics_snapshots?hotel_code=eq.${effectiveHotelCode}&snapshot_date=eq.${dateStr}&select=id`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${accessToken}`
        }
      });
      const existingSnaps = await checkSnapRes.json().catch(() => []);

      if (Array.isArray(existingSnaps) && existingSnaps.length > 0) {
        const existingId = existingSnaps[0].id;
        await fetch(`${supabaseUrl}/rest/v1/analytics_snapshots?id=eq.${existingId}`, {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(snapshotPayload)
        });
      } else {
        await fetch(`${supabaseUrl}/rest/v1/analytics_snapshots`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(snapshotPayload)
        });
      }
    }

    const syncTime = new Date().toISOString();
    config.lastCloudSyncTime = syncTime;
    configManager.saveConfig(config);

    console.log(`[CLOUD SYNC] Successfully synced analytics at ${syncTime}`);
    return { success: true, timestamp: syncTime };

  } catch (err) {
    console.error('[CLOUD SYNC ERROR] Sync failed:', err.message);
    if (isRealNetworkError(err)) {
      return { 
        success: true, 
        warning: 'Settings saved locally! Device is currently offline; sync will run automatically once reconnected.' 
      };
    }
    return { success: false, error: err.message };
  }
}

let isSyncSchedulerRunning = false;

// Background Scheduler
function startCloudSyncScheduler() {
  if (isSyncSchedulerRunning) return;
  isSyncSchedulerRunning = true;

  console.log('[CLOUD SYNC] Background sync scheduler active (15-min interval).');

  // Initial sync check 15 seconds after server bootup (only if enabled)
  setTimeout(() => {
    const config = configManager.getConfig();
    if (!config.cloudSyncEnabled) return;
    performCloudSync().catch(err => console.error('[CLOUD SYNC BOOTUP ERROR]', err.message));
  }, 15000);

  // Interval check every 1 minute to check if 15 minutes elapsed
  setInterval(async () => {
    try {
      const config = configManager.getConfig();
      if (!config.cloudSyncEnabled) return;

      const lastSync = config.lastCloudSyncTime ? new Date(config.lastCloudSyncTime).getTime() : 0;
      const now = Date.now();
      const intervalMs = (config.cloudSyncIntervalMinutes || 15) * 60 * 1000;

      if (now - lastSync >= intervalMs) {
        await performCloudSync();
      }
    } catch (err) {
      console.error('[CLOUD SYNC SCHEDULER ERROR]', err.message);
    }
  }, 60000);
}

module.exports = {
  performCloudSync,
  startCloudSyncScheduler,
  getDailyAnalyticsData
};
