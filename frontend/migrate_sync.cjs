const fs = require('fs');
let code = fs.readFileSync('src/pages/Profile.jsx', 'utf-8');

const startIdx = code.indexOf('            {/* Online Sync (Cloud Analytics) Settings Card */}');
const endIdx = code.indexOf('            {/* System Add-ons Section */}');
if (startIdx === -1 || endIdx === -1) throw new Error('Markers not found');

// Remove the old card
code = code.slice(0, startIdx) + code.slice(endIdx);

const insPt = code.indexOf('                            {/* Lodging Module */}');
if (insPt === -1) throw new Error('Lodging Module not found');

const newSyncModule = `                            {/* Online Sync Module */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '650px' }}>
                                    <h3 style={{fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Online Analytics Sync (Cloud Reporting)</h3>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0, lineHeight: '1.6', marginTop: '4px' }}>
                                        Enable cloud syncing to view your real-time analytics on the BestBill Admin mobile application.
                                        Requires an owner passcode to configure.
                                    </p>
                                </div>
                                
                                <button
                                    type="button"
                                    onClick={() => handleToggleCloudSync(!cloudSyncEnabled)}
                                    style={{
                                        backgroundColor: cloudSyncEnabled ? '#ef4444' : '#10b981',
                                        color: 'white',
                                        border: 'none',
                                        padding: '8px 18px',
                                        borderRadius: '8px',
                                        fontWeight: 600,
                                        fontSize: '13px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {cloudSyncEnabled ? 'Disable' : 'Enable'}
                                </button>
                            </div>

                            {cloudSyncEnabled && (
                                <form onSubmit={handleCloudSyncConfigSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', backgroundColor: 'var(--bg-base)', padding: '16px', borderRadius: '8px', border: '1px solid var(--bg-border)' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>OWNER EMAIL</label>
                                            <input 
                                                type="email"
                                                value={cloudSyncConfig.cloudSyncOwnerEmail}
                                                onChange={e => setCloudSyncConfig({ ...cloudSyncConfig, cloudSyncOwnerEmail: e.target.value })}
                                                placeholder="owner@bestbill.com"
                                                style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-rgba-05)', color: 'var(--text-primary)', fontWeight: 500 }}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>OWNER PASSWORD</label>
                                            <input 
                                                type="password"
                                                value={cloudSyncConfig.cloudSyncOwnerPassword}
                                                onChange={e => setCloudSyncConfig({ ...cloudSyncConfig, cloudSyncOwnerPassword: e.target.value })}
                                                placeholder="Set or leave unchanged"
                                                style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-rgba-05)', color: 'var(--text-primary)', fontWeight: 500 }}
                                            />
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                                        <button type="submit" style={{ backgroundColor: '#10b981', color: 'white', padding: '10px 20px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', border: 'none' }}>
                                            Save Settings
                                        </button>
                                    </div>
                                </form>
                            )}

                            <div style={{ width: '100%', height: '1px', backgroundColor: 'var(--border-rgba-05)' }}></div>
                            
`;

code = code.slice(0, insPt) + newSyncModule + code.slice(insPt);
fs.writeFileSync('src/pages/Profile.jsx', code);
console.log('Success');
