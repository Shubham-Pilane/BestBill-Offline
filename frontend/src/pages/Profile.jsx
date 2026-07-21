import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { toast } from 'react-hot-toast';
import { User, Mail, Lock, ShieldCheck, Save, Eye, EyeOff, LayoutPanelLeft, UserCircle, Wallet, Users, Trash2, UserPlus, Fingerprint, MapPin, Percent, Upload, Image as ImageIcon, Printer, ChevronDown, Globe, Download, QrCode, KeyRound, CheckCircle2 } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
const Profile = () => {
    const { user, updateUser } = useAuth();
    const isAdmin = user?.role === 'admin';
    const isOwner = user?.role === 'owner';
    const themeColor = isAdmin ? '#10b981' : '#0ea5e9';
    const serverUrl = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace('/api', '') : 'https://bestbill-backend-174132084209.us-central1.run.app';

    const [formData, setFormData] = useState({
        name: user?.name || '',
        email: user?.email || '',
        password: '',
        confirmPassword: ''
    });

    const [hotelData, setHotelData] = useState({
        name: user?.hotel_name || '',
        address: user?.hotel_address || '',
        upi_id: user?.upi_id || '',
        gst_percentage: user?.gst_percentage || 0,
        billing_method: user?.billing_method || 'qz',
        logo_url: '',
        fssai_number: '',
        email: '',
        phone: ''
    });

    const [staff, setStaff] = useState([]);
    const [staffForm, setStaffForm] = useState({ name: '', email: '', password: '' });
    const [hiring, setHiring] = useState(false);
    const [showPass, setShowPass] = useState(false);
    const [loading, setLoading] = useState(false);
    const [printerConfig, setPrinterConfig] = useState({
        billing: { type: 'usb', printerName: 'billing-printer', ip: '', port: 9100, paperSize: '80mm', charLimit: 42 },
        kitchen: { type: 'usb', printerName: 'kitchen-printer', ip: '', port: 9100, paperSize: '80mm', charLimit: 42 }
    });
    const [installedPrinters, setInstalledPrinters] = useState([]);
    const [availableIps, setAvailableIps] = useState([]);
    const [selectedGuestIp, setSelectedGuestIp] = useState('');
    const [billingCustomActive, setBillingCustomActive] = useState(false);
    const [kitchenCustomActive, setKitchenCustomActive] = useState(false);
    const [lodgingEnabled, setLodgingEnabled] = useState(false);
    const [showLodgingModal, setShowLodgingModal] = useState(false);
    const [lodgingPassword, setLodgingPassword] = useState('');
    const [lodgingModalMode, setLodgingModalMode] = useState('enable');
    const [showPrinters, setShowPrinters] = useState(false);
    
    // Modules
    const [showModules, setShowModules] = useState(false);
    
    // KOT State
    const [kotEnabled, setKotEnabled] = useState(false);
    const [showKotModal, setShowKotModal] = useState(false);
    const [kotPassword, setKotPassword] = useState('');
    const [kotModalMode, setKotModalMode] = useState('enable');
    
    // WhatsApp Billing State
    const [whatsAppBillingEnabled, setWhatsAppBillingEnabled] = useState(false);
    const [showWhatsAppBillingModal, setShowWhatsAppBillingModal] = useState(false);
    const [whatsAppBillingPassword, setWhatsAppBillingPassword] = useState('');
    const [whatsAppBillingModalMode, setWhatsAppBillingModalMode] = useState('enable');

    // Inventory Management State
    const [inventoryEnabled, setInventoryEnabled] = useState(false);
    const [showInventoryModal, setShowInventoryModal] = useState(false);
    const [inventoryPassword, setInventoryPassword] = useState('');
    const [inventoryModalMode, setInventoryModalMode] = useState('enable');

    // Token Counter State
    const [tokenCounterEnabled, setTokenCounterEnabled] = useState(false);
    const [showTokenCounterModal, setShowTokenCounterModal] = useState(false);
    const [tokenCounterPassword, setTokenCounterPassword] = useState('');
    const [tokenCounterModalMode, setTokenCounterModalMode] = useState('enable');

    // Simple KOT State
    const [simpleKotEnabled, setSimpleKotEnabled] = useState(false);
    const [showSimpleKotModal, setShowSimpleKotModal] = useState(false);
    const [simpleKotPassword, setSimpleKotPassword] = useState('');
    const [simpleKotModalMode, setSimpleKotModalMode] = useState('enable');

    // Email Report State
    const [emailReportModuleEnabled, setEmailReportModuleEnabled] = useState(false);
    const [showEmailReportModal, setShowEmailReportModal] = useState(false);
    const [emailReportPassword, setEmailReportPassword] = useState('');
    const [emailReportModalMode, setEmailReportModalMode] = useState('enable');
    const [emailReportConfig, setEmailReportConfig] = useState({
        emailReportEnabled: false,
        emailReportProvider: 'gmail',
        emailReportSender: '',
        emailReportPassword: '',
        emailReportRecipient: '',
        emailReportTime: '23:00',
        emailReportFrequency: 'daily',
        emailReportSmtpHost: 'smtp.gmail.com',
        emailReportSmtpPort: 465,
        emailReportSmtpSecure: true
    });
    const [testingEmailReport, setTestingEmailReport] = useState(false);
    const [showEmailReportSection, setShowEmailReportSection] = useState(false);

    // Update License Key State
    const [showUpdateLicensePasscodeModal, setShowUpdateLicensePasscodeModal] = useState(false);
    const [licensePasscode, setLicensePasscode] = useState('');
    const [showUpdateLicenseModal, setShowUpdateLicenseModal] = useState(false);
    const [updateLicenseInputKey, setUpdateLicenseInputKey] = useState('');
    const [licenseSubmitLoading, setLicenseSubmitLoading] = useState(false);
    const [subscriptionInfo, setSubscriptionInfo] = useState(null);

    const fetchSubscriptionInfo = async () => {
        try {
            const res = await api.get('/auth/subscription-status');
            setSubscriptionInfo(res.data);
        } catch (e) {
            console.error('Failed to fetch subscription status:', e);
        }
    };

    useEffect(() => {
        if (isOwner || isAdmin) {
            fetchSubscriptionInfo();
        }
    }, [isOwner, isAdmin]);

    const handleUpdateLicenseSubmit = async (e) => {
        e.preventDefault();
        if (!updateLicenseInputKey.trim()) return toast.error('Please enter a license key');

        setLicenseSubmitLoading(true);
        try {
            const res = await api.post('/auth/update-license-key', {
                passcode: '592244',
                licenseKey: updateLicenseInputKey.trim()
            });

            if (res.data.isQueued) {
                toast.success(res.data.message || 'License key queued successfully! It will activate automatically when your current plan ends.', { duration: 6000 });
            } else {
                toast.success(res.data.message || 'License key activated successfully!', { duration: 5000 });
            }

            setUpdateLicenseInputKey('');
            setShowUpdateLicenseModal(false);
            fetchSubscriptionInfo();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update license key. Please check key format.');
        } finally {
            setLicenseSubmitLoading(false);
        }
    };

    const [showStaffSection, setShowStaffSection] = useState(false);
    const [showNetworkConfig, setShowNetworkConfig] = useState(false);
    const [showSecurityCore, setShowSecurityCore] = useState(false);
    const [showHotelProfile, setShowHotelProfile] = useState(false);

    // Cloud Analytics Sync State
    const [cloudSyncEnabled, setCloudSyncEnabled] = useState(false);
    const [showCloudSyncModal, setShowCloudSyncModal] = useState(false);
    const [cloudSyncModalStep, setCloudSyncModalStep] = useState(1);
    const [cloudSyncModalMode, setCloudSyncModalMode] = useState('enable');
    const [cloudSyncPassword, setCloudSyncPassword] = useState('');
    const [cloudSyncConfig, setCloudSyncConfig] = useState({
        cloudSyncUrl: '',
        cloudSyncAnonKey: '',
        cloudSyncHotelCode: 'HOTEL_001',
        cloudSyncOwnerEmail: '',
        cloudSyncOwnerPassword: '',
        cloudSyncIntervalMinutes: 15,
        lastCloudSyncTime: ''
    });

    useEffect(() => {
        if (isOwner) {
            fetchStaff();
            fetchHotelDetails();
            fetchPrinterConfig();
            fetchInstalledPrinters();
            fetchAvailableIps();
            fetchLodgingStatus();
            fetchKotStatus();
            fetchWhatsAppBillingStatus();
            fetchInventoryStatus();
            fetchTokenCounterStatus();
            fetchSimpleKotStatus();
            fetchEmailReportStatus();
            fetchEmailReportConfig();
            fetchCloudSyncConfig();
        }
    }, [isOwner]);

    const fetchLodgingStatus = async () => {
        try {
            const res = await api.get('/hotel/lodging-status');
            setLodgingEnabled(res.data.lodgingEnabled);
            updateUser({ lodgingEnabled: res.data.lodgingEnabled });
        } catch (err) {
            console.error('Failed to fetch lodging status', err);
        }
    };

    const handleToggleLodging = (shouldEnable) => {
        if (shouldEnable) {
            setLodgingModalMode('enable');
            setLodgingPassword('');
            setShowLodgingModal(true);
        } else {
            setLodgingModalMode('disable');
            setLodgingPassword('');
            setShowLodgingModal(true);
        }
    };

    const handleLodgingModalSubmit = async () => {
        if (!lodgingPassword) {
            toast.error("Password cannot be blank");
            return;
        }
        if (lodgingModalMode === 'enable') {
            try {
                const res = await api.post('/hotel/toggle-lodging', { enabled: true, passcode: lodgingPassword });
                if (res.data.success) {
                    setLodgingEnabled(true);
                    updateUser({ lodgingEnabled: true });
                    toast.success("Premium Lodging module unlocked and activated!");
                    setShowLodgingModal(false);
                }
            } catch (err) {
                toast.error(err.response?.data?.message || "Incorrect activation password");
            }
        } else {
            try {
                const res = await api.post('/hotel/toggle-lodging', { enabled: false, passcode: lodgingPassword });
                if (res.data.success) {
                    setLodgingEnabled(false);
                    updateUser({ lodgingEnabled: false });
                    toast.success("Lodging module deactivated successfully.");
                    setShowLodgingModal(false);
                }
            } catch (err) {
                toast.error(err.response?.data?.message || "Incorrect deactivation password");
            }
        }
    };

    const fetchKotStatus = async () => {
        try {
            const res = await api.get('/hotel/kot-status');
            setKotEnabled(res.data.kotEnabled);
            updateUser({ kotEnabled: res.data.kotEnabled });
        } catch (err) {
            console.error('Failed to fetch KOT status', err);
        }
    };

    const handleToggleKot = (shouldEnable) => {
        if (shouldEnable) {
            setKotModalMode('enable');
            setKotPassword('');
            setShowKotModal(true);
        } else {
            setKotModalMode('disable');
            setKotPassword('');
            setShowKotModal(true);
        }
    };

    const handleKotModalSubmit = async () => {
        if (!kotPassword) {
            toast.error("Password cannot be blank");
            return;
        }
        if (kotModalMode === 'enable') {
            try {
                const res = await api.post('/hotel/toggle-kot', { enabled: true, passcode: kotPassword });
                if (res.data.success) {
                    setKotEnabled(true);
                    updateUser({ kotEnabled: true });
                    toast.success("KOT Module activated!");
                    setShowKotModal(false);
                }
            } catch (err) {
                toast.error(err.response?.data?.message || "Incorrect activation password");
            }
        } else {
            try {
                const res = await api.post('/hotel/toggle-kot', { enabled: false, passcode: kotPassword });
                if (res.data.success) {
                    setKotEnabled(false);
                    updateUser({ kotEnabled: false });
                    toast.success("KOT module deactivated.");
                    setShowKotModal(false);
                }
            } catch (err) {
                toast.error(err.response?.data?.message || "Incorrect deactivation password");
            }
        }
    };

    const fetchWhatsAppBillingStatus = async () => {
        try {
            const res = await api.get('/hotel/whatsapp-billing-status');
            setWhatsAppBillingEnabled(res.data.whatsAppBillingEnabled);
            updateUser({ whatsAppBillingEnabled: res.data.whatsAppBillingEnabled });
        } catch (err) {
            console.error('Failed to fetch WhatsApp billing status', err);
        }
    };

    const handleToggleWhatsAppBilling = (shouldEnable) => {
        if (shouldEnable) {
            setWhatsAppBillingModalMode('enable');
            setWhatsAppBillingPassword('');
            setShowWhatsAppBillingModal(true);
        } else {
            setWhatsAppBillingModalMode('disable');
            setWhatsAppBillingPassword('');
            setShowWhatsAppBillingModal(true);
        }
    };

    const handleWhatsAppBillingModalSubmit = async () => {
        if (!whatsAppBillingPassword) {
            toast.error("Password cannot be blank");
            return;
        }
        if (whatsAppBillingModalMode === 'enable') {
            try {
                const res = await api.post('/hotel/toggle-whatsapp-billing', { enabled: true, passcode: whatsAppBillingPassword });
                if (res.data.success) {
                    setWhatsAppBillingEnabled(true);
                    updateUser({ whatsAppBillingEnabled: true });
                    toast.success("WhatsApp Billing activated!");
                    setShowWhatsAppBillingModal(false);
                }
            } catch (err) {
                toast.error(err.response?.data?.message || "Incorrect activation password");
            }
        } else {
            try {
                const res = await api.post('/hotel/toggle-whatsapp-billing', { enabled: false, passcode: whatsAppBillingPassword });
                if (res.data.success) {
                    setWhatsAppBillingEnabled(false);
                    updateUser({ whatsAppBillingEnabled: false });
                    toast.success("WhatsApp Billing deactivated.");
                    setShowWhatsAppBillingModal(false);
                }
            } catch (err) {
                toast.error(err.response?.data?.message || "Incorrect deactivation password");
            }
        }
    };

    const fetchInventoryStatus = async () => {
        try {
            const res = await api.get('/hotel/inventory-status');
            setInventoryEnabled(res.data.inventoryEnabled);
            updateUser({ inventoryEnabled: res.data.inventoryEnabled });
        } catch (err) {
            console.error('Failed to fetch inventory status', err);
        }
    };

    const handleToggleInventory = (shouldEnable) => {
        if (shouldEnable) {
            setInventoryModalMode('enable');
            setInventoryPassword('');
            setShowInventoryModal(true);
        } else {
            setInventoryModalMode('disable');
            setInventoryPassword('');
            setShowInventoryModal(true);
        }
    };

    const handleInventoryModalSubmit = async () => {
        if (!inventoryPassword) {
            toast.error("Password cannot be blank");
            return;
        }
        if (inventoryModalMode === 'enable') {
            try {
                const res = await api.post('/hotel/toggle-inventory', { enabled: true, passcode: inventoryPassword });
                if (res.data.success) {
                    setInventoryEnabled(true);
                    updateUser({ inventoryEnabled: true });
                    toast.success("Inventory Management Module activated!");
                    setShowInventoryModal(false);
                }
            } catch (err) {
                toast.error(err.response?.data?.message || "Incorrect activation password");
            }
        } else {
            try {
                const res = await api.post('/hotel/toggle-inventory', { enabled: false, passcode: inventoryPassword });
                if (res.data.success) {
                    setInventoryEnabled(false);
                    updateUser({ inventoryEnabled: false });
                    toast.success("Inventory Management Module deactivated.");
                    setShowInventoryModal(false);
                }
            } catch (err) {
                toast.error(err.response?.data?.message || "Incorrect deactivation password");
            }
        }
    };

    const fetchTokenCounterStatus = async () => {
        try {
            const res = await api.get('/hotel/token-counter-status');
            setTokenCounterEnabled(res.data.tokenCounterEnabled);
            updateUser({ tokenCounterEnabled: res.data.tokenCounterEnabled });
        } catch (err) {
            console.error('Failed to fetch token counter status', err);
        }
    };

    const fetchSimpleKotStatus = async () => {
        try {
            const res = await api.get('/hotel/simple-kot-status');
            setSimpleKotEnabled(res.data.simpleKotEnabled);
            updateUser({ simpleKotEnabled: res.data.simpleKotEnabled });
        } catch (err) {
            console.error('Failed to fetch simple KOT status', err);
        }
    };

    const handleToggleTokenCounter = (shouldEnable) => {
        if (shouldEnable) {
            setTokenCounterModalMode('enable');
            setTokenCounterPassword('');
            setShowTokenCounterModal(true);
        } else {
            setTokenCounterModalMode('disable');
            setTokenCounterPassword('');
            setShowTokenCounterModal(true);
        }
    };

    const handleTokenCounterModalSubmit = async () => {
        if (!tokenCounterPassword) {
            toast.error("Password cannot be blank");
            return;
        }
        if (tokenCounterModalMode === 'enable') {
            try {
                const res = await api.post('/hotel/toggle-token-counter', { enabled: true, passcode: tokenCounterPassword });
                if (res.data.success) {
                    setTokenCounterEnabled(true);
                    updateUser({ tokenCounterEnabled: true });
                    toast.success("Token Counter module activated!");
                    setShowTokenCounterModal(false);
                }
            } catch (err) {
                toast.error(err.response?.data?.message || "Incorrect activation password");
            }
        } else {
            try {
                const res = await api.post('/hotel/toggle-token-counter', { enabled: false, passcode: tokenCounterPassword });
                if (res.data.success) {
                    setTokenCounterEnabled(false);
                    updateUser({ tokenCounterEnabled: false });
                    toast.success("Token Counter module deactivated.");
                    setShowTokenCounterModal(false);
                }
            } catch (err) {
                toast.error(err.response?.data?.message || "Incorrect deactivation password");
            }
        }
    };

    const handleToggleSimpleKot = (shouldEnable) => {
        if (shouldEnable) {
            setSimpleKotModalMode('enable');
            setSimpleKotPassword('');
            setShowSimpleKotModal(true);
        } else {
            setSimpleKotModalMode('disable');
            setSimpleKotPassword('');
            setShowSimpleKotModal(true);
        }
    };

    const handleSimpleKotModalSubmit = async () => {
        if (!simpleKotPassword) {
            toast.error("Password cannot be blank");
            return;
        }
        if (simpleKotModalMode === 'enable') {
            try {
                const res = await api.post('/hotel/toggle-simple-kot', { enabled: true, passcode: simpleKotPassword });
                if (res.data.success) {
                    setSimpleKotEnabled(true);
                    updateUser({ simpleKotEnabled: true });
                    toast.success("Simple KOT module activated!");
                    setShowSimpleKotModal(false);
                }
            } catch (err) {
                toast.error(err.response?.data?.message || "Incorrect activation password");
            }
        } else {
            try {
                const res = await api.post('/hotel/toggle-simple-kot', { enabled: false, passcode: simpleKotPassword });
                if (res.data.success) {
                    setSimpleKotEnabled(false);
                    updateUser({ simpleKotEnabled: false });
                    toast.success("Simple KOT module deactivated.");
                    setShowSimpleKotModal(false);
                }
            } catch (err) {
                toast.error(err.response?.data?.message || "Incorrect deactivation password");
            }
        }
    };

    const fetchEmailReportStatus = async () => {
        try {
            const res = await api.get('/hotel/email-report-status');
            setEmailReportModuleEnabled(res.data.emailReportModuleEnabled);
            updateUser({ emailReportModuleEnabled: res.data.emailReportModuleEnabled });
        } catch (err) {
            console.error('Failed to fetch email report status', err);
        }
    };

    const handleToggleEmailReport = (shouldEnable) => {
        if (shouldEnable) {
            setEmailReportModalMode('enable');
            setEmailReportPassword('');
            setShowEmailReportModal(true);
        } else {
            setEmailReportModalMode('disable');
            setEmailReportPassword('');
            setShowEmailReportModal(true);
        }
    };

    const handleEmailReportModalSubmit = async () => {
        if (!emailReportPassword) {
            toast.error("Password cannot be blank");
            return;
        }
        if (emailReportModalMode === 'enable') {
            try {
                const res = await api.post('/hotel/toggle-email-report', { enabled: true, passcode: emailReportPassword });
                if (res.data.success) {
                    setEmailReportModuleEnabled(true);
                    updateUser({ emailReportModuleEnabled: true });
                    toast.success("Automated Email Reports module activated!");
                    setShowEmailReportModal(false);
                }
            } catch (err) {
                toast.error(err.response?.data?.message || "Incorrect activation password");
            }
        } else {
            try {
                const res = await api.post('/hotel/toggle-email-report', { enabled: false, passcode: emailReportPassword });
                if (res.data.success) {
                    setEmailReportModuleEnabled(false);
                    updateUser({ emailReportModuleEnabled: false });
                    toast.success("Automated Email Reports module deactivated.");
                    setShowEmailReportModal(false);
                }
            } catch (err) {
                toast.error(err.response?.data?.message || "Incorrect deactivation password");
            }
        }
    };

    const fetchEmailReportConfig = async () => {
        try {
            const res = await api.get('/hotel/email-report-config');
            if (res.data) {
                setEmailReportConfig(res.data);
            }
        } catch (err) {
            console.error('Failed to fetch email report configs', err);
        }
    };

    const handleEmailReportConfigSubmit = async (e) => {
        e.preventDefault();
        const t = toast.loading('Saving email report configurations...');
        try {
            await api.post('/hotel/email-report-config', emailReportConfig);
            toast.success('Email configurations updated successfully!', { id: t });
            fetchEmailReportConfig();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update email configurations', { id: t });
        }
    };

    // Cloud Analytics Sync Handlers
    const fetchCloudSyncConfig = async () => {
        try {
            const res = await api.get('/cloud-sync/config');
            setCloudSyncEnabled(res.data.cloudSyncEnabled);
            setCloudSyncConfig({
                cloudSyncUrl: res.data.cloudSyncUrl || '',
                cloudSyncAnonKey: res.data.cloudSyncAnonKey || '',
                cloudSyncHotelCode: res.data.cloudSyncHotelCode || 'HOTEL_001',
                cloudSyncOwnerEmail: res.data.cloudSyncOwnerEmail || '',
                cloudSyncOwnerPassword: '',
                cloudSyncOwnerPasswordConfigured: res.data.cloudSyncOwnerPasswordConfigured,
                cloudSyncIntervalMinutes: res.data.cloudSyncIntervalMinutes || 15,
                lastCloudSyncTime: res.data.lastCloudSyncTime || ''
            });
        } catch (err) {
            console.error('Failed to fetch cloud sync config', err);
        }
    };

    const handleToggleCloudSync = (shouldEnable) => {
        setCloudSyncModalMode(shouldEnable ? 'enable' : 'disable');
        setCloudSyncModalStep(1);
        setCloudSyncPassword('');
        setShowCloudSyncModal(true);
    };

    // Step 1: Verify Passcode
    const handleVerifyPasscodeStep = async (e) => {
        if (e) e.preventDefault();
        if (!cloudSyncPassword) {
            toast.error("Passcode cannot be blank");
            return;
        }

        if (cloudSyncModalMode === 'disable') {
            const t = toast.loading('Deactivating Online Sync...');
            try {
                const res = await api.post('/cloud-sync/config', {
                    passcode: cloudSyncPassword,
                    cloudSyncEnabled: false
                });
                setCloudSyncEnabled(false);
                setShowCloudSyncModal(false);
                toast.success('Online Sync Deactivated Successfully!', { id: t });
                fetchCloudSyncConfig();
            } catch (err) {
                toast.error(err.response?.data?.message || 'Invalid Passcode', { id: t });
            }
            return;
        }

        // Mode is 'enable': verify passcode first before showing credentials step
        const t = toast.loading('Verifying passcode...');
        try {
            await api.post('/cloud-sync/verify-passcode', { passcode: cloudSyncPassword });
            toast.dismiss(t);
            setCloudSyncModalStep(2);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Invalid Passcode', { id: t });
        }
    };

    // Step 2: Save Credentials & Activate Sync
    const handleSaveCloudCredentialsStep = async (e) => {
        if (e) e.preventDefault();
        if (!cloudSyncConfig.cloudSyncOwnerEmail || !cloudSyncConfig.cloudSyncOwnerEmail.includes('@')) {
            toast.error("Please enter a valid owner email address");
            return;
        }
        if (!cloudSyncConfig.cloudSyncOwnerPassword && !cloudSyncConfig.cloudSyncOwnerPasswordConfigured) {
            toast.error("Please enter an owner password for mobile admin access");
            return;
        }
        if (cloudSyncConfig.cloudSyncOwnerPassword && cloudSyncConfig.cloudSyncOwnerPassword.length < 6) {
            toast.error("Password must be at least 6 characters long");
            return;
        }

        const t = toast.loading('Activating Cloud Sync...');
        try {
            const res = await api.post('/cloud-sync/config', {
                passcode: cloudSyncPassword,
                cloudSyncEnabled: true,
                ...cloudSyncConfig
            });
            setCloudSyncEnabled(true);
            setShowCloudSyncModal(false);
            if (res.data.warning) {
                toast.success(res.data.warning, { id: t, duration: 5000 });
            } else {
                toast.success(res.data.message || 'Online Sync Activated & Synced Successfully!', { id: t });
            }
            fetchCloudSyncConfig();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to activate cloud sync', { id: t });
        }
    };

    const fetchInstalledPrinters = async () => {
        try {
            const res = await api.get('/hotel/installed-printers');
            setInstalledPrinters(res.data || []);
        } catch (err) {
            console.error('Failed to fetch installed printers', err);
        }
    };

    const fetchAvailableIps = async () => {
        if (window.bestbillDesktop?.getLanIps) {
            try {
                const ips = await window.bestbillDesktop.getLanIps();
                setAvailableIps(ips || []);
            } catch (err) {
                console.error('Failed to fetch LAN IPs from desktop app', err);
            }
        } else {
            setAvailableIps(['127.0.0.1', '192.168.1.100']);
        }
    };

    const fetchPrinterConfig = async () => {
        try {
            const res = await api.get('/hotel/printers-config');
            if (res.data) {
                setPrinterConfig({
                    billing: { type: 'usb', printerName: 'billing-printer', ip: '', port: 9100, paperSize: '80mm', charLimit: 42, ...(res.data.printers?.billing || {}) },
                    kitchen: { type: 'usb', printerName: 'kitchen-printer', ip: '', port: 9100, paperSize: '80mm', charLimit: 42, ...(res.data.printers?.kitchen || {}) }
                });
                setSelectedGuestIp(res.data.guestIp || '');
            }
        } catch (err) {
            console.error('Failed to load configs', err);
        }
    };

    const handlePrinterConfigSubmit = async (e) => {
        e.preventDefault();
        try {
            await api.post('/hotel/printers-config', {
                billing: printerConfig.billing,
                kitchen: printerConfig.kitchen,
                guestIp: selectedGuestIp
            });
            toast.success('Configurations updated successfully!');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update configurations');
        }
    };

    const fetchHotelDetails = async () => {
        try {
            const res = await api.get('/hotel');
            const data = res.data;
            setHotelData(prev => ({
                ...prev,
                name: data.name || '',
                address: data.location || '',
                upi_id: data.upi_id || '',
                gst_percentage: data.gst_percentage || 0,
                billing_method: data.billing_method || 'qz',
                logo_url: data.logo_url || '',
                fssai_number: data.fssai_number || '',
                email: data.email || '',
                phone: data.phone || ''
            }));
        } catch (err) {
            console.error('Failed to load hotel details', err);
        }
    };

    const fetchStaff = async () => {
        try {
            const res = await api.get('/hotel/waiters');
            setStaff(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const handleHiring = async (e) => {
        e.preventDefault();
        setHiring(true);
        const t = toast.loading('Onboarding staff member...');
        try {
            await api.post('/hotel/waiters', staffForm);
            toast.success(`${staffForm.name} added to waitstaff!`, { id: t });
            setStaffForm({ name: '', email: '', password: '' });
            fetchStaff();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Hiring failed', { id: t });
        } finally {
            setHiring(false);
        }
    };

    const removeStaff = async (id) => {
        try {
            await api.delete(`/hotel/waiters/${id}`);
            toast.success('Staff access revoked');
            fetchStaff();
        } catch (err) {
            toast.error('Removal failed');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (formData.password && formData.password !== formData.confirmPassword) {
            return toast.error('Passcodes do not match!');
        }
        setLoading(true);
        const t = toast.loading('Syncing security updates...');
        try {
            const updatePayload = { name: formData.name, email: formData.email };
            if (formData.password) updatePayload.password = formData.password;
            const res = await api.put('/profile', updatePayload);
            updateUser(res.data.user);
            toast.success('Personal credentials updated!', { id: t });
            setFormData(prev => ({ ...prev, password: '', confirmPassword: '' }));
        } catch (err) {
            toast.error('Failed to update credentials', { id: t });
        } finally {
            setLoading(false);
        }
    };

    const handleHotelSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        const t = toast.loading('Persisting hotel configuration...');
        try {
            const res = await api.put('/hotel', hotelData);
            updateUser({ 
                ...user, 
                hotel_name: res.data.name, 
                hotel_address: res.data.address,
                upi_id: res.data.upi_id, 
                gst_percentage: res.data.gst_percentage,
                printer_size: res.data.printer_size,
                billing_method: res.data.billing_method
            });
            toast.success('Hotel configuration persisted!', { id: t });
        } catch (err) {
            console.error(err);
            toast.error('Failed to update hotel settings. Check all fields.', { id: t });
        } finally {
            setLoading(false);
        }
    };

    return (
    <div style={{ width: '100%', maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '100px', overflow: 'hidden' }}>
            
            {/* Security Core Card */}
            <div style={{ width: '100%' }}>
                <div 
                    onClick={() => setShowSecurityCore(!showSecurityCore)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showSecurityCore ? '12px' : '0', cursor: 'pointer', backgroundColor: 'var(--bg-card)', padding: '14px 20px', borderRadius: '12px', border: '1px solid var(--border-rgba-05)', transition: 'all 0.2s' }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <UserCircle size={22} style={{ color: themeColor }} />
                        <h2 style={{fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Security Core</h2>
                    </div>
                    <ChevronDown 
                        size={20} 
                        style={{ 
                            color: 'var(--text-muted)', 
                            transform: showSecurityCore ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.3s ease'
                        }} 
                    />
                </div>
                {showSecurityCore && (
                    <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-rgba-05)' }}>
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                           <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>IDENTITY NAME</label>
                              <input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} style={{width: '100%', padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 500 }} />
                           </div>
                           <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>EMAIL PROTOCOL</label>
                              <input value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} style={{width: '100%', padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 500 }} />
                           </div>
                           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                               <input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} placeholder="New Passcode" style={{padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 500 }} />
                               <input type="password" value={formData.confirmPassword} onChange={e => setFormData({...formData, confirmPassword: e.target.value})} placeholder="Confirm" style={{padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 500 }} />
                           </div>
                           <button type="submit" style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: themeColor, color: 'white', padding: '12px 24px', borderRadius: '12px', fontWeight: 600, cursor: 'pointer', border: 'none', boxShadow: `0 10px 20px ${themeColor}20`, width: 'fit-content' }}>
                               <Save size={18} />
                               Update Credentials
                           </button>
                        </form>
                    </div>
                )}
            </div>

            {/* Hotel Profile Card */}
            {isOwner && (
                <div style={{ width: '100%' }}>
                    <div 
                        onClick={() => setShowHotelProfile(!showHotelProfile)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showHotelProfile ? '12px' : '0', cursor: 'pointer', backgroundColor: 'var(--bg-card)', padding: '14px 20px', borderRadius: '12px', border: '1px solid var(--border-rgba-05)', transition: 'all 0.2s' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <LayoutPanelLeft size={22} style={{ color: '#0ea5e9' }} />
                            <h2 style={{fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Hotel Profile</h2>
                        </div>
                        <ChevronDown 
                            size={20} 
                            style={{ 
                                color: 'var(--text-muted)', 
                                transform: showHotelProfile ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform 0.3s ease'
                            }} 
                        />
                    </div>
                    {showHotelProfile && (
                        <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-rgba-05)' }}>
                            <form onSubmit={handleHotelSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>HOTEL LEGAL NAME</label>
                                        <input value={hotelData.name} onChange={e => setHotelData({...hotelData, name: e.target.value})} style={{padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 500 }} />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>GST %</label>
                                        <input type="number" value={hotelData.gst_percentage} onChange={e => setHotelData({...hotelData, gst_percentage: e.target.value})} style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: '#10b981', fontWeight: 600 }} />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>PHYSICAL ADDRESS</label>
                                        <input 
                                            value={hotelData.address} 
                                            onChange={e => setHotelData({ ...hotelData, address: e.target.value })} 
                                            style={{width: '100%', padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 500, outline: 'none' }} 
                                        />
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>MOBILE NUMBER</label>
                                            <input 
                                                value={hotelData.phone} 
                                                onChange={e => setHotelData({ ...hotelData, phone: e.target.value })} 
                                                style={{width: '100%', padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 500, outline: 'none' }} 
                                            />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>HOTEL EMAIL</label>
                                            <input 
                                                value={hotelData.email} 
                                                onChange={e => setHotelData({ ...hotelData, email: e.target.value })} 
                                                style={{width: '100%', padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 500, outline: 'none' }} 
                                            />
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>UPI ID (MERCHANT)</label>
                                            <input 
                                                value={hotelData.upi_id} 
                                                onChange={e => setHotelData({ ...hotelData, upi_id: e.target.value })} 
                                                style={{width: '100%', padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 500, outline: 'none' }} 
                                            />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>FSSAI NUMBER</label>
                                            <input 
                                                value={hotelData.fssai_number} 
                                                onChange={e => setHotelData({ ...hotelData, fssai_number: e.target.value })} 
                                                style={{width: '100%', padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 500, outline: 'none' }} 
                                            />
                                        </div>
                                    </div>
                                </div>

                                <button type="submit" style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#0ea5e9', color: 'white', padding: '12px 24px', borderRadius: '12px', fontWeight: 600, cursor: 'pointer', border: 'none', width: 'fit-content', marginTop: '8px' }}>
                                    <Save size={18} />
                                    Save Profile Settings
                                </button>
                            </form>
                        </div>
                    )}
                </div>
            )}

            {/* Physical Offline Printers Management */}
            {isOwner && (
                <div style={{ width: '100%' }}>
                    <div 
                        onClick={() => setShowPrinters(!showPrinters)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showPrinters ? '12px' : '0', cursor: 'pointer', backgroundColor: 'var(--bg-card)', padding: '14px 20px', borderRadius: '12px', border: '1px solid var(--border-rgba-05)', transition: 'all 0.2s' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <Printer size={22} style={{ color: '#10b981' }} />
                            <h2 style={{fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Offline Physical Printers</h2>
                        </div>
                        <ChevronDown 
                            size={20} 
                            style={{ 
                                color: 'var(--text-muted)', 
                                transform: showPrinters ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform 0.3s ease'
                            }} 
                        />
                    </div>
                    {showPrinters && (
                        <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-rgba-05)' }}>
                            <form onSubmit={handlePrinterConfigSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                    
                                    {/* Billing Printer Form */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', borderRadius: '12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--bg-border)' }}>
                                        <h3 style={{fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }}></span>
                                            Cashier Billing Printer
                                        </h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>CONNECTION TYPE</label>
                                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                                <select 
                                                    value={printerConfig.billing.type} 
                                                    onChange={e => setPrinterConfig({
                                                        ...printerConfig,
                                                        billing: { ...printerConfig.billing, type: e.target.value }
                                                    })}
                                                    style={{width: '100%', padding: '10px 14px', paddingRight: '40px', borderRadius: '8px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 600, appearance: 'none', outline: 'none' }}
                                                >
                                                    <option value="usb">USB / Windows Spooled</option>
                                                    <option value="network">Network (LAN/Wi-Fi)</option>
                                                </select>
                                                <ChevronDown size={18} style={{ position: 'absolute', right: '14px', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                                            </div>
                                        </div>
                                        {printerConfig.billing.type === 'usb' ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>WINDOWS SHARED / PORT NAME</label>
                                                
                                                {!billingCustomActive ? (
                                                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                                        <select 
                                                            value={printerConfig.billing.printerName} 
                                                            onChange={e => {
                                                                 if (e.target.value === '__custom__') {
                                                                     setBillingCustomActive(true);
                                                                     setPrinterConfig({
                                                                         ...printerConfig,
                                                                         billing: { ...printerConfig.billing, printerName: '' }
                                                                     });
                                                                 } else {
                                                                     setPrinterConfig({
                                                                         ...printerConfig,
                                                                         billing: { ...printerConfig.billing, printerName: e.target.value }
                                                                     });
                                                                 }
                                                            }}
                                                            style={{width: '100%', padding: '10px 14px', paddingRight: '40px', borderRadius: '8px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 600, appearance: 'none', outline: 'none' }}
                                                        >
                                                            <option value="">-- Select Installed Printer --</option>
                                                            {installedPrinters.map(p => (
                                                                <option key={p} value={p}>{p}</option>
                                                            ))}
                                                            {printerConfig.billing.printerName && !installedPrinters.includes(printerConfig.billing.printerName) && (
                                                                <option value={printerConfig.billing.printerName}>{printerConfig.billing.printerName} (Saved)</option>
                                                            )}
                                                            <option value="__custom__">⌨️ Type Custom Printer Name...</option>
                                                        </select>
                                                        <ChevronDown size={18} style={{ position: 'absolute', right: '14px', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                        <input 
                                                            value={printerConfig.billing.printerName} 
                                                            onChange={e => setPrinterConfig({
                                                                ...printerConfig,
                                                                billing: { ...printerConfig.billing, printerName: e.target.value }
                                                            })}
                                                            placeholder="Type printer name (e.g. billing-printer)" 
                                                            style={{width: '100%', padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 500, outline: 'none' }} 
                                                        />
                                                        <button 
                                                            type="button" 
                                                            onClick={() => setBillingCustomActive(false)}
                                                            style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: '#0ea5e9', fontSize: '11px', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                                                        >
                                                            ◀ Select from detected list
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>IP ADDRESS</label>
                                                    <input 
                                                        value={printerConfig.billing.ip} 
                                                        onChange={e => setPrinterConfig({
                                                            ...printerConfig,
                                                            billing: { ...printerConfig.billing, ip: e.target.value }
                                                        })}
                                                        placeholder="e.g. 192.168.1.100" 
                                                        style={{padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 500 }} 
                                                    />
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>PORT</label>
                                                    <input 
                                                        type="number"
                                                        value={printerConfig.billing.port} 
                                                        onChange={e => setPrinterConfig({
                                                            ...printerConfig,
                                                            billing: { ...printerConfig.billing, port: parseInt(e.target.value) || 9100 }
                                                        })}
                                                        placeholder="9100" 
                                                        style={{padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 500 }} 
                                                    />
                                                </div>
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>PAPER ROLL SIZE</label>
                                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                                <select 
                                                    value={printerConfig.billing.paperSize || '80mm'} 
                                                    onChange={e => setPrinterConfig({
                                                        ...printerConfig,
                                                        billing: { ...printerConfig.billing, paperSize: e.target.value }
                                                    })}
                                                    style={{width: '100%', padding: '10px 14px', paddingRight: '40px', borderRadius: '8px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 600, appearance: 'none', outline: 'none' }}
                                                >
                                                    <option value="80mm">Standard Receipt (80mm)</option>
                                                    <option value="58mm">Compact Receipt (58mm)</option>
                                                </select>
                                                <ChevronDown size={18} style={{ position: 'absolute', right: '14px', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                                            </div>
                                            {printerConfig.billing.paperSize === '80mm' && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                                                    <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>80MM CHARACTER LIMIT</label>
                                                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                                        <select 
                                                            value={printerConfig.billing.charLimit || 42} 
                                                            onChange={e => setPrinterConfig({
                                                                ...printerConfig,
                                                                billing: { ...printerConfig.billing, charLimit: Number(e.target.value) }
                                                            })}
                                                            style={{width: '100%', padding: '10px 14px', paddingRight: '40px', borderRadius: '8px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 600, appearance: 'none', outline: 'none' }}
                                                        >
                                                            <option value={42}>42 Characters per Line (Compact - Recommended)</option>
                                                            <option value={48}>48 Characters per Line (Wide)</option>
                                                        </select>
                                                        <ChevronDown size={18} style={{ position: 'absolute', right: '14px', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                                                    </div>
                                                </div>
                                            )}
                                            <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 500 }}>Receipt column alignment is auto-calculated based on selected paper width</span>
                                        </div>
                                    </div>
 
                                    {/* Kitchen Printer Form */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', borderRadius: '12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--bg-border)' }}>
                                        <h3 style={{fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b' }}></span>
                                            Kitchen KOT Printer
                                        </h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>CONNECTION TYPE</label>
                                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                                <select 
                                                    value={printerConfig.kitchen.type} 
                                                    onChange={e => setPrinterConfig({
                                                        ...printerConfig,
                                                        kitchen: { ...printerConfig.kitchen, type: e.target.value }
                                                    })}
                                                    style={{width: '100%', padding: '10px 14px', paddingRight: '40px', borderRadius: '8px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 600, appearance: 'none', outline: 'none' }}
                                                >
                                                    <option value="usb">USB / Windows Spooled</option>
                                                    <option value="network">Network (LAN/Wi-Fi)</option>
                                                </select>
                                                <ChevronDown size={18} style={{ position: 'absolute', right: '14px', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                                            </div>
                                        </div>
                                        {printerConfig.kitchen.type === 'usb' ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>WINDOWS SHARED / PORT NAME</label>
                                                
                                                {!kitchenCustomActive ? (
                                                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                                        <select 
                                                            value={printerConfig.kitchen.printerName} 
                                                            onChange={e => {
                                                                 if (e.target.value === '__custom__') {
                                                                     setKitchenCustomActive(true);
                                                                     setPrinterConfig({
                                                                         ...printerConfig,
                                                                         kitchen: { ...printerConfig.kitchen, printerName: '' }
                                                                     });
                                                                 } else {
                                                                     setPrinterConfig({
                                                                         ...printerConfig,
                                                                         kitchen: { ...printerConfig.kitchen, printerName: e.target.value }
                                                                     });
                                                                 }
                                                            }}
                                                            style={{width: '100%', padding: '10px 14px', paddingRight: '40px', borderRadius: '8px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 600, appearance: 'none', outline: 'none' }}
                                                        >
                                                            <option value="">-- Select Installed Printer --</option>
                                                            {installedPrinters.map(p => (
                                                                <option key={p} value={p}>{p}</option>
                                                            ))}
                                                            {printerConfig.kitchen.printerName && !installedPrinters.includes(printerConfig.kitchen.printerName) && (
                                                                <option value={printerConfig.kitchen.printerName}>{printerConfig.kitchen.printerName} (Saved)</option>
                                                            )}
                                                            <option value="__custom__">⌨️ Type Custom Printer Name...</option>
                                                        </select>
                                                        <ChevronDown size={18} style={{ position: 'absolute', right: '14px', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                        <input 
                                                            value={printerConfig.kitchen.printerName} 
                                                            onChange={e => setPrinterConfig({
                                                                ...printerConfig,
                                                                kitchen: { ...printerConfig.kitchen, printerName: e.target.value }
                                                            })}
                                                            placeholder="Type printer name (e.g. kitchen-printer)" 
                                                            style={{width: '100%', padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 500, outline: 'none' }} 
                                                        />
                                                        <button 
                                                            type="button" 
                                                            onClick={() => setKitchenCustomActive(false)}
                                                            style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: '#0ea5e9', fontSize: '11px', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                                                        >
                                                            ◀ Select from detected list
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>IP ADDRESS</label>
                                                    <input 
                                                        value={printerConfig.kitchen.ip} 
                                                        onChange={e => setPrinterConfig({
                                                            ...printerConfig,
                                                            kitchen: { ...printerConfig.kitchen, ip: e.target.value }
                                                        })}
                                                        placeholder="e.g. 192.168.1.101" 
                                                        style={{padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 500 }} 
                                                    />
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>PORT</label>
                                                    <input 
                                                        type="number"
                                                        value={printerConfig.kitchen.port} 
                                                        onChange={e => setPrinterConfig({
                                                            ...printerConfig,
                                                            kitchen: { ...printerConfig.kitchen, port: parseInt(e.target.value) || 9100 }
                                                        })}
                                                        placeholder="9100" 
                                                        style={{padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 500 }} 
                                                    />
                                                </div>
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>PAPER ROLL SIZE</label>
                                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                                <select 
                                                    value={printerConfig.kitchen.paperSize || '80mm'} 
                                                    onChange={e => setPrinterConfig({
                                                        ...printerConfig,
                                                        kitchen: { ...printerConfig.kitchen, paperSize: e.target.value }
                                                    })}
                                                    style={{width: '100%', padding: '10px 14px', paddingRight: '40px', borderRadius: '8px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 600, appearance: 'none', outline: 'none' }}
                                                >
                                                    <option value="80mm">Standard Receipt (80mm)</option>
                                                    <option value="58mm">Compact Receipt (58mm)</option>
                                                </select>
                                                <ChevronDown size={18} style={{ position: 'absolute', right: '14px', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                                            </div>
                                            {printerConfig.kitchen.paperSize === '80mm' && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                                                    <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>80MM CHARACTER LIMIT</label>
                                                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                                        <select 
                                                            value={printerConfig.kitchen.charLimit || 42} 
                                                            onChange={e => setPrinterConfig({
                                                                ...printerConfig,
                                                                kitchen: { ...printerConfig.kitchen, charLimit: Number(e.target.value) }
                                                            })}
                                                            style={{width: '100%', padding: '10px 14px', paddingRight: '40px', borderRadius: '8px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 600, appearance: 'none', outline: 'none' }}
                                                        >
                                                            <option value={42}>42 Characters per Line (Compact - Recommended)</option>
                                                            <option value={48}>48 Characters per Line (Wide)</option>
                                                        </select>
                                                        <ChevronDown size={18} style={{ position: 'absolute', right: '14px', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                                                    </div>
                                                </div>
                                            )}
                                            <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 500 }}>KOT column alignment is auto-calculated based on selected paper width</span>
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '8px' }}>
                                    <button type="submit" style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#10b981', color: 'white', padding: '12px 24px', borderRadius: '12px', fontWeight: 600, cursor: 'pointer', border: 'none', width: 'fit-content' }}>
                                        <Save size={18} />
                                        Save Printer Settings
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>
            )}

            {/* Local Network & Staff Connection Card */}
            {isOwner && (
                <div style={{ width: '100%' }}>
                    <div 
                        onClick={() => setShowNetworkConfig(!showNetworkConfig)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showNetworkConfig ? '12px' : '0', cursor: 'pointer', backgroundColor: 'var(--bg-card)', padding: '14px 20px', borderRadius: '12px', border: '1px solid var(--border-rgba-05)', transition: 'all 0.2s' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <Globe size={22} style={{ color: '#0ea5e9' }} />
                            <h2 style={{fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Local Network & Staff Connection</h2>
                        </div>
                        <ChevronDown 
                            size={20} 
                            style={{ 
                                color: 'var(--text-muted)', 
                                transform: showNetworkConfig ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform 0.3s ease'
                            }} 
                        />
                    </div>
                    {showNetworkConfig && (
                        <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-rgba-05)' }}>
                            <form onSubmit={handlePrinterConfigSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '24px', alignItems: 'start' }}>
                                    {/* Left Column: IP dropdown */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0, lineHeight: '1.6' }}>
                                            Select the LAN IP address of this computer. Guests on your hotel Wi-Fi scan the room QR codes to open the guest ordering app. 
                                            Waiters can also scan the staff QR code on the right to access the login page directly from their mobile phones.
                                        </p>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>GUEST PORTAL LOCAL IP</label>
                                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                                <select 
                                                    value={selectedGuestIp} 
                                                    onChange={e => setSelectedGuestIp(e.target.value)}
                                                    style={{width: '100%', padding: '10px 14px', paddingRight: '40px', borderRadius: '8px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 600, appearance: 'none', outline: 'none' }}
                                                >
                                                    <option value="">-- Select Active Local IP (Autodetect) --</option>
                                                    {availableIps.map(ip => (
                                                        <option key={ip} value={ip}>{ip}</option>
                                                    ))}
                                                </select>
                                                <ChevronDown size={18} style={{ position: 'absolute', right: '14px', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                                            </div>
                                            {selectedGuestIp && (
                                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500, marginBottom: '4px' }}>
                                                    Target URL: <strong style={{ color: '#0ea5e9' }}>http://{selectedGuestIp}:5000/#/guest/order/{user?.hotel_id || '1'}</strong>
                                                </span>
                                            )}
                                            <button type="submit" style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#0ea5e9', color: 'white', padding: '12px 24px', borderRadius: '12px', fontWeight: 600, cursor: 'pointer', border: 'none', width: 'fit-content', marginTop: '8px' }}>
                                                <Save size={18} />
                                                Save Configurations
                                            </button>
                                        </div>
                                    </div>

                                    {/* Right Column: Waiter Login QR Code */}
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '16px', borderRadius: '12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--bg-border)', textAlign: 'center' }}>
                                        <div style={{ backgroundColor: 'var(--text-primary)', padding: '12px', borderRadius: '12px', display: 'inline-block' }}>
                                            <QRCodeCanvas 
                                                id="staff-login-qr"
                                                value={`http://${selectedGuestIp || '127.0.0.1'}:5000`}
                                                size={120}
                                                level="H"
                                                includeMargin={false}
                                            />
                                        </div>
                                        <div>
                                            <h4 style={{fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>Staff Login QR</h4>
                                            <p style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 500, margin: 0 }}>Scan to login from waiter phone/tablet</p>
                                        </div>
                                        <button 
                                            type="button"
                                            onClick={() => {
                                                const canvas = document.getElementById('staff-login-qr');
                                                if (!canvas) return;
                                                const url = canvas.toDataURL('image/png');
                                                const link = document.createElement('a');
                                                link.download = `Staff_Login_QR.png`;
                                                link.href = url;
                                                link.click();
                                                toast.success('Staff Login QR Downloaded');
                                            }}
                                            style={{width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: 'var(--bg-border)', border: '1px solid #334155', color: 'var(--text-primary)', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                                        >
                                            <Download size={16} /> Download Staff QR
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </div>
                    )}
                </div>
            )}
            {/* Staff Section */}
            {isOwner && kotEnabled && (
                <div style={{ width: '100%' }}>
                    <div 
                        onClick={() => setShowStaffSection(!showStaffSection)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showStaffSection ? '12px' : '0', cursor: 'pointer', backgroundColor: 'var(--bg-card)', padding: '14px 20px', borderRadius: '12px', border: '1px solid var(--border-rgba-05)', transition: 'all 0.2s' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <Users size={22} style={{ color: '#f59e0b' }} />
                            <h2 style={{fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Add New Staff</h2>
                        </div>
                        <ChevronDown 
                            size={20} 
                            style={{ 
                                color: 'var(--text-muted)', 
                                transform: showStaffSection ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform 0.3s ease'
                            }} 
                        />
                    </div>
                    
                    {showStaffSection && (
                        <div className="responsive-grid-12" style={{ gap: '24px', backgroundColor: 'var(--bg-card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-rgba-05)' }}>
                            <div style={{ gridColumn: 'span 5', backgroundColor: 'var(--bg-base)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-rgba-05)' }}>
                                <h3 style={{fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>Hire New Staff</h3>
                                <form onSubmit={handleHiring} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <input required placeholder="Staff Name" value={staffForm.name} onChange={e => setStaffForm({...staffForm, name: e.target.value})} style={{padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)' }} />
                                    <input required type="email" placeholder="Login Email" value={staffForm.email} onChange={e => setStaffForm({...staffForm, email: e.target.value})} style={{padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)' }} />
                                    <input required type="password" placeholder="Initial Passcode" value={staffForm.password} onChange={e => setStaffForm({...staffForm, password: e.target.value})} style={{padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)' }} />
                                    <button type="submit" disabled={hiring} style={{ backgroundColor: '#f59e0b', color: 'white', padding: '12px', borderRadius: '12px', fontWeight: 600, cursor: 'pointer', border: 'none' }}>Onboard Staff</button>
                                </form>
                            </div>
                            <div style={{ gridColumn: 'span 7', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {staff.length === 0 ? (
                                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', backgroundColor: 'var(--bg-base)', borderRadius: '12px', border: '2px dashed var(--bg-border)' }}>No active waitstaff protocol</div>
                                ) : (
                                    staff.map(s => (
                                        <div key={s.id} style={{ padding: '12px 16px', backgroundColor: 'var(--bg-base)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid rgba(255,255,255,0.03)' }}>
                                            <div>
                                                <div style={{color: 'var(--text-primary)', fontWeight: 600, fontSize: '15px' }}>{s.name}</div>
                                                <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{s.email}</div>
                                            </div>
                                            <button onClick={() => removeStaff(s.id)} style={{ color: '#f43f5e', padding: '12px', background: 'none', border: 'none', cursor: 'pointer' }}><Trash2 size={24} /></button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Daily Email Reports Settings Card */}
            {isOwner && emailReportModuleEnabled && (
                <div style={{ width: '100%' }}>
                    <div 
                        onClick={() => setShowEmailReportSection(!showEmailReportSection)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showEmailReportSection ? '12px' : '0', cursor: 'pointer', backgroundColor: 'var(--bg-card)', padding: '14px 20px', borderRadius: '12px', border: '1px solid var(--border-rgba-05)', transition: 'all 0.2s' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <Mail size={22} style={{ color: '#0ea5e9' }} />
                            <h2 style={{fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Daily Email Reports</h2>
                        </div>
                        <ChevronDown 
                            size={20} 
                            style={{ 
                                color: 'var(--text-muted)', 
                                transform: showEmailReportSection ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform 0.3s ease'
                            }} 
                        />
                    </div>
                    {showEmailReportSection && (
                        <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-rgba-05)' }}>
                            <form onSubmit={handleEmailReportConfigSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                
                                {/* Enable Toggle & Basic Settings */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', padding: '16px', borderRadius: '12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--bg-border)' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <label style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                            <input 
                                                type="checkbox"
                                                checked={emailReportConfig.emailReportEnabled}
                                                onChange={e => setEmailReportConfig({ ...emailReportConfig, emailReportEnabled: e.target.checked })}
                                                style={{ width: '18px', height: '18px', accentColor: '#0ea5e9', cursor: 'pointer' }}
                                            />
                                            Enable Daily Sales Reports
                                        </label>
                                        <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: 0 }}>
                                            When enabled, reports will be compiled and sent in the background at the specified time.
                                        </p>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>RECIPIENT EMAIL ADDRESS</label>
                                        <input 
                                            required={emailReportConfig.emailReportEnabled}
                                            type="email"
                                            value={emailReportConfig.emailReportRecipient} 
                                            onChange={e => setEmailReportConfig({ ...emailReportConfig, emailReportRecipient: e.target.value })} 
                                            placeholder="owner@example.com"
                                            style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 500 }} 
                                        />
                                        <p style={{ color: 'var(--text-muted)', fontSize: '11px', margin: 0 }}>The owner email where report PDFs will be sent.</p>
                                    </div>
                                </div>

                                {/* Conditionally render SMTP details only if email reports are toggled to be enabled */}
                                {emailReportConfig.emailReportEnabled && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                        
                                        {/* Time & Frequency */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>REPORT TIME</label>
                                                <input 
                                                    type="time" 
                                                    value={emailReportConfig.emailReportTime} 
                                                    onChange={e => setEmailReportConfig({ ...emailReportConfig, emailReportTime: e.target.value })} 
                                                    style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 600 }}
                                                />
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>REPORT FREQUENCY</label>
                                                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                                    <select 
                                                        value={emailReportConfig.emailReportFrequency} 
                                                        onChange={e => setEmailReportConfig({ ...emailReportConfig, emailReportFrequency: e.target.value })}
                                                        style={{ width: '100%', padding: '10px 14px', paddingRight: '40px', borderRadius: '8px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 600, appearance: 'none', outline: 'none' }}
                                                    >
                                                        <option value="daily">Daily Sales Report</option>
                                                        <option value="weekly">Weekly Sales Report (Last 7 Days)</option>
                                                        <option value="monthly">Monthly Sales Report (Last 30 Days)</option>
                                                    </select>
                                                    <ChevronDown size={18} style={{ position: 'absolute', right: '14px', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                                                </div>
                                            </div>
                                        </div>

                                        {/* SMTP Server Configuration */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px', borderRadius: '12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--bg-border)' }}>
                                            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#0ea5e9' }}></span>
                                                Sender Email Server Settings (SMTP)
                                            </h3>

                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>EMAIL SERVICE PROVIDER</label>
                                                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                                        <select 
                                                            value={emailReportConfig.emailReportProvider} 
                                                            onChange={e => {
                                                                const val = e.target.value;
                                                                setEmailReportConfig({
                                                                    ...emailReportConfig,
                                                                    emailReportProvider: val,
                                                                    emailReportSmtpHost: val === 'gmail' ? 'smtp.gmail.com' : '',
                                                                    emailReportSmtpPort: val === 'gmail' ? 465 : 587,
                                                                    emailReportSmtpSecure: val === 'gmail'
                                                                });
                                                            }}
                                                            style={{ width: '100%', padding: '10px 14px', paddingRight: '40px', borderRadius: '8px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 600, appearance: 'none', outline: 'none' }}
                                                        >
                                                            <option value="gmail">Gmail (Easy Setup)</option>
                                                            <option value="custom">Custom SMTP Server (Advanced)</option>
                                                        </select>
                                                        <ChevronDown size={18} style={{ position: 'absolute', right: '14px', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>SENDER EMAIL ADDRESS</label>
                                                    <input 
                                                        required
                                                        type="email"
                                                        value={emailReportConfig.emailReportSender} 
                                                        onChange={e => setEmailReportConfig({ ...emailReportConfig, emailReportSender: e.target.value })} 
                                                        placeholder="e.g. billing-system@gmail.com"
                                                        style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 500 }} 
                                                    />
                                                </div>
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', alignItems: 'start' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>
                                                        {emailReportConfig.emailReportProvider === 'gmail' ? 'GMAIL APP PASSWORD' : 'SMTP PASSWORD'}
                                                    </label>
                                                    <input 
                                                        required
                                                        type="password"
                                                        value={emailReportConfig.emailReportPassword} 
                                                        onChange={e => setEmailReportConfig({ ...emailReportConfig, emailReportPassword: e.target.value })} 
                                                        placeholder={emailReportConfig.emailReportProvider === 'gmail' ? "16-digit App Password" : "Email password"}
                                                        style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 500 }} 
                                                    />
                                                    {emailReportConfig.emailReportProvider === 'gmail' && (
                                                        <p style={{ color: 'var(--text-muted)', fontSize: '10px', margin: '4px 0 0 0', lineHeight: '1.4' }}>
                                                            💡 Gmail accounts require generating a 16-character <b>App Password</b> from Google Account settings. Standard passwords will be blocked.
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            {emailReportConfig.emailReportProvider === 'custom' && (
                                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '16px', marginTop: '8px' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                        <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>SMTP HOST</label>
                                                        <input 
                                                            required
                                                            value={emailReportConfig.emailReportSmtpHost} 
                                                            onChange={e => setEmailReportConfig({ ...emailReportConfig, emailReportSmtpHost: e.target.value })} 
                                                            placeholder="smtp.example.com"
                                                            style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 500 }} 
                                                        />
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                        <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>PORT</label>
                                                        <input 
                                                            required
                                                            type="number"
                                                            value={emailReportConfig.emailReportSmtpPort} 
                                                            onChange={e => setEmailReportConfig({ ...emailReportConfig, emailReportSmtpPort: parseInt(e.target.value) || 587 })} 
                                                            placeholder="587"
                                                            style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 500 }} 
                                                        />
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', height: '100%', justifyContent: 'center' }}>
                                                        <label style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '14px' }}>
                                                            <input 
                                                                type="checkbox"
                                                                checked={emailReportConfig.emailReportSmtpSecure}
                                                                onChange={e => setEmailReportConfig({ ...emailReportConfig, emailReportSmtpSecure: e.target.checked })}
                                                                style={{ accentColor: '#0ea5e9' }}
                                                            />
                                                            SSL Secure
                                                        </label>
                                                    </div>
                                                </div>
                                            )}

                                        </div>

                                        {/* Test SMTP connection button */}
                                        <button 
                                            type="button"
                                            disabled={testingEmailReport}
                                            onClick={handleTestEmailConnection}
                                            style={{ width: 'fit-content', alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'var(--bg-border)', border: '1px solid #334155', color: 'var(--text-primary)', padding: '10px 18px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                                        >
                                            <Globe size={16} style={{ color: '#10b981' }} />
                                            {testingEmailReport ? 'Verifying...' : 'Test Connection & Send Test Email'}
                                        </button>
                                    </div>
                                )}

                                <button type="submit" style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#0ea5e9', color: 'white', padding: '12px 24px', borderRadius: '12px', fontWeight: 600, cursor: 'pointer', border: 'none', width: 'fit-content' }}>
                                    <Save size={18} />
                                    Save Report Settings
                                </button>
                            </form>
                        </div>
                    )}
                </div>
            )}

            {/* System Add-ons Section */}
            {isOwner && (
                <div style={{ width: '100%' }}>
                    <div 
                        onClick={() => setShowModules(!showModules)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showModules ? '12px' : '0', cursor: 'pointer', backgroundColor: 'var(--bg-card)', padding: '14px 20px', borderRadius: '12px', border: '1px solid var(--border-rgba-05)', transition: 'all 0.2s' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <ShieldCheck size={22} style={{ color: '#f43f5e' }} />
                            <h2 style={{fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>System Modules & Licensing</h2>
                        </div>
                        <ChevronDown 
                            size={20} 
                            style={{ 
                                color: 'var(--text-muted)', 
                                transform: showModules ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform 0.3s ease'
                            }} 
                        />
                    </div>
                    {showModules && (
                        <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-rgba-05)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {/* Online Sync Module */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '650px' }}>
                                    <h3 style={{fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Online Analytics Sync (Cloud Reporting)</h3>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0, lineHeight: '1.6', marginTop: '4px' }}>
                                        Enable cloud syncing to view your real-time analytics on the BestBill Admin mobile application.
                                        Requires an owner passcode to configure.
                                    </p>
                                </div>
                                
                                {/* Toggle / Radio Control */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', backgroundColor: 'var(--bg-base)', padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--bg-border)' }}>
                                    <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500, fontSize: '14px' }}>
                                        <input 
                                            type="radio" 
                                            name="cloudSyncModule"
                                            checked={!cloudSyncEnabled} 
                                            onChange={() => {
                                                if (cloudSyncEnabled) handleToggleCloudSync(false);
                                            }}
                                            style={{ accentColor: '#f43f5e', width: '18px', height: '18px', cursor: 'pointer' }}
                                        />
                                        Disabled
                                    </label>
                                    <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500, fontSize: '14px' }}>
                                        <input 
                                            type="radio" 
                                            name="cloudSyncModule"
                                            checked={cloudSyncEnabled} 
                                            onChange={() => handleToggleCloudSync(true)}
                                            style={{ accentColor: '#10b981', width: '18px', height: '18px', cursor: 'pointer' }}
                                        />
                                        Enabled
                                    </label>
                                </div>
                            </div>
                            <div style={{ width: '100%', height: '1px', backgroundColor: 'var(--border-rgba-05)' }}></div>
                            {/* Lodging Module */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '650px' }}>
                                <h3 style={{fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Lodging & Room Management</h3>
                                <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0, lineHeight: '1.6', marginTop: '4px' }}>
                                    Enable room configurations, lodging layouts, and guest digital room-service ordering portals. 
                                    This module requires a premium license passcode to unlock.
                                </p>
                            </div>
                            
                            {/* Toggle / Radio Control */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', backgroundColor: 'var(--bg-base)', padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--bg-border)' }}>
                                <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500, fontSize: '14px' }}>
                                    <input 
                                        type="radio" 
                                        name="lodgingModule"
                                        checked={!lodgingEnabled} 
                                        onChange={() => handleToggleLodging(false)}
                                        style={{ accentColor: '#f43f5e', width: '18px', height: '18px', cursor: 'pointer' }}
                                    />
                                    Disabled
                                </label>
                                <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500, fontSize: '14px' }}>
                                    <input 
                                        type="radio" 
                                        name="lodgingModule"
                                        checked={lodgingEnabled} 
                                        onChange={() => handleToggleLodging(true)}
                                        style={{ accentColor: '#10b981', width: '18px', height: '18px', cursor: 'pointer' }}
                                    />
                                    Enabled
                                </label>
                            </div>
                        </div>

                        {/* KOT Module */}
                        <div style={{ width: '100%', height: '1px', backgroundColor: 'var(--border-rgba-05)' }}></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '650px' }}>
                                <h3 style={{fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Kitchen Order Ticket (KOT)</h3>
                                <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0, lineHeight: '1.6', marginTop: '4px' }}>
                                    Enable kitchen routing, chef KOT dashboard, and waitstaff onboarding for order taking. 
                                    This module requires a premium license passcode to unlock.
                                </p>
                            </div>
                            
                            {/* Toggle / Radio Control */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', backgroundColor: 'var(--bg-base)', padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--bg-border)' }}>
                                <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500, fontSize: '14px' }}>
                                    <input 
                                        type="radio" 
                                        name="kotModule"
                                        checked={!kotEnabled} 
                                        onChange={() => handleToggleKot(false)}
                                        style={{ accentColor: '#f43f5e', width: '18px', height: '18px', cursor: 'pointer' }}
                                    />
                                    Disabled
                                </label>
                                <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500, fontSize: '14px' }}>
                                    <input 
                                        type="radio" 
                                        name="kotModule"
                                        checked={kotEnabled} 
                                        onChange={() => handleToggleKot(true)}
                                        style={{ accentColor: '#10b981', width: '18px', height: '18px', cursor: 'pointer' }}
                                    />
                                    Enabled
                                </label>
                            </div>
                        </div>

                        {/* WhatsApp Billing Module */}
                        <div style={{ width: '100%', height: '1px', backgroundColor: 'var(--border-rgba-05)' }}></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '650px' }}>
                                <h3 style={{fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>WhatsApp Billing</h3>
                                <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0, lineHeight: '1.6', marginTop: '4px' }}>
                                    Enable customer mobile entry and direct bill sharing via WhatsApp.
                                    This module requires a passcode to unlock.
                                </p>
                            </div>
                            
                            {/* Toggle / Radio Control */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', backgroundColor: 'var(--bg-base)', padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--bg-border)' }}>
                                <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500, fontSize: '14px' }}>
                                    <input 
                                        type="radio" 
                                        name="whatsAppBillingModule"
                                        checked={!whatsAppBillingEnabled} 
                                        onChange={() => handleToggleWhatsAppBilling(false)}
                                        style={{ accentColor: '#f43f5e', width: '18px', height: '18px', cursor: 'pointer' }}
                                    />
                                    Disabled
                                </label>
                                <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500, fontSize: '14px' }}>
                                    <input 
                                        type="radio" 
                                        name="whatsAppBillingModule"
                                        checked={whatsAppBillingEnabled} 
                                        onChange={() => handleToggleWhatsAppBilling(true)}
                                        style={{ accentColor: '#10b981', width: '18px', height: '18px', cursor: 'pointer' }}
                                    />
                                    Enabled
                                </label>
                            </div>
                        </div>

                        {/* Inventory Management Module */}
                        <div style={{ width: '100%', height: '1px', backgroundColor: 'var(--border-rgba-05)' }}></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '650px' }}>
                                <h3 style={{fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Inventory Management</h3>
                                <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0, lineHeight: '1.6', marginTop: '4px' }}>
                                    Enable recipe mappings, stock transaction tracking, purchase logs, and ledger reports.
                                    This module requires a passcode to unlock.
                                </p>
                            </div>
                            
                            {/* Toggle / Radio Control */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', backgroundColor: 'var(--bg-base)', padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--bg-border)' }}>
                                <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500, fontSize: '14px' }}>
                                    <input 
                                        type="radio" 
                                        name="inventoryModule"
                                        checked={!inventoryEnabled} 
                                        onChange={() => handleToggleInventory(false)}
                                        style={{ accentColor: '#f43f5e', width: '18px', height: '18px', cursor: 'pointer' }}
                                    />
                                    Disabled
                                </label>
                                <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500, fontSize: '14px' }}>
                                    <input 
                                        type="radio" 
                                        name="inventoryModule"
                                        checked={inventoryEnabled} 
                                        onChange={() => handleToggleInventory(true)}
                                        style={{ accentColor: '#10b981', width: '18px', height: '18px', cursor: 'pointer' }}
                                    />
                                    Enabled
                                </label>
                            </div>
                        </div>

                        {/* Token Counter Module */}
                        <div style={{ width: '100%', height: '1px', backgroundColor: 'var(--border-rgba-05)' }}></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '650px' }}>
                                <h3 style={{fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Token Counter</h3>
                                <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0, lineHeight: '1.6', marginTop: '4px' }}>
                                    Enable token counters on the dashboard. Receipts printed from token counters will only print items list and grand totals.
                                    This module requires a passcode to unlock.
                                </p>
                            </div>
                            
                            {/* Toggle / Radio Control */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', backgroundColor: 'var(--bg-base)', padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--bg-border)' }}>
                                <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500, fontSize: '14px' }}>
                                    <input 
                                        type="radio" 
                                        name="tokenCounterModule"
                                        checked={!tokenCounterEnabled} 
                                        onChange={() => handleToggleTokenCounter(false)}
                                        style={{ accentColor: '#f43f5e', width: '18px', height: '18px', cursor: 'pointer' }}
                                    />
                                    Disabled
                                </label>
                                <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500, fontSize: '14px' }}>
                                    <input 
                                        type="radio" 
                                        name="tokenCounterModule"
                                        checked={tokenCounterEnabled} 
                                        onChange={() => handleToggleTokenCounter(true)}
                                        style={{ accentColor: '#10b981', width: '18px', height: '18px', cursor: 'pointer' }}
                                    />
                                    Enabled
                                </label>
                            </div>
                        </div>

                        {/* Simple KOT Module */}
                        <div style={{ width: '100%', height: '1px', backgroundColor: 'var(--border-rgba-05)' }}></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '650px' }}>
                                <h3 style={{fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Simple KOT (Send to Kitchen)</h3>
                                <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0, lineHeight: '1.6', marginTop: '4px' }}>
                                    When enabled, allows owners to send orders to the kitchen printer directly from regular tables, just like waiters.
                                    This module requires a passcode to unlock.
                                </p>
                            </div>
                            
                            {/* Toggle / Radio Control */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', backgroundColor: 'var(--bg-base)', padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--bg-border)' }}>
                                <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500, fontSize: '14px' }}>
                                    <input 
                                        type="radio" 
                                        name="simpleKotModule"
                                        checked={!simpleKotEnabled} 
                                        onChange={() => handleToggleSimpleKot(false)}
                                        style={{ accentColor: '#f43f5e', width: '18px', height: '18px', cursor: 'pointer' }}
                                    />
                                    Disabled
                                </label>
                                <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500, fontSize: '14px' }}>
                                    <input 
                                        type="radio" 
                                        name="simpleKotModule"
                                        checked={simpleKotEnabled} 
                                        onChange={() => handleToggleSimpleKot(true)}
                                        style={{ accentColor: '#10b981', width: '18px', height: '18px', cursor: 'pointer' }}
                                    />
                                    Enabled
                                </label>
                            </div>
                        </div>

                        {/* Automated Email Reports Module */}
                        <div style={{ width: '100%', height: '1px', backgroundColor: 'var(--border-rgba-05)' }}></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '650px' }}>
                                <h3 style={{fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Automated Email Reports</h3>
                                <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0, lineHeight: '1.6', marginTop: '4px' }}>
                                    Automatically compile sales statistics into a premium PDF report and email it in the background at your scheduled time.
                                    This module requires a passcode to unlock.
                                </p>
                            </div>
                            
                            {/* Toggle / Radio Control */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', backgroundColor: 'var(--bg-base)', padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--bg-border)' }}>
                                <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500, fontSize: '14px' }}>
                                    <input 
                                        type="radio" 
                                        name="emailReportModule"
                                        checked={!emailReportModuleEnabled} 
                                        onChange={() => handleToggleEmailReport(false)}
                                        style={{ accentColor: '#f43f5e', width: '18px', height: '18px', cursor: 'pointer' }}
                                    />
                                    Disabled
                                </label>
                                <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500, fontSize: '14px' }}>
                                    <input 
                                        type="radio" 
                                        name="emailReportModule"
                                        checked={emailReportModuleEnabled} 
                                        onChange={() => handleToggleEmailReport(true)}
                                        style={{ accentColor: '#10b981', width: '18px', height: '18px', cursor: 'pointer' }}
                                    />
                                    Enabled
                                </label>
                            </div>
                        </div>

                        {/* Update License Key Feature */}
                        <div style={{ width: '100%', height: '1px', backgroundColor: 'var(--border-rgba-05)' }}></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '650px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <KeyRound size={18} style={{ color: '#0ea5e9' }} />
                                    <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Update License Key</h3>
                                    {subscriptionInfo?.hasQueuedLicense && (
                                        <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                                            Next Plan Queued ({subscriptionInfo.queuedType?.toUpperCase()})
                                        </span>
                                    )}
                                </div>
                                <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0, lineHeight: '1.6', marginTop: '4px' }}>
                                    Pre-schedule or upgrade your subscription before your current plan expires. 
                                    New plans are safely queued and will automatically activate when your existing plan ends. Requires vendor security passcode to access.
                                </p>
                            </div>
                            
                            <button
                                type="button"
                                onClick={() => {
                                    setLicensePasscode('');
                                    setShowUpdateLicensePasscodeModal(true);
                                }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    backgroundColor: '#0ea5e9',
                                    color: '#ffffff',
                                    padding: '10px 20px',
                                    borderRadius: '10px',
                                    fontWeight: 600,
                                    fontSize: '14px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 14px rgba(14, 165, 233, 0.3)',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                <KeyRound size={16} />
                                Update License Key
                            </button>
                        </div>

                    </div>
                )}
            </div>
        )}

            <div style={{ textAlign: 'center', marginTop: '24px' }}>
                 <p style={{ color: 'var(--text-muted)', fontSize: '12px', fontWeight: 500 }}>BestBill Identity Protection — Secure Role-Based Access Control Active</p>
            </div>

            {/* Lodging Activation Modal */}
            {showLodgingModal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={() => setShowLodgingModal(false)}>
                    <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '24px', padding: '36px', border: '1px solid var(--bg-border)', width: '100%', maxWidth: '440px', display: 'flex', flexDirection: 'column', gap: '20px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <ShieldCheck size={28} style={{ color: lodgingModalMode === 'enable' ? '#10b981' : '#f43f5e' }} />
                            <h3 style={{fontSize: '18px', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>
                                {lodgingModalMode === 'enable' ? 'Activate Lodging Module' : 'Deactivate Lodging Module'}
                            </h3>
                        </div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '13px', fontWeight: 600, margin: 0, lineHeight: '1.6' }}>
                            {lodgingModalMode === 'enable'
                                ? 'Enter the Premium Activation License Password to unlock Lodging & Room Management.'
                                : 'Are you sure you want to deactivate Lodging & Room Management? Please enter the license password to confirm deactivation. Rooms and guest portals will be hidden.'
                            }
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 900 }}>
                                {lodgingModalMode === 'enable' ? 'ACTIVATION PASSWORD' : 'DEACTIVATION PASSWORD'}
                            </label>
                            <input
                                type="password"
                                value={lodgingPassword}
                                onChange={e => setLodgingPassword(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleLodgingModalSubmit()}
                                placeholder={lodgingModalMode === 'enable' ? "Enter activation password" : "Enter deactivation password"}
                                autoFocus
                                style={{padding: '14px', borderRadius: '12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 700, outline: 'none', fontSize: '15px' }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                            <button
                                onClick={() => setShowLodgingModal(false)}
                                style={{ flex: 1, padding: '14px', borderRadius: '14px', backgroundColor: 'var(--bg-border)', color: 'var(--text-secondary)', fontWeight: 800, border: 'none', cursor: 'pointer', fontSize: '14px' }}
                            >Cancel</button>
                            <button
                                onClick={handleLodgingModalSubmit}
                                style={{flex: 1, padding: '14px', borderRadius: '14px', backgroundColor: lodgingModalMode === 'enable' ? '#10b981' : '#f43f5e', color: 'var(--text-primary)', fontWeight: 900, border: 'none', cursor: 'pointer', fontSize: '14px', boxShadow: lodgingModalMode === 'enable' ? '0 8px 20px rgba(16,185,129,0.3)' : '0 8px 20px rgba(244,63,94,0.3)' }}
                            >{lodgingModalMode === 'enable' ? 'Unlock & Activate' : 'Confirm Deactivate'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* KOT Activation Modal */}
            {showKotModal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={() => setShowKotModal(false)}>
                    <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '24px', padding: '36px', border: '1px solid var(--bg-border)', width: '100%', maxWidth: '440px', display: 'flex', flexDirection: 'column', gap: '20px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <ShieldCheck size={28} style={{ color: kotModalMode === 'enable' ? '#10b981' : '#f43f5e' }} />
                            <h3 style={{fontSize: '18px', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>
                                {kotModalMode === 'enable' ? 'Activate KOT Module' : 'Deactivate KOT Module'}
                            </h3>
                        </div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '13px', fontWeight: 600, margin: 0, lineHeight: '1.6' }}>
                            {kotModalMode === 'enable'
                                ? 'Enter the Premium Activation License Password to unlock Kitchen Order Tickets and Waitstaff routing.'
                                : 'Are you sure you want to deactivate the KOT Module? Please enter the license password to confirm deactivation. Kitchen printing and waitstaff functions will be disabled.'
                            }
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 900 }}>
                                {kotModalMode === 'enable' ? 'ACTIVATION PASSWORD' : 'DEACTIVATION PASSWORD'}
                            </label>
                            <input
                                type="password"
                                value={kotPassword}
                                onChange={e => setKotPassword(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleKotModalSubmit()}
                                placeholder={kotModalMode === 'enable' ? "Enter activation password" : "Enter deactivation password"}
                                autoFocus
                                style={{padding: '14px', borderRadius: '12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 700, outline: 'none', fontSize: '15px' }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                            <button
                                onClick={() => setShowKotModal(false)}
                                style={{ flex: 1, padding: '14px', borderRadius: '14px', backgroundColor: 'var(--bg-border)', color: 'var(--text-secondary)', fontWeight: 800, border: 'none', cursor: 'pointer', fontSize: '14px' }}
                            >Cancel</button>
                            <button
                                onClick={handleKotModalSubmit}
                                style={{flex: 1, padding: '14px', borderRadius: '14px', backgroundColor: kotModalMode === 'enable' ? '#10b981' : '#f43f5e', color: 'var(--text-primary)', fontWeight: 900, border: 'none', cursor: 'pointer', fontSize: '14px', boxShadow: kotModalMode === 'enable' ? '0 8px 20px rgba(16,185,129,0.3)' : '0 8px 20px rgba(244,63,94,0.3)' }}
                            >{kotModalMode === 'enable' ? 'Unlock & Activate' : 'Confirm Deactivate'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* WhatsApp Billing Activation Modal */}
            {showWhatsAppBillingModal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={() => setShowWhatsAppBillingModal(false)}>
                    <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '24px', padding: '36px', border: '1px solid var(--bg-border)', width: '100%', maxWidth: '440px', display: 'flex', flexDirection: 'column', gap: '20px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <ShieldCheck size={28} style={{ color: whatsAppBillingModalMode === 'enable' ? '#10b981' : '#f43f5e' }} />
                            <h3 style={{fontSize: '18px', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>
                                {whatsAppBillingModalMode === 'enable' ? 'Activate WhatsApp Billing' : 'Deactivate WhatsApp Billing'}
                            </h3>
                        </div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '13px', fontWeight: 600, margin: 0, lineHeight: '1.6' }}>
                            {whatsAppBillingModalMode === 'enable'
                                ? 'Enter the license passcode to unlock and enable WhatsApp Billing.'
                                : 'Are you sure you want to deactivate WhatsApp Billing? Please enter the passcode to confirm deactivation.'
                            }
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 900 }}>
                                {whatsAppBillingModalMode === 'enable' ? 'ACTIVATION PASSWORD' : 'DEACTIVATION PASSWORD'}
                            </label>
                            <input
                                type="password"
                                value={whatsAppBillingPassword}
                                onChange={e => setWhatsAppBillingPassword(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleWhatsAppBillingModalSubmit()}
                                placeholder={whatsAppBillingModalMode === 'enable' ? "Enter passcode" : "Enter passcode"}
                                autoFocus
                                style={{padding: '14px', borderRadius: '12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 700, outline: 'none', fontSize: '15px' }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                            <button
                                onClick={() => setShowWhatsAppBillingModal(false)}
                                style={{ flex: 1, padding: '14px', borderRadius: '14px', backgroundColor: 'var(--bg-border)', color: 'var(--text-secondary)', fontWeight: 800, border: 'none', cursor: 'pointer', fontSize: '14px' }}
                            >Cancel</button>
                            <button
                                onClick={handleWhatsAppBillingModalSubmit}
                                style={{flex: 1, padding: '14px', borderRadius: '14px', backgroundColor: whatsAppBillingModalMode === 'enable' ? '#10b981' : '#f43f5e', color: 'var(--text-primary)', fontWeight: 900, border: 'none', cursor: 'pointer', fontSize: '14px', boxShadow: whatsAppBillingModalMode === 'enable' ? '0 8px 20px rgba(16,185,129,0.3)' : '0 8px 20px rgba(244,63,94,0.3)' }}
                            >{whatsAppBillingModalMode === 'enable' ? 'Unlock & Activate' : 'Confirm Deactivate'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Inventory Activation Modal */}
            {showInventoryModal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={() => setShowInventoryModal(false)}>
                    <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '24px', padding: '36px', border: '1px solid var(--bg-border)', width: '100%', maxWidth: '440px', display: 'flex', flexDirection: 'column', gap: '20px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <ShieldCheck size={28} style={{ color: inventoryModalMode === 'enable' ? '#10b981' : '#f43f5e' }} />
                            <h3 style={{fontSize: '18px', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>
                                {inventoryModalMode === 'enable' ? 'Activate Inventory Module' : 'Deactivate Inventory Module'}
                            </h3>
                        </div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '13px', fontWeight: 600, margin: 0, lineHeight: '1.6' }}>
                            {inventoryModalMode === 'enable'
                                ? 'Enter the license passcode to unlock and enable Inventory Management.'
                                : 'Are you sure you want to deactivate Inventory Management? Please enter the passcode to confirm deactivation.'
                            }
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 900 }}>
                                {inventoryModalMode === 'enable' ? 'ACTIVATION PASSWORD' : 'DEACTIVATION PASSWORD'}
                            </label>
                            <input
                                type="password"
                                value={inventoryPassword}
                                onChange={e => setInventoryPassword(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleInventoryModalSubmit()}
                                placeholder={inventoryModalMode === 'enable' ? "Enter passcode" : "Enter passcode"}
                                autoFocus
                                style={{padding: '14px', borderRadius: '12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 700, outline: 'none', fontSize: '15px' }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                            <button
                                onClick={() => setShowInventoryModal(false)}
                                style={{ flex: 1, padding: '14px', borderRadius: '14px', backgroundColor: 'var(--bg-border)', color: 'var(--text-secondary)', fontWeight: 800, border: 'none', cursor: 'pointer', fontSize: '14px' }}
                            >Cancel</button>
                            <button
                                onClick={handleInventoryModalSubmit}
                                style={{flex: 1, padding: '14px', borderRadius: '14px', backgroundColor: inventoryModalMode === 'enable' ? '#10b981' : '#f43f5e', color: 'var(--text-primary)', fontWeight: 900, border: 'none', cursor: 'pointer', fontSize: '14px', boxShadow: inventoryModalMode === 'enable' ? '0 8px 20px rgba(16,185,129,0.3)' : '0 8px 20px rgba(244,63,94,0.3)' }}
                            >{inventoryModalMode === 'enable' ? 'Unlock & Activate' : 'Confirm Deactivate'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Token Counter Activation Modal */}
            {showTokenCounterModal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={() => setShowTokenCounterModal(false)}>
                    <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '24px', padding: '36px', border: '1px solid var(--bg-border)', width: '100%', maxWidth: '440px', display: 'flex', flexDirection: 'column', gap: '20px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <ShieldCheck size={28} style={{ color: tokenCounterModalMode === 'enable' ? '#10b981' : '#f43f5e' }} />
                            <h3 style={{fontSize: '18px', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>
                                {tokenCounterModalMode === 'enable' ? 'Activate Token Counter Module' : 'Deactivate Token Counter Module'}
                            </h3>
                        </div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '13px', fontWeight: 600, margin: 0, lineHeight: '1.6' }}>
                            {tokenCounterModalMode === 'enable'
                                ? 'Enter the license passcode to unlock and enable Token Counter.'
                                : 'Are you sure you want to deactivate Token Counter? Please enter the passcode to confirm deactivation.'
                            }
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 900 }}>
                                {tokenCounterModalMode === 'enable' ? 'ACTIVATION PASSWORD' : 'DEACTIVATION PASSWORD'}
                            </label>
                            <input
                                type="password"
                                value={tokenCounterPassword}
                                onChange={e => setTokenCounterPassword(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleTokenCounterModalSubmit()}
                                placeholder={tokenCounterModalMode === 'enable' ? "Enter passcode" : "Enter passcode"}
                                autoFocus
                                style={{padding: '14px', borderRadius: '12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 700, outline: 'none', fontSize: '15px' }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                            <button
                                onClick={() => setShowTokenCounterModal(false)}
                                style={{ flex: 1, padding: '14px', borderRadius: '14px', backgroundColor: 'var(--bg-border)', color: 'var(--text-secondary)', fontWeight: 800, border: 'none', cursor: 'pointer', fontSize: '14px' }}
                            >Cancel</button>
                            <button
                                onClick={handleTokenCounterModalSubmit}
                                style={{flex: 1, padding: '14px', borderRadius: '14px', backgroundColor: tokenCounterModalMode === 'enable' ? '#10b981' : '#f43f5e', color: 'var(--text-primary)', fontWeight: 900, border: 'none', cursor: 'pointer', fontSize: '14px', boxShadow: tokenCounterModalMode === 'enable' ? '0 8px 20px rgba(16,185,129,0.3)' : '0 8px 20px rgba(244,63,94,0.3)' }}
                            >{tokenCounterModalMode === 'enable' ? 'Unlock & Activate' : 'Confirm Deactivate'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Simple KOT Activation Modal */}
            {showSimpleKotModal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={() => setShowSimpleKotModal(false)}>
                    <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '24px', padding: '36px', border: '1px solid var(--bg-border)', width: '100%', maxWidth: '440px', display: 'flex', flexDirection: 'column', gap: '20px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <ShieldCheck size={28} style={{ color: simpleKotModalMode === 'enable' ? '#10b981' : '#f43f5e' }} />
                            <h3 style={{fontSize: '18px', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>
                                {simpleKotModalMode === 'enable' ? 'Activate Simple KOT Module' : 'Deactivate Simple KOT Module'}
                            </h3>
                        </div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '13px', fontWeight: 600, margin: 0, lineHeight: '1.6' }}>
                            {simpleKotModalMode === 'enable'
                                ? 'Enter the license passcode to unlock and enable Simple KOT (Send to Kitchen).'
                                : 'Are you sure you want to deactivate Simple KOT? Please enter the passcode to confirm deactivation.'
                            }
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 900 }}>
                                {simpleKotModalMode === 'enable' ? 'ACTIVATION PASSWORD' : 'DEACTIVATION PASSWORD'}
                            </label>
                            <input
                                type="password"
                                value={simpleKotPassword}
                                onChange={e => setSimpleKotPassword(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSimpleKotModalSubmit()}
                                placeholder="Enter passcode"
                                autoFocus
                                style={{padding: '14px', borderRadius: '12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 700, outline: 'none', fontSize: '15px' }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                            <button
                                onClick={() => setShowSimpleKotModal(false)}
                                style={{ flex: 1, padding: '14px', borderRadius: '14px', backgroundColor: 'var(--bg-border)', color: 'var(--text-secondary)', fontWeight: 800, border: 'none', cursor: 'pointer', fontSize: '14px' }}
                            >Cancel</button>
                            <button
                                onClick={handleSimpleKotModalSubmit}
                                style={{flex: 1, padding: '14px', borderRadius: '14px', backgroundColor: simpleKotModalMode === 'enable' ? '#10b981' : '#f43f5e', color: 'var(--text-primary)', fontWeight: 900, border: 'none', cursor: 'pointer', fontSize: '14px', boxShadow: simpleKotModalMode === 'enable' ? '0 8px 20px rgba(16,185,129,0.3)' : '0 8px 20px rgba(244,63,94,0.3)' }}
                            >{simpleKotModalMode === 'enable' ? 'Unlock & Activate' : 'Confirm Deactivate'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Email Report Activation Modal */}
            {showEmailReportModal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={() => setShowEmailReportModal(false)}>
                    <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '24px', padding: '36px', border: '1px solid var(--bg-border)', width: '100%', maxWidth: '440px', display: 'flex', flexDirection: 'column', gap: '20px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <ShieldCheck size={28} style={{ color: emailReportModalMode === 'enable' ? '#10b981' : '#f43f5e' }} />
                            <h3 style={{fontSize: '18px', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>
                                {emailReportModalMode === 'enable' ? 'Activate Email Reports' : 'Deactivate Email Reports'}
                            </h3>
                        </div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '13px', fontWeight: 600, margin: 0, lineHeight: '1.6' }}>
                            {emailReportModalMode === 'enable'
                                ? 'Enter the license passcode to unlock and enable Automated Email Reports.'
                                : 'Are you sure you want to deactivate Automated Email Reports? Please enter the passcode to confirm.'
                            }
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 900 }}>
                                {emailReportModalMode === 'enable' ? 'ACTIVATION PASSWORD' : 'DEACTIVATION PASSWORD'}
                            </label>
                            <input
                                type="password"
                                value={emailReportPassword}
                                onChange={e => setEmailReportPassword(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleEmailReportModalSubmit()}
                                placeholder="Enter passcode"
                                autoFocus
                                style={{padding: '14px', borderRadius: '12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 700, outline: 'none', fontSize: '15px' }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                            <button
                                onClick={() => setShowEmailReportModal(false)}
                                style={{ flex: 1, padding: '14px', borderRadius: '14px', backgroundColor: 'var(--bg-border)', color: 'var(--text-secondary)', fontWeight: 800, border: 'none', cursor: 'pointer', fontSize: '14px' }}
                            >Cancel</button>
                            <button
                                onClick={handleEmailReportModalSubmit}
                                style={{flex: 1, padding: '14px', borderRadius: '14px', backgroundColor: emailReportModalMode === 'enable' ? '#10b981' : '#f43f5e', color: 'var(--text-primary)', fontWeight: 900, border: 'none', cursor: 'pointer', fontSize: '14px', boxShadow: emailReportModalMode === 'enable' ? '0 8px 20px rgba(16,185,129,0.3)' : '0 8px 20px rgba(244,63,94,0.3)' }}
                            >{emailReportModalMode === 'enable' ? 'Unlock & Activate' : 'Confirm Deactivate'}</button>
                        </div>
                    </div>
                </div>
            )}
            {/* Cloud Sync 2-Step Passcode & Credentials Modal */}
            {showCloudSyncModal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={() => setShowCloudSyncModal(false)}>
                    <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '24px', padding: '36px', border: '1px solid var(--bg-border)', width: '100%', maxWidth: '440px', display: 'flex', flexDirection: 'column', gap: '20px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <ShieldCheck size={28} style={{ color: cloudSyncModalMode === 'enable' ? '#10b981' : '#f43f5e' }} />
                            <h3 style={{fontSize: '18px', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>
                                {cloudSyncModalMode === 'disable' ? 'Disable Online Sync' : (cloudSyncModalStep === 1 ? 'Online Sync Passcode' : 'Mobile Admin Credentials')}
                            </h3>
                        </div>

                        {/* STEP 1: Passcode Verification */}
                        {cloudSyncModalStep === 1 && (
                            <form onSubmit={handleVerifyPasscodeStep} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <p style={{ color: 'var(--text-muted)', fontSize: '13px', fontWeight: 600, margin: 0, lineHeight: '1.6' }}>
                                    {cloudSyncModalMode === 'enable'
                                        ? 'Enter the owner security passcode to enable and configure Online Analytics Sync.'
                                        : 'Enter the owner security passcode to disable Online Analytics Sync.'
                                    }
                                </p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 900 }}>
                                        SECURITY PASSCODE
                                    </label>
                                    <input
                                        type="password"
                                        value={cloudSyncPassword}
                                        onChange={e => setCloudSyncPassword(e.target.value)}
                                        placeholder="Enter owner passcode"
                                        autoFocus
                                        style={{padding: '14px', borderRadius: '12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 700, outline: 'none', fontSize: '15px' }}
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setShowCloudSyncModal(false)}
                                        style={{ flex: 1, padding: '14px', borderRadius: '14px', backgroundColor: 'var(--bg-border)', color: 'var(--text-secondary)', fontWeight: 800, border: 'none', cursor: 'pointer', fontSize: '14px' }}
                                    >Cancel</button>
                                    <button
                                        type="submit"
                                        style={{flex: 1, padding: '14px', borderRadius: '14px', backgroundColor: cloudSyncModalMode === 'enable' ? '#10b981' : '#f43f5e', color: 'white', fontWeight: 900, border: 'none', cursor: 'pointer', fontSize: '14px', boxShadow: cloudSyncModalMode === 'enable' ? '0 8px 20px rgba(16,185,129,0.3)' : '0 8px 20px rgba(244,63,94,0.3)' }}
                                    >
                                        {cloudSyncModalMode === 'enable' ? 'Verify & Continue' : 'Confirm Disable'}
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* STEP 2: Configure Credentials (Only when enabling) */}
                        {cloudSyncModalStep === 2 && cloudSyncModalMode === 'enable' && (
                            <form onSubmit={handleSaveCloudCredentialsStep} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <p style={{ color: 'var(--text-muted)', fontSize: '13px', fontWeight: 600, margin: 0, lineHeight: '1.6' }}>
                                    Enter the owner account email and password you will use to log into the BestBill Admin mobile application.
                                </p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 900 }}>OWNER EMAIL</label>
                                    <input
                                        type="email"
                                        value={cloudSyncConfig.cloudSyncOwnerEmail}
                                        onChange={e => setCloudSyncConfig({ ...cloudSyncConfig, cloudSyncOwnerEmail: e.target.value })}
                                        placeholder="owner@bestbill.com"
                                        autoFocus
                                        style={{ padding: '12px 14px', borderRadius: '10px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 600, fontSize: '14px' }}
                                    />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 900 }}>OWNER PASSWORD</label>
                                    <input
                                        type="password"
                                        value={cloudSyncConfig.cloudSyncOwnerPassword}
                                        onChange={e => setCloudSyncConfig({ ...cloudSyncConfig, cloudSyncOwnerPassword: e.target.value })}
                                        placeholder={cloudSyncConfig.cloudSyncOwnerPasswordConfigured ? "Set new password or leave blank to keep existing" : "Password for mobile admin login"}
                                        style={{ padding: '12px 14px', borderRadius: '10px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontWeight: 600, fontSize: '14px' }}
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setCloudSyncModalStep(1)}
                                        style={{ flex: 1, padding: '14px', borderRadius: '14px', backgroundColor: 'var(--bg-border)', color: 'var(--text-secondary)', fontWeight: 800, border: 'none', cursor: 'pointer', fontSize: '14px' }}
                                    >Back</button>
                                    <button
                                        type="submit"
                                        style={{ flex: 1.5, padding: '14px', borderRadius: '14px', backgroundColor: '#10b981', color: 'white', fontWeight: 900, border: 'none', cursor: 'pointer', fontSize: '14px', boxShadow: '0 8px 20px rgba(16,185,129,0.3)' }}
                                    >
                                        Activate & Sync
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* License Update Passcode Verification Modal (592244) */}
            {showUpdateLicensePasscodeModal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={() => setShowUpdateLicensePasscodeModal(false)}>
                    <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '24px', padding: '36px', border: '1px solid var(--bg-border)', width: '100%', maxWidth: '440px', display: 'flex', flexDirection: 'column', gap: '20px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: '48px', height: '48px', borderRadius: '16px', backgroundColor: 'rgba(14, 165, 233, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0ea5e9' }}>
                                <Lock size={24} />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>Passcode Required</h3>
                                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>Enter security passcode to update license key</p>
                            </div>
                        </div>

                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            if (licensePasscode !== '592244') {
                                toast.error('Incorrect security passcode. Access denied.');
                                return;
                            }
                            setShowUpdateLicensePasscodeModal(false);
                            setLicensePasscode('');
                            setShowUpdateLicenseModal(true);
                            fetchSubscriptionInfo();
                        }} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <input
                                type="password"
                                placeholder="Enter Security Passcode"
                                value={licensePasscode}
                                onChange={(e) => setLicensePasscode(e.target.value)}
                                autoFocus
                                style={{
                                    width: '100%',
                                    padding: '14px 16px',
                                    borderRadius: '12px',
                                    border: '1px solid var(--bg-border)',
                                    backgroundColor: 'var(--bg-base)',
                                    color: 'var(--text-primary)',
                                    fontSize: '16px',
                                    letterSpacing: '2px',
                                    outline: 'none'
                                }}
                            />

                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowUpdateLicensePasscodeModal(false)}
                                    style={{ padding: '12px 20px', borderRadius: '12px', border: '1px solid var(--bg-border)', backgroundColor: 'transparent', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    style={{ padding: '12px 24px', borderRadius: '12px', border: 'none', backgroundColor: '#0ea5e9', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                                >
                                    Verify & Access
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Update License Key Dialog */}
            {showUpdateLicenseModal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={() => setShowUpdateLicenseModal(false)}>
                    <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '24px', padding: '36px', border: '1px solid var(--bg-border)', width: '100%', maxWidth: '520px', display: 'flex', flexDirection: 'column', gap: '20px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '48px', height: '48px', borderRadius: '16px', backgroundColor: 'rgba(14, 165, 233, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0ea5e9' }}>
                                    <KeyRound size={24} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>Update License Key</h3>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>Pre-schedule or renew your hotel license</p>
                                </div>
                            </div>
                        </div>

                        {/* Current Active License Info Card */}
                        <div style={{ backgroundColor: 'var(--bg-base)', borderRadius: '16px', padding: '16px', border: '1px solid var(--bg-border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Current Plan Status</span>
                                <span style={{ fontSize: '12px', fontWeight: 700, padding: '2px 10px', borderRadius: '12px', backgroundColor: subscriptionInfo?.isValid ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: subscriptionInfo?.isValid ? '#10b981' : '#ef4444' }}>
                                    {subscriptionInfo?.isValid ? 'ACTIVE' : 'EXPIRED / TRIAL'}
                                </span>
                            </div>
                            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                {subscriptionInfo?.type ? `${subscriptionInfo.type.toUpperCase()} PLAN` : 'Trial Mode'}
                            </div>
                            {subscriptionInfo?.expiresAt && (
                                <div style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                                    <span>Expires: {new Date(subscriptionInfo.expiresAt).toLocaleDateString()}</span>
                                    <span>{subscriptionInfo.daysRemaining} days remaining</span>
                                </div>
                            )}
                        </div>

                        {/* Queued Plan Banner if already queued */}
                        {subscriptionInfo?.hasQueuedLicense && (
                            <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', borderRadius: '16px', padding: '16px', border: '1px solid rgba(16, 185, 129, 0.3)', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                <CheckCircle2 size={20} style={{ color: '#10b981', marginTop: '2px', flexShrink: 0 }} />
                                <div>
                                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#10b981' }}>
                                        Next Plan Queued: {subscriptionInfo.queuedType?.toUpperCase()} PLAN
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', lineHeight: '1.4' }}>
                                        This new plan is stored safely in background and will automatically activate as soon as your current plan ends. Entering a new key below will update this queued plan.
                                    </div>
                                </div>
                            </div>
                        )}

                        <form onSubmit={handleUpdateLicenseSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>New License Key</label>
                                <input
                                    type="text"
                                    placeholder="Enter Monthly, Yearly, or Lifetime key"
                                    value={updateLicenseInputKey}
                                    onChange={(e) => setUpdateLicenseInputKey(e.target.value)}
                                    required
                                    style={{
                                        width: '100%',
                                        padding: '14px 16px',
                                        borderRadius: '12px',
                                        border: '1px solid var(--bg-border)',
                                        backgroundColor: 'var(--bg-base)',
                                        color: 'var(--text-primary)',
                                        fontSize: '15px',
                                        outline: 'none'
                                    }}
                                />
                                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                                    💡 <strong>Plan Queuing:</strong> If your current plan is still active, the new key will be queued and will automatically activate seamlessly after your current plan expires.
                                </p>
                            </div>

                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowUpdateLicenseModal(false)}
                                    style={{ padding: '12px 20px', borderRadius: '12px', border: '1px solid var(--bg-border)', backgroundColor: 'transparent', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={licenseSubmitLoading || !updateLicenseInputKey.trim()}
                                    style={{ padding: '12px 24px', borderRadius: '12px', border: 'none', backgroundColor: '#0ea5e9', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: licenseSubmitLoading ? 0.7 : 1 }}
                                >
                                    {licenseSubmitLoading ? 'Saving Key...' : 'Save & Queue License'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Profile;
