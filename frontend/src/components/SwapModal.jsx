import { X } from 'lucide-react';

const SwapModal = ({ isOpen, onClose, tables, onSwap, currentTable }) => {
   if (!isOpen) return null;
   
   const availableTables = (tables || []).filter(t => !t.active_order_id && t.id !== currentTable?.id);
   const grouped = availableTables.reduce((acc, t) => {
      const f = t.floor || 'Floor 1';
      if (!acc[f]) acc[f] = [];
      acc[f].push(t);
      return acc;
   }, {});

   return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.9)', backdropFilter: 'blur(16px)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
         <div style={{ width: '100%', maxWidth: '600px', backgroundColor: '#0f172a', borderRadius: '32px', padding: '40px', border: '1px solid rgba(255,255,255,0.05)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
               <h3 style={{ fontSize: '24px', fontWeight: 900, color: 'white', margin: 0 }}>Select Migration Destination</h3>
               <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}><X size={24} /></button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>
               {Object.keys(grouped).sort().map(floor => (
                  <div key={floor}>
                     <div style={{ fontSize: '11px', fontWeight: 900, color: '#475569', letterSpacing: '0.1em', marginBottom: '16px', textTransform: 'uppercase' }}>{floor}</div>
                     <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '12px' }}>
                        {grouped[floor].map(t => (
                           <button 
                              key={t.id} 
                              onClick={() => onSwap(t.id)}
                              style={{ padding: '16px', backgroundColor: '#020617', border: '2px solid #1e293b', borderRadius: '16px', color: 'white', fontWeight: 900, fontSize: '18px', cursor: 'pointer' }}
                              onMouseEnter={e => e.currentTarget.style.borderColor = '#0ea5e9'}
                              onMouseLeave={e => e.currentTarget.style.borderColor = '#1e293b'}
                           >
                              {t.table_number}
                           </button>
                        ))}
                     </div>
                  </div>
               ))}
               {availableTables.length === 0 && <div style={{ color: '#64748b', textAlign: 'center', padding: '40px' }}>No available migration buffers found.</div>}
            </div>
         </div>
      </div>
   );
};

export default SwapModal;
