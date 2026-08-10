import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Wifi, WifiOff, AlertTriangle, Monitor, QrCode, RotateCcw, X } from 'lucide-react';
import api from '../services/api';

const ServerConnectionStatus = ({ compact = false, showDetailsAlways = false }) => {
  const [isConnected, setIsConnected] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState(null);
  const [showModal, setShowModal] = useState(true);

  const checkServerHealth = useCallback(async () => {
    setIsChecking(true);
    try {
      const res = await api.get('/health', { timeout: 3500 });
      if (res.status === 200) {
        setIsConnected(true);
        setShowModal(false); // Auto-close modal when reconnected
      } else {
        setIsConnected(false);
      }
    } catch (err) {
      console.warn('Server connection check failed:', err?.message || err);
      setIsConnected(false);
    } finally {
      setIsChecking(false);
      setLastChecked(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }
  }, []);

  useEffect(() => {
    checkServerHealth();
    const interval = setInterval(() => {
      checkServerHealth();
    }, 15000);
    return () => clearInterval(interval);
  }, [checkServerHealth]);

  // Initial checking pulse
  if (isConnected === null && isChecking) {
    return (
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 12px',
        borderRadius: '100px',
        backgroundColor: 'rgba(14, 165, 233, 0.1)',
        border: '1px solid rgba(14, 165, 233, 0.2)',
        color: '#0ea5e9',
        fontSize: '12px',
        fontWeight: 700
      }}>
        <RefreshCw size={13} style={{ animation: 'spin 1.5s linear infinite' }} />
        Checking...
      </div>
    );
  }

  // --- CONNECTED GREEN LIGHT BADGE ---
  if (isConnected && !showDetailsAlways) {
    return (
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 14px',
        borderRadius: '100px',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        border: '1px solid rgba(34, 197, 94, 0.3)',
        boxShadow: '0 2px 8px rgba(34, 197, 94, 0.15)',
        transition: 'all 0.3s ease'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ position: 'relative', display: 'flex', height: '8px', width: '8px' }}>
            <span style={{ position: 'absolute', display: 'inline-flex', height: '100%', width: '100%', borderRadius: '50%', backgroundColor: '#22c55e', opacity: 0.75, animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite' }}></span>
            <span style={{ position: 'relative', display: 'inline-flex', borderRadius: '50%', height: '8px', width: '8px', backgroundColor: '#16a34a' }}></span>
          </span>
          <Wifi size={14} style={{ color: '#22c55e' }} />
          <span style={{ color: '#15803d', fontSize: '12px', fontWeight: 800 }}>Connected</span>
        </div>
        <button
          type="button"
          onClick={checkServerHealth}
          disabled={isChecking}
          title="Refresh Connection"
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#16a34a', display: 'flex', alignItems: 'center' }}
        >
          <RefreshCw size={13} style={{ animation: isChecking ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>
    );
  }

  // --- DISCONNECTED RED HEADER BADGE + FULLSCREEN MODAL DIALOG ---
  return (
    <>
      {/* Sleek Compact Red Badge for Header */}
      <div 
        onClick={() => setShowModal(true)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 14px',
          borderRadius: '100px',
          backgroundColor: 'rgba(239, 68, 68, 0.12)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          boxShadow: '0 2px 8px rgba(239, 68, 68, 0.2)',
          cursor: 'pointer'
        }}
      >
        <span style={{ position: 'relative', display: 'flex', height: '8px', width: '8px' }}>
          <span style={{ position: 'absolute', display: 'inline-flex', height: '100%', width: '100%', borderRadius: '50%', backgroundColor: '#ef4444', opacity: 0.75, animation: 'ping 1s cubic-bezier(0, 0, 0.2, 1) infinite' }}></span>
          <span style={{ position: 'relative', display: 'inline-flex', borderRadius: '50%', height: '8px', width: '8px', backgroundColor: '#dc2626' }}></span>
        </span>
        <WifiOff size={14} style={{ color: '#ef4444' }} />
        <span style={{ color: '#b91c1c', fontSize: '12px', fontWeight: 900 }}>Not Connected</span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); checkServerHealth(); }}
          disabled={isChecking}
          title="Refresh Connection"
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#dc2626', display: 'flex', alignItems: 'center' }}
        >
          <RefreshCw size={13} style={{ animation: isChecking ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      {/* Responsive Centered Modal Dialog for Mobile Troubleshooting */}
      {showModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(2, 6, 23, 0.85)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          fontFamily: "'Inter', sans-serif"
        }}>
          <div style={{
            width: '100%',
            maxWidth: '460px',
            backgroundColor: 'var(--bg-card, #0f172a)',
            borderRadius: '24px',
            border: '1.5px solid #ef4444',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(239, 68, 68, 0.3)',
            maxHeight: '90vh',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '14px', backgroundColor: 'rgba(239, 68, 68, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <WifiOff size={22} style={{ color: '#ef4444' }} />
                </div>
                <div>
                  <h3 style={{ color: '#f87171', fontSize: '18px', fontWeight: 900, margin: 0 }}>
                    Server Disconnected
                  </h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted, #94a3b8)', fontWeight: 600 }}>
                    Waiter phone cannot reach PC POS Server.
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowModal(false)}
                style={{ background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted, #94a3b8)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Troubleshooting Checklist Box */}
            <div style={{
              backgroundColor: 'var(--bg-base, #020617)',
              borderRadius: '16px',
              padding: '16px',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f87171', fontWeight: 800, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <AlertTriangle size={15} style={{ color: '#ef4444' }} />
                <span>Follow Steps to Re-connect:</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: 'var(--text-primary, #e2e8f0)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', backgroundColor: 'rgba(239, 68, 68, 0.06)', padding: '10px 12px', borderRadius: '10px' }}>
                  <Monitor size={18} style={{ color: '#0ea5e9', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong style={{ color: '#38bdf8' }}>1. Restart application on PC:</strong>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)', marginTop: '2px' }}>Close and re-open BestBill POS app on desktop PC.</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', backgroundColor: 'rgba(239, 68, 68, 0.06)', padding: '10px 12px', borderRadius: '10px' }}>
                  <QrCode size={18} style={{ color: '#a855f7', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong style={{ color: '#c084fc' }}>2. Scan QR code again:</strong>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)', marginTop: '2px' }}>Scan the Staff Login QR code from PC screen.</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', backgroundColor: 'rgba(239, 68, 68, 0.06)', padding: '10px 12px', borderRadius: '10px' }}>
                  <Wifi size={18} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong style={{ color: '#fbbf24' }}>3. Check Wi-Fi connection:</strong>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)', marginTop: '2px' }}>Verify phone and PC share the exact same Wi-Fi network.</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', backgroundColor: 'rgba(239, 68, 68, 0.06)', padding: '10px 12px', borderRadius: '10px' }}>
                  <RotateCcw size={18} style={{ color: '#10b981', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong style={{ color: '#34d399' }}>4. Tap Refresh Connection:</strong>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)', marginTop: '2px' }}>Tap button below to test server connection immediately.</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Refresh Button */}
            <button
              type="button"
              onClick={checkServerHealth}
              disabled={isChecking}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                backgroundColor: '#ef4444',
                color: 'white',
                border: 'none',
                padding: '14px',
                borderRadius: '14px',
                fontSize: '15px',
                fontWeight: 900,
                cursor: isChecking ? 'wait' : 'pointer',
                boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)',
                transition: 'all 0.2s'
              }}
            >
              <RefreshCw size={18} style={{ animation: isChecking ? 'spin 1s linear infinite' : 'none' }} />
              {isChecking ? 'Checking Server Connection...' : 'Refresh Connection'}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default ServerConnectionStatus;
