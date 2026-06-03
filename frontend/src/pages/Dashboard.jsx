import React, { useState, useEffect, useMemo } from 'react';
import { io } from 'socket.io-client';
import api from '../services/api';
import OrderModal from '../components/OrderModal';
import ConfirmModal from '../components/ConfirmModal';
import { toast } from 'react-hot-toast';
import { PlusCircle, Table as TableIcon, LayoutGrid, Search, X, Hash, Trash2, RefreshCcw, Hotel, Fingerprint, Sun, Moon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import SwapModal from '../components/SwapModal';

const Dashboard = () => {
  const { user } = useAuth();
  const { theme, toggleTheme, setTheme, isLight } = useTheme();
  const isOwner = user?.role === 'owner';
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [isOrderModalOpen, setOrderModalOpen] = useState(false);
  const [isAddTableOpen, setAddTableOpen] = useState(false);
  const [tableCount, setTableCount] = useState('5');
  const [loading, setLoading] = useState(true);
  const [clickShield, setClickShield] = useState(false);

  const [isDeleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [tableToDelete, setTableToDelete] = useState(null);
  
  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState(null);
  const [editData, setEditData] = useState({ table_number: '', floor: 'Floor 1' });
  const [newTableFloor, setNewTableFloor] = useState('Floor 1');

  const [isSwapModalOpen, setSwapModalOpen] = useState(false);
  const [menuData, setMenuData] = useState({ categories: [], items: [] });
  const [subStatus, setSubStatus] = useState(null);
  const [timeRemainingStr, setTimeRemainingStr] = useState('');

  const fetchSubscriptionStatus = async () => {
    try {
      const res = await api.get('/auth/subscription-status');
      setSubStatus(res.data);
    } catch (err) {
      console.error('Failed to fetch subscription status', err);
    }
  };

  useEffect(() => {
    if (!subStatus || !subStatus.expiresAt || subStatus.type === 'permanent') {
      setTimeRemainingStr('');
      return;
    }

    const updateTimer = () => {
      const now = new Date();
      const expires = new Date(subStatus.expiresAt);
      const diffMs = expires.getTime() - now.getTime();
      
      if (diffMs <= 0) {
        setTimeRemainingStr('Expired');
        return;
      }

      const totalSecs = Math.floor(diffMs / 1000);
      const secs = totalSecs % 60;
      const totalMins = Math.floor(totalSecs / 60);
      const mins = totalMins % 60;
      const hours = Math.floor(totalMins / 60);

      if (hours > 0) {
        setTimeRemainingStr(`${hours}h ${mins}m`);
      } else if (mins > 0) {
        setTimeRemainingStr(`${mins}m ${secs}s`);
      } else {
        setTimeRemainingStr(`${secs}s`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [subStatus]);

  const fetchTables = async () => {
    try {
      // Parallel fetch for everything the dashboard needs
      const [tablesRes, catRes, itemsRes] = await Promise.all([
        api.get('/tables'),
        api.get('/menu/categories'),
        api.get('/menu/items')
      ]);
      
      setTables(Array.isArray(tablesRes.data) ? tablesRes.data : []);
      setMenuData({
        categories: catRes.data || [],
        items: itemsRes.data || []
      });
    } catch (err) {
      console.error('Fetch error:', err);
      toast.error('Failed to load dashboard data');
      setTables([]); 
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTables();
    fetchSubscriptionStatus();

    const serverUrl = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace('/api', '') : 'http://localhost:8080';
    const socket = io(serverUrl, { transports: ['websocket'] });

    if (user?.hotel_id) {
      socket.emit('register-hotel', { hotelId: user.hotel_id });
    }

    socket.on('table-update', () => {
      fetchTables();
    });

    return () => {
      socket.disconnect();
    };
  }, [user]);

  const openTable = (table) => {
    if (!table) return;
    setSelectedTable(table);
    setOrderModalOpen(true);
  };

  const initiateDeleteTable = (e, table) => {
    e.stopPropagation();
    if (!isOwner) return;
    setTableToDelete(table);
    setDeleteConfirmOpen(true);
  };

  const initiateEditTable = (e, table) => {
    e.stopPropagation();
    if (!isOwner) return;
    setEditingTable(table);
    setEditData({ table_number: table.table_number, floor: table.floor || 'Floor 1' });
    setEditModalOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/tables/${editingTable.id}`, editData);
      toast.success('Table layout synchronized');
      setEditModalOpen(false);
      fetchTables();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update table details');
    }
  };

  const handleSwapTable = async (targetTableId) => {
    try {
      await api.post(`/tables/${selectedTable.id}/swap`, { targetTableId });
      toast.success('Table migration successful');
      setSwapModalOpen(false);
      fetchTables();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Swap protocol failed');
    }
  };

  const confirmDeleteTable = async () => {
    if (!tableToDelete) return;
    try {
      await api.delete(`/tables/${tableToDelete.id}`);
      fetchTables();
      toast.success('Table removed successfully');
      setDeleteConfirmOpen(false);
      setTableToDelete(null);
    } catch (err) {
      toast.error('Deletion failed');
    }
  };

  const addTables = async (e) => {
    e.preventDefault();
    if (!isOwner) return;
    const count = parseInt(tableCount);
    if (isNaN(count) || count <= 0) return toast.error('Enter valid count');
    
    const loadingToast = toast.loading('Calculating sequence holes...');
    try {
      const existingInFloor = new Set(tables.filter(t => t.floor === newTableFloor).map(t => parseInt(t.table_number)).filter(n => !isNaN(n)));
      
      const newTableNumbers = [];
      let currentCheck = 1;
      
      while (newTableNumbers.length < count) {
        if (!existingInFloor.has(currentCheck)) {
          newTableNumbers.push(currentCheck.toString());
        }
        currentCheck++;
      }
      
      await api.post('/tables/batch', { tableNumbers: newTableNumbers, floor: newTableFloor });
      fetchTables();
      setAddTableOpen(false);
      toast.success(`${count} tables added to ${newTableFloor}!`, { id: loadingToast });
    } catch (err) {
      toast.error('Error adding tables', { id: loadingToast });
    }
  };

  const createParcelCounter = async (e) => {
    e.preventDefault();
    if (!isOwner) return;
    try {
      await api.post('/tables/batch', { tableNumbers: ['Parcel Counter'], floor: 'Counter' });
      toast.success('Parcel Counter activated!');
      fetchTables();
    } catch (err) {
      toast.error('Failed to create Parcel Counter');
    }
  };

  // Group tables by floor - Memoized for performance
  const groupedTables = useMemo(() => {
    const groups = (tables || []).reduce((acc, table) => {
      let floor = table.floor || 'Floor 1';
      if (table.table_number === 'Parcel Counter') {
        floor = 'Floor 1';
      }
      if (!acc[floor]) acc[floor] = [];
      acc[floor].push(table);
      return acc;
    }, {});

    if (groups['Floor 1']) {
      const pcIndex = groups['Floor 1'].findIndex(t => t.table_number === 'Parcel Counter');
      if (pcIndex !== -1) {
        const pc = groups['Floor 1'].splice(pcIndex, 1)[0];
        groups['Floor 1'].unshift(pc);
      }
    }
    return groups;
  }, [tables, isOwner]);

  const floorOrder = (name) => {
    if (name.startsWith('Floor ')) return parseInt(name.replace('Floor ', '')) || 99;
    if (name === 'Main Hall') return 100;
    if (name === 'Party Hall') return 101;
    if (name === 'Rooftop') return 102;
    if (name === 'Garden') return 103;
    if (name === 'Family Section') return 104;
    return 200;
  };

  const floors = useMemo(() => Object.keys(groupedTables).sort((a, b) => floorOrder(a) - floorOrder(b)), [groupedTables]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
      <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '4px solid var(--bg-border)', borderTopColor: '#0ea5e9', animation: 'spin 1s linear infinite' }}></div>
      <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '64px', width: '100%', maxWidth: '1440px', overflow: 'hidden' }}>
      {/* Hotel & Subscription Branding Area */}
      <div className="hotel-title-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ 
            width: '64px', 
            height: '64px', 
            backgroundColor: 'rgba(14, 165, 233, 0.1)', 
            borderRadius: '20px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            border: '1px solid rgba(14, 165, 233, 0.2)'
          }}>
            <Hotel color="#0ea5e9" size={32} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <h1 style={{fontSize: '36px', fontWeight: 950, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>{user?.hotel_name || 'BestBill Hotel'}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-muted)', fontSize: '14px', fontWeight: 700 }}>
              <span>Proprietor: {user?.name || 'A'}</span>
              <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: 'var(--bg-border)' }}></div>
              <span style={{ color: '#10b981' }}>Active Session</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'flex-end' }}>
          {/* Current Date */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
            <span style={{ fontSize: '10px', fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Current Date</span>
            <span style={{fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>

          {/* Small Premium Subscription Info Block */}
          {subStatus && (
            <div style={{ 
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              backgroundColor: 'var(--glass-card-bg)',
              border: '1px solid var(--bg-border)',
              borderRadius: '12px',
              padding: '6px 12px',
              fontSize: '12px',
              color: 'var(--text-secondary)',
              fontWeight: 700
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Plan:</span>
                <span style={{ color: isLight ? 'var(--text-primary)' : '#0ea5e9', fontWeight: 800 }}>
                  {subStatus.type === 'trial' ? 'Free Trial' : 
                   subStatus.type === 'monthly' ? 'Monthly' : 
                   subStatus.type === 'yearly' ? 'Yearly' : 'Lifetime'}
                </span>
              </div>
              {subStatus.type !== 'permanent' && (
                <>
                  <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: 'var(--bg-border)' }}></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Expires:</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 800 }}>
                      {subStatus.expiresAt ? new Date(subStatus.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                    </span>
                  </div>
                  <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: 'var(--bg-border)' }}></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Remaining:</span>
                    <span style={{ color: subStatus.daysRemaining <= 3 ? '#f43f5e' : '#10b981', fontWeight: 800 }}>
                      {timeRemainingStr || `${subStatus.daysRemaining} day${subStatus.daysRemaining !== 1 ? 's' : ''}`}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Light / Dark Mode Toggle (Segmented Pill Radio Selector) */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--bg-border)',
            borderRadius: '12px',
            padding: '4px',
            gap: '4px',
            marginTop: '4px',
            width: '180px'
          }}>
            <button
              type="button"
              onClick={() => setTheme('light')}
              style={{
                flex: 1,
                padding: '6px 12px',
                backgroundColor: isLight ? 'var(--bg-card)' : 'transparent',
                color: isLight ? '#0ea5e9' : 'var(--text-muted)',
                borderRadius: '8px',
                border: 'none',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                fontSize: '12px',
                transition: 'all 0.2s',
                boxShadow: isLight ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
              }}
            >
              <Sun size={14} /> Light
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              style={{
                flex: 1,
                padding: '6px 12px',
                backgroundColor: !isLight ? 'var(--bg-card)' : 'transparent',
                color: !isLight ? '#38bdf8' : 'var(--text-muted)',
                borderRadius: '8px',
                border: 'none',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                fontSize: '12px',
                transition: 'all 0.2s',
                boxShadow: !isLight ? '0 2px 4px rgba(0,0,0,0.15)' : 'none'
              }}
            >
              <Moon size={14} /> Dark
            </button>
          </div>
        </div>
      </div>

      {/* Subscription Alert Banner */}
      {subStatus && subStatus.type !== 'permanent' && subStatus.daysRemaining <= 3 && (
        <div style={{
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: '16px',
          padding: '16px 20px',
          color: isLight ? 'var(--text-primary)' : '#f87171',
          fontSize: '14px',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          lineHeight: 1.5,
          marginTop: '-32px',
          marginBottom: '-16px'
        }}>
          <div style={{
            width: '28px',
            height: '28px',
            backgroundColor: 'rgba(239, 68, 68, 0.2)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <span style={{ fontWeight: 900, fontSize: '16px' }}>!</span>
          </div>
          <div>
            Your subscription will expire in {timeRemainingStr || `${subStatus.daysRemaining} day(s)`}. Please contact Shubham Pilane to renew your license. Mobile: 9822401802
          </div>
        </div>
      )}

      <div className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '400px' }}>
          <h2 style={{fontSize: '24px', fontWeight: 900, letterSpacing: '-0.02em', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <LayoutGrid style={{ color: '#0ea5e9' }} size={24} />
            Live Table Management
          </h2>
          <div style={{ position: 'relative' }}>
            <Search style={{ position: 'absolute', top: '14px', left: '16px', color: 'var(--text-muted)' }} size={18} />
            <input
              type="text"
              placeholder="Search tables..."
              style={{width: '100%',
                backgroundColor: 'var(--bg-card)',
                border: '2px solid var(--bg-border)',
                color: 'var(--text-primary)',
                padding: '12px 16px 12px 48px',
                borderRadius: '16px',
                outline: 'none',
                fontSize: '14px',
                fontWeight: 600
              }}
            />
          </div>
        </div>
        {isOwner && (
          <div style={{ display: 'flex', gap: '16px' }}>
            <button
              onClick={createParcelCounter}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                backgroundColor: 'transparent',
                border: '2px solid #0ea5e9',
                color: '#0ea5e9',
                padding: '12px 24px',
                borderRadius: '16px',
                fontWeight: 800,
                fontSize: '15px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <PlusCircle size={20} />
              Parcel Counter
            </button>
            <button
              onClick={() => setAddTableOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                backgroundColor: '#0ea5e9',
                color: 'white',
                padding: '14px 28px',
                borderRadius: '16px',
                fontWeight: 800,
                fontSize: '15px',
                cursor: 'pointer',
                border: 'none',
                boxShadow: '0 8px 16px rgba(14, 165, 233, 0.2)',
                transition: 'all 0.2s'
              }}
            >
              <PlusCircle size={20} />
              Create New Tables
            </button>
          </div>
        )}
      </div>

      {(tables || []).length === 0 ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '80px',
          backgroundColor: 'var(--bg-card)',
          borderRadius: '32px',
          border: '2px dashed var(--bg-border)',
          textAlign: 'center'
        }}>
          <div style={{ width: '80px', height: '80px', backgroundColor: 'var(--bg-border)', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
            <TableIcon size={40} style={{ color: '#334155' }} />
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '18px', fontWeight: 600, margin: 0 }}>No tables found in this hotel.</p>
          <button 
            onClick={() => setAddTableOpen(true)}
            style={{ color: '#0ea5e9', fontWeight: 900, background: 'none', border: 'none', cursor: 'pointer', marginTop: '12px', fontSize: '16px', textDecoration: 'underline' }}>
            Setup Initial Floor Plan
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '64px' }}>

          {floors.map(floor => (
            <div key={floor} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <h2 style={{ fontSize: '18px', fontWeight: 900, color: 'var(--text-secondary)', letterSpacing: '0.05em', margin: 0, textTransform: 'uppercase' }}>{floor}</h2>
                  <div style={{ flex: 1, height: '2px', backgroundColor: 'var(--bg-border)' }}></div>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 800 }}>{groupedTables[floor].length} TABLES</span>
               </div>
               
               <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                  gap: '24px'
               }}>
                  {groupedTables[floor].map((table) => (
                      <TableCard 
                        key={table.id} 
                        table={table} 
                        isOwner={isOwner} 
                        onOpen={openTable}
                        onEdit={initiateEditTable}
                        onDelete={initiateDeleteTable}
                        onSwap={(e) => {
                          e.stopPropagation();
                          setSelectedTable(table);
                          setSwapModalOpen(true);
                        }}
                      />
                   ))}
               </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Table Modal */}
      {isAddTableOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(2, 6, 23, 0.8)',
          backdropFilter: 'blur(16px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '24px'
        }}>
           <div style={{
             width: '100%',
             maxWidth: '400px',
             backgroundColor: 'var(--bg-card)',
             borderRadius: '32px',
             border: '1px solid var(--border-rgba-1)',
             padding: '40px',
             boxShadow: '0 50px 100px -20px rgba(0, 0, 0, 1)'
           }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <h3 style={{fontSize: '20px', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>Add New Tables</h3>
                <button onClick={() => setAddTableOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <X size={24} />
                </button>
              </div>

               <form onSubmit={addTables} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                     <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginLeft: '4px' }}>Select Floor</label>
                     <select 
                        value={newTableFloor}
                        onChange={(e) => setNewTableFloor(e.target.value)}
                        style={{width: '100%', backgroundColor: 'var(--bg-base)', border: '2px solid var(--bg-border)', color: 'var(--text-primary)', padding: '14px', borderRadius: '16px', outline: 'none' }}
                     >
                        {[...Array(5)].map((_, i) => (
                           <option key={i+1} value={`Floor ${i+1}`}>Floor {i+1}</option>
                        ))}
                        <option value="Main Hall">Main Hall</option>
                        <option value="Party Hall">Party Hall</option>
                        <option value="Rooftop">Rooftop</option>
                        <option value="Garden">Garden</option>
                        <option value="Family Section">Family Section</option>
                     </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                     <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginLeft: '4px' }}>How many tables?</label>
                     <div style={{ position: 'relative' }}>
                        <Hash style={{ position: 'absolute', top: '15px', left: '16px', color: 'var(--text-muted)' }} size={18} />
                        <input 
                          type="number"
                          value={tableCount}
                          onChange={(e) => setTableCount(e.target.value)}
                          style={{width: '100%', backgroundColor: 'var(--bg-base)', border: '2px solid var(--bg-border)', color: 'var(--text-primary)', padding: '14px 16px 14px 48px', borderRadius: '16px', outline: 'none', fontWeight: 900, fontSize: '18px' }}
                        />
                     </div>
                  </div>
                  <button type="submit" style={{ width: '100%', backgroundColor: '#0ea5e9', color: 'white', border: 'none', padding: '16px', borderRadius: '16px', fontSize: '15px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 8px 16px rgba(14, 165, 233, 0.2)' }}>
                     Deploy Tables
                  </button>
               </form>
            </div>
         </div>
      )}

      {/* Edit Table Modal */}
      {isEditModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.8)', backdropFilter: 'blur(16px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px'
        }}>
           <div style={{ width: '100%', maxWidth: '400px', backgroundColor: 'var(--bg-card)', borderRadius: '32px', padding: '40px' }}>
              <h3 style={{fontSize: '20px', fontWeight: 900, color: 'var(--text-primary)', marginBottom: '24px' }}>Swap Config</h3>
              <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                 <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Table Number</label>
                    <input 
                      type="text" value={editData.table_number} 
                      onChange={(e) => setEditData({...editData, table_number: e.target.value})}
                      style={{width: '100%', backgroundColor: 'var(--bg-base)', border: '2px solid var(--bg-border)', color: 'var(--text-primary)', padding: '14px', borderRadius: '16px' }}
                    />
                 </div>
                 <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Floor</label>
                      <select 
                        value={editData.floor} 
                        onChange={(e) => setEditData({...editData, floor: e.target.value})}
                        style={{width: '100%', backgroundColor: 'var(--bg-base)', border: '2px solid var(--bg-border)', color: 'var(--text-primary)', padding: '14px', borderRadius: '16px' }}
                      >
                          {[...Array(5)].map((_, i) => (
                             <option key={i+1} value={`Floor ${i+1}`}>Floor {i+1}</option>
                          ))}
                          <option value="Main Hall">Main Hall</option>
                          <option value="Party Hall">Party Hall</option>
                          <option value="Rooftop">Rooftop</option>
                          <option value="Garden">Garden</option>
                          <option value="Family Section">Family Section</option>
                      </select>
                 </div>
                 <div style={{ display: 'flex', gap: '12px' }}>
                    <button type="button" onClick={() => setEditModalOpen(false)} style={{flex: 1, backgroundColor: 'var(--bg-border)', color: 'var(--text-primary)', padding: '14px', borderRadius: '16px', border: 'none' }}>Cancel</button>
                    <button type="submit" style={{ flex: 2, backgroundColor: '#0ea5e9', color: 'white', padding: '14px', borderRadius: '16px', border: 'none' }}>Change</button>
                 </div>
              </form>
           </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={isDeleteConfirmOpen}
        title="Remove Position?"
        message={`Are you sure you want to permanently decommission Table ${tableToDelete?.table_number}? This record will be archived.`}
        onConfirm={confirmDeleteTable}
        onCancel={() => setDeleteConfirmOpen(false)}
      />

      {isOrderModalOpen && (
        <OrderModal
          table={tables.find(t => t.id === selectedTable.id) || selectedTable}
          initialMenu={menuData}
          allTables={tables}
          onClose={() => {
            setOrderModalOpen(false);
            setClickShield(true);
            setTimeout(() => setClickShield(false), 800);
            fetchTables();
          }}
        />
      )}

      <SwapModal 
         isOpen={isSwapModalOpen} 
         onClose={() => setSwapModalOpen(false)} 
         tables={tables} 
         onSwap={handleSwapTable} 
         currentTable={selectedTable}
      />
      {clickShield && <div style={{ position: 'fixed', inset: 0, zIndex: 99999, cursor: 'not-allowed' }} />}
    </div>
  );
};

// Memoized Table Card for performance
const TableCard = React.memo(({ table, isOwner, onOpen, onEdit, onDelete, onSwap }) => {
  return (
    <div
      onClick={() => onOpen(table)}
      style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: '32px',
        padding: '32px',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        border: table.active_order_id ? '2px solid rgba(244, 63, 94, 0.2)' : '2px solid rgba(16, 185, 129, 0.2)',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-8px)';
        e.currentTarget.style.backgroundColor = 'var(--bg-border)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.backgroundColor = 'var(--bg-card)';
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {table.table_number === 'Parcel Counter' ? 'SERVICE DESK' : `TABLE ${table.table_number}`}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
           {isOwner && (
              <div style={{ display: 'flex', gap: '12px' }}>
                 <button 
                    onClick={table.active_order_id ? onSwap : (e) => onEdit(e, table)}
                    style={{ color: '#0ea5e9', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 900, fontSize: '11px', textTransform: 'uppercase' }}
                 >
                    {table.active_order_id ? 'Swap' : 'Edit'}
                 </button>
                 <button 
                    onClick={(e) => onDelete(e, table)} 
                    style={{ color: '#f43f5e', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                 >
                    <Trash2 size={14} />
                 </button>
              </div>
           )}
           <div style={{
             width: '12px',
             height: '12px',
             borderRadius: '50%',
             backgroundColor: table.active_order_id ? '#f43f5e' : '#10b981',
             boxShadow: table.active_order_id ? '0 0 12px #f43f5e' : '0 0 12px #10b981'
           }}></div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <h3 style={{fontSize: table.table_number === 'Parcel Counter' ? '36px' : '48px', fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.05em' }}>{table.table_number}</h3>
        <span style={{ fontSize: '12px', fontWeight: 800, color: table.active_order_id ? '#f43f5e' : '#10b981', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {table.active_order_id ? 'OCCUPIED' : 'AVAILABLE'}
        </span>
      </div>

      <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
         {table.active_order_id ? (
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 700, fontStyle: 'italic' }}>Ongoing Order</span>
         ) : (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>Ready to serve</span>
         )}
         <div style={{ padding: '8px', borderRadius: '12px', backgroundColor: 'rgba(255, 255, 255, 0.03)' }}>
            <PlusCircle size={18} style={{ color: 'var(--text-muted)' }} />
         </div>
      </div>

      <div style={{
        position: 'absolute',
        bottom: '-20px',
        right: '-20px',
        width: '100px',
        height: '100px',
        borderRadius: '50%',
        backgroundColor: table.active_order_id ? 'rgba(244, 63, 94, 0.05)' : 'rgba(16, 185, 129, 0.05)',
        filter: 'blur(30px)'
      }}></div>
    </div>
  );
});

export default Dashboard;
