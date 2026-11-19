import { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import ConfirmModal from '../components/ConfirmModal';
import { toast } from 'react-hot-toast';
import { Plus, Utensils, Tag, IndianRupee, Layers, ListChecks, Trash2, Edit2, X, Check, Save, Search, UploadCloud, ChevronDown, ChevronUp, RefreshCcw, Pin, Hash } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';

const MenuManagement = () => {
  const { language, t } = useLanguage();
  const { user } = useAuth();
  const [menuLang, setMenuLang] = useState(language || 'en');
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [newCatName, setNewCatName] = useState('');
  const fileInputRef = useRef(null);

  // Multiple Menu states
  const [menus, setMenus] = useState([
    { menu_number: 1, name: 'Menu 1' },
    { menu_number: 2, name: 'Menu 2' },
    { menu_number: 3, name: 'Menu 3' },
    { menu_number: 4, name: 'Menu 4' }
  ]);
  const [selectedMenuNumber, setSelectedMenuNumber] = useState(1);
  const [editingMenuNumber, setEditingMenuNumber] = useState(null);
  const [editMenuName, setEditMenuName] = useState('');
  
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [editingCatId, setEditingCatId] = useState(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatMarathiName, setEditCatMarathiName] = useState('');

  const [editingItemId, setEditingItemId] = useState(null);
  const [editItemData, setEditItemData] = useState({});
  const [isGroupsCardExpanded, setIsGroupsCardExpanded] = useState(true);

  const [newItem, setNewItem] = useState({
    name: '',
    price: '',
    category_id: '',
    description: '',
    item_number: ''
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const fetchMenus = async () => {
    try {
      const res = await api.get('/menu/menus');
      if (Array.isArray(res.data) && res.data.length > 0) {
        setMenus(res.data);
      }
    } catch (err) {
      console.error('Error fetching menus list:', err);
    }
  };

  useEffect(() => {
    if (user?.multipleMenuEnabled) {
      fetchMenus();
    }
  }, [user?.multipleMenuEnabled]);

  const fetchData = async (page = 1, search = '', menuNum = selectedMenuNumber) => {
    try {
      const activeMenu = user?.multipleMenuEnabled ? menuNum : 1;
      const [catRes, itemsRes] = await Promise.all([
        api.get(`/menu/categories?menu_number=${activeMenu}`),
        api.get(`/menu/items?page=${page}&limit=10&search=${encodeURIComponent(search)}&menu_number=${activeMenu}`)
      ]);
      setCategories(Array.isArray(catRes.data) ? catRes.data : []);
      const itemsData = itemsRes.data;
      if (Array.isArray(itemsData)) {
        setItems(itemsData);
        setTotalPages(Math.ceil(itemsData.length / 10) || 1);
        setCurrentPage(page);
      } else if (itemsData && typeof itemsData === 'object') {
        setItems(itemsData.items || []);
        setTotalPages(itemsData.totalPages || 1);
        setCurrentPage(itemsData.currentPage || page);
      } else {
        setItems([]);
        setTotalPages(1);
      }
    } catch (err) {
      console.error('Menu load error:', err);
      toast.error('Failed to load menu');
    }
  };

  useEffect(() => {
    fetchData(currentPage, searchTerm, selectedMenuNumber);
  }, [currentPage, searchTerm, selectedMenuNumber]);

  const handleAddNewMenu = async () => {
    const nextNum = Math.max(...menus.map(m => m.menu_number), 0) + 1;
    const nextName = `Menu ${nextNum}`;
    try {
      await api.post('/menu/menus', { menu_number: nextNum, name: nextName });
      setMenus(prev => [...prev, { menu_number: nextNum, name: nextName }]);
      setSelectedMenuNumber(nextNum);
      toast.success(`Created ${nextName}`);
    } catch {
      toast.error('Failed to create new menu');
    }
  };

  const handleSaveMenuName = async (menuNum) => {
    if (!editMenuName.trim()) {
      setEditingMenuNumber(null);
      return;
    }
    try {
      await api.post('/menu/menus', { menu_number: menuNum, name: editMenuName.trim() });
      setMenus(prev => prev.map(m => m.menu_number === menuNum ? { ...m, name: editMenuName.trim() } : m));
      setEditingMenuNumber(null);
      toast.success('Menu renamed successfully');
    } catch {
      toast.error('Failed to rename menu');
    }
  };

  const handleDeleteMenu = (menuObj) => {
    const menuTitle = menuObj.name || `Menu ${menuObj.menu_number}`;
    setConfirmModal({
      isOpen: true,
      title: `Delete ${menuTitle}?`,
      message: `Are you sure you want to delete ${menuTitle}? All its categories and menu items will be deleted, and any table sections assigned to it will automatically revert to Menu 1 (Default). This action cannot be undone.`,
      onConfirm: async () => {
        try {
          const res = await api.delete(`/menu/menus/${menuObj.menu_number}`);
          toast.success(res.data?.message || `${menuTitle} deleted successfully`);
          if (Array.isArray(res.data?.menus) && res.data.menus.length > 0) {
            setMenus(res.data.menus);
          } else {
            setMenus(prev => prev.filter(m => m.menu_number !== menuObj.menu_number));
          }
          if (selectedMenuNumber === menuObj.menu_number) {
            setSelectedMenuNumber(1);
            fetchData(1, '', 1);
          }
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          toast.error(err.response?.data?.message || 'Failed to delete menu');
        }
      }
    });
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target.result;
      const lines = text.split(/\r?\n/);
      const importedItems = [];
      
      let startIdx = 0;
      let catIdx = 0;
      let nameIdx = 1;
      let priceIdx = 2;
      let marathiNameIdx = 3;
      let marathiCatIdx = -1;

      if (lines.length > 0 && (lines[0].toLowerCase().includes('category') || lines[0].toLowerCase().includes('price') || lines[0].toLowerCase().includes('name'))) {
        startIdx = 1;
        const headerLine = lines[0].toLowerCase();
        const delimiter = headerLine.includes('\t') ? '\t' : headerLine.includes(';') ? ';' : ',';
        const headers = headerLine.split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));
        
        catIdx = headers.indexOf('category');
        nameIdx = headers.indexOf('name');
        priceIdx = headers.indexOf('price');
        
        marathiNameIdx = headers.indexOf('marathi_name');
        if (marathiNameIdx === -1) marathiNameIdx = headers.indexOf('marathi name');
        
        marathiCatIdx = headers.indexOf('marathi_category');
        if (marathiCatIdx === -1) marathiCatIdx = headers.indexOf('marathi category');
        
        if (catIdx === -1) catIdx = 0;
        if (nameIdx === -1) nameIdx = 1;
        if (priceIdx === -1) priceIdx = 2;
        if (marathiNameIdx === -1) marathiNameIdx = 3;
      }

      for (let i = startIdx; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const delimiter = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
        const parts = line.split(delimiter).map(p => p.trim().replace(/^["']|["']$/g, ''));
        
        const category = parts[catIdx];
        const name = parts[nameIdx];
        const price = parseFloat(parts[priceIdx]);
        const marathi_name = parts[marathiNameIdx] || '';
        const marathi_category = marathiCatIdx !== -1 ? (parts[marathiCatIdx] || '') : '';
        
        if (category && name && !isNaN(price)) {
          importedItems.push({ category, name, price, marathi_name, marathi_category });
        }
      }

      if (importedItems.length === 0) {
        toast.error('No valid menu items found in CSV file');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      const activeMenu = user?.multipleMenuEnabled ? selectedMenuNumber : 1;
      const targetMenuObj = menus.find(m => m.menu_number === activeMenu);
      const targetMenuTitle = targetMenuObj?.name || `Menu ${activeMenu}`;
      const loadingToast = toast.loading(`Importing ${importedItems.length} items into ${targetMenuTitle}...`);
      try {
        const res = await api.post('/menu/items/bulk', { 
          items: importedItems,
          menu_number: activeMenu
        });
        toast.success(res.data.message || `Successfully imported ${importedItems.length} items into ${targetMenuTitle}!`, { id: loadingToast });
        fetchData(1, '', activeMenu);
        setCurrentPage(1);
      } catch {
        toast.error(`Failed to import menu CSV into ${targetMenuTitle}`, { id: loadingToast });
      }
      
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const handleRenumberMenu = async () => {
    const activeMenu = user?.multipleMenuEnabled ? selectedMenuNumber : 1;
    const tId = toast.loading('Renumbering items sequentially (1 to N)...');
    try {
      const res = await api.post('/menu/items/renumber', { menu_number: activeMenu });
      toast.success(`Renumbered ${res.data?.total || ''} items sequentially (1 to ${res.data?.total || ''})`, { id: tId });
      fetchData(currentPage, searchTerm, activeMenu);
    } catch (err) {
      toast.error('Failed to renumber items', { id: tId });
    }
  };

  const addCategory = async (e) => {
    e.preventDefault();
    try {
      const activeMenu = user?.multipleMenuEnabled ? selectedMenuNumber : 1;
      await api.post('/menu/categories', { name: newCatName, menu_number: activeMenu });
      setNewCatName('');
      fetchData(currentPage, searchTerm, activeMenu);
      toast.success('Category successfully added!');
    } catch (err) {
      toast.error('Could not add category');
    }
  };

  const deleteCategory = (id) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Category?',
      message: 'This will permanently delete this category and all its menu items. This action cannot be undone.',
      onConfirm: async () => {
        try {
          const res = await api.delete(`/menu/categories/${id}`);
          fetchData(currentPage, searchTerm, selectedMenuNumber);
          toast.success(res.data?.message || 'Category deleted');
          setConfirmModal({ ...confirmModal, isOpen: false });
        } catch (err) {
          toast.error(err.response?.data?.message || 'Delete failed');
        }
      }
    });
  };

  const saveCategoryUpdate = async (id) => {
    try {
      await api.put(`/menu/categories/${id}`, { name: editCatName, marathi_name: editCatMarathiName });
      setEditingCatId(null);
      fetchData(currentPage, searchTerm, selectedMenuNumber);
      toast.success('Category updated');
    } catch (err) {
      toast.error('Update failed');
    }
  };

  const addItem = async (e) => {
    e.preventDefault();
    if (!newItem.category_id) return toast.error('Please assign a category');
    try {
      const activeMenu = user?.multipleMenuEnabled ? selectedMenuNumber : 1;
      await api.post('/menu/items', { ...newItem, menu_number: activeMenu });
      setNewItem({ name: '', marathi_name: '', price: '', category_id: '', description: '', item_number: '' });
      fetchData(1, '', activeMenu);
      setCurrentPage(1);
      setSearchTerm('');
      toast.success(`Menu item added successfully!`);
    } catch (err) {
      toast.error('Could not create item');
    }
  };

  const deleteItem = (id) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Item?',
      message: 'Are you sure you want to remove this item from your active menu?',
      onConfirm: async () => {
        try {
          const res = await api.delete(`/menu/items/${id}`);
          fetchData(currentPage, searchTerm, selectedMenuNumber);
          toast.success(res.data?.message || 'Item deleted');
          setConfirmModal({ ...confirmModal, isOpen: false });
        } catch (err) {
          toast.error(err.response?.data?.message || 'Delete failed');
        }
      }
    });
  };

  const startEditItem = (item) => {
    setEditingItemId(item.id);
    setEditItemData(item);
  };

  const togglePinItem = async (item) => {
    try {
      const res = await api.put(`/menu/items/${item.id}/pin`);
      const newPinned = Boolean(res.data?.is_pinned);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_pinned: newPinned } : i));
      fetchData(currentPage, searchTerm, selectedMenuNumber);
      toast.success(newPinned ? `Pinned ${item.name} to top!` : `Unpinned ${item.name}`);
    } catch (err) {
      console.error('Toggle pin error:', err);
      toast.error(err.response?.data?.message || 'Failed to toggle pin status');
    }
  };

  const saveItemUpdate = async (id) => {
    try {
      await api.put(`/menu/items/${id}`, { ...editItemData });
      setEditingItemId(null);
      fetchData(currentPage, searchTerm, selectedMenuNumber);
      toast.success('Item details updated');
    } catch (err) {
      toast.error('Update failed');
    }
  };

  const deleteAllMenu = () => {
    const activeMenu = user?.multipleMenuEnabled ? selectedMenuNumber : 1;
    const targetMenuObj = menus.find(m => m.menu_number === activeMenu);
    const targetMenuTitle = targetMenuObj?.name || `Menu ${activeMenu}`;
    setConfirmModal({
      isOpen: true,
      title: user?.multipleMenuEnabled ? `Delete ${targetMenuTitle}?` : `Delete Entire Menu?`,
      message: user?.multipleMenuEnabled
        ? `This will permanently delete all items in ${targetMenuTitle}. Other menus will not be affected. This action is irreversible!`
        : `This will permanently delete all menu items. Active tables will lose item references. This action is irreversible!`,
      onConfirm: async () => {
        const loadingToast = toast.loading(`Deleting menu items...`);
        try {
          await api.delete(`/menu/purge-all${user?.multipleMenuEnabled ? `?menu_number=${activeMenu}` : ''}`);
          fetchData(1, '', activeMenu);
          setCurrentPage(1);
          setSearchTerm('');
          toast.success(`${targetMenuTitle} items successfully deleted`, { id: loadingToast });
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          toast.error(err.response?.data?.message || 'Delete failed', { id: loadingToast });
        }
      }
    });
  };

  const renderPagination = (activeColor = '#38bdf8') => {
    const getPages = () => {
      const pages = [];
      if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) pages.push(i);
        return pages;
      }
      pages.push(1);
      if (currentPage > 4) pages.push('...');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 3) pages.push('...');
      pages.push(totalPages);
      return pages;
    };
    const btnBase = { height: '40px', minWidth: '40px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '13px', transition: 'all 0.15s' };
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', marginTop: '24px', flexWrap: 'wrap' }}>
        <button
          disabled={currentPage === 1}
          onClick={() => setCurrentPage(currentPage - 1)}
          style={{ ...btnBase, padding: '0 14px', backgroundColor: currentPage === 1 ? 'rgba(255,255,255,0.03)' : 'var(--bg-border)', color: currentPage === 1 ? 'var(--text-muted)' : 'var(--text-secondary)', cursor: currentPage === 1 ? 'default' : 'pointer' }}
        >&#8249; {t('prev', 'Prev')}</button>
        {getPages().map((p, i) =>
          p === '...' ? (
            <span key={`ellipsis-${i}`} style={{ color: 'var(--text-muted)', fontWeight: 800, padding: '0 4px' }}>...</span>
          ) : (
            <button
              key={p}
              onClick={() => setCurrentPage(p)}
              style={{ ...btnBase, backgroundColor: currentPage === p ? activeColor : 'var(--bg-border)', color: currentPage === p ? 'white' : 'var(--text-secondary)', boxShadow: currentPage === p ? `0 4px 12px ${activeColor}55` : 'none' }}
            >{p}</button>
          )
        )}
        <button
          disabled={currentPage === totalPages}
          onClick={() => setCurrentPage(currentPage + 1)}
          style={{ ...btnBase, padding: '0 14px', backgroundColor: currentPage === totalPages ? 'rgba(255,255,255,0.03)' : 'var(--bg-border)', color: currentPage === totalPages ? 'var(--text-muted)' : 'var(--text-secondary)', cursor: currentPage === totalPages ? 'default' : 'pointer' }}
        >{t('next', 'Next')} &#8250;</button>
      </div>
    );
  };

  return (
    <div style={{ width: '100%', maxWidth: '1400px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Multiple Menu Tabs Bar */}
      {user?.multipleMenuEnabled && (
        <div style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '24px',
          padding: '20px 28px',
          border: '1px solid var(--border-rgba-05)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '38px', height: '38px', backgroundColor: 'rgba(245, 158, 11, 0.12)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Utensils size={20} style={{ color: '#f59e0b' }} />
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 900, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Multiple Menus
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.12)', padding: '2px 8px', borderRadius: '6px' }}>Enabled</span>
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Select a menu below to edit items or import CSV. Assign menus to table sections in Table Management.
                </span>
              </div>
            </div>

            <button
              onClick={handleAddNewMenu}
              type="button"
              style={{
                backgroundColor: 'rgba(99, 102, 241, 0.12)',
                color: '#818cf8',
                border: '1px solid rgba(99, 102, 241, 0.25)',
                padding: '8px 16px',
                borderRadius: '12px',
                fontSize: '13px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.15s'
              }}
            >
              <Plus size={16} strokeWidth={3} /> Add Menu
            </button>
          </div>

          {/* Menu Selection Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {menus.map((m) => {
              const isSelected = selectedMenuNumber === m.menu_number;
              const isEditing = editingMenuNumber === m.menu_number;

              return (
                <div
                  key={m.menu_number}
                  onClick={() => {
                    if (!isEditing) {
                      setSelectedMenuNumber(m.menu_number);
                      setCurrentPage(1);
                    }
                  }}
                  style={{
                    backgroundColor: isSelected ? 'rgba(99, 102, 241, 0.15)' : 'var(--bg-base)',
                    border: isSelected ? '2px solid #6366f1' : '1px solid var(--bg-border)',
                    borderRadius: '14px',
                    padding: '8px 14px',
                    cursor: isEditing ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    transition: 'all 0.15s',
                    boxShadow: isSelected ? '0 4px 12px rgba(99, 102, 241, 0.2)' : 'none'
                  }}
                >
                  {isEditing ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                      <input
                        autoFocus
                        value={editMenuName}
                        onChange={(e) => setEditMenuName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveMenuName(m.menu_number);
                          if (e.key === 'Escape') setEditingMenuNumber(null);
                        }}
                        style={{
                          backgroundColor: 'var(--bg-card)',
                          border: '1px solid #6366f1',
                          color: 'var(--text-primary)',
                          borderRadius: '8px',
                          padding: '3px 8px',
                          fontSize: '13px',
                          fontWeight: 700,
                          width: '110px',
                          outline: 'none'
                        }}
                      />
                      <button
                        onClick={() => handleSaveMenuName(m.menu_number)}
                        style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', padding: 2, display: 'flex' }}
                      >
                        <Check size={16} strokeWidth={3} />
                      </button>
                      <button
                        onClick={() => setEditingMenuNumber(null)}
                        style={{ background: 'none', border: 'none', color: '#f43f5e', cursor: 'pointer', padding: 2, display: 'flex' }}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                          fontSize: '13px',
                          fontWeight: 800,
                          color: isSelected ? '#a5b4fc' : 'var(--text-primary)'
                        }}>
                          {m.name || `Menu ${m.menu_number}`}
                        </span>
                        {m.menu_number === 1 && (
                          <span style={{
                            fontSize: '10px',
                            fontWeight: 800,
                            color: '#10b981',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            padding: '1px 6px',
                            borderRadius: '4px'
                          }}>
                            Default
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingMenuNumber(m.menu_number);
                          setEditMenuName(m.name || `Menu ${m.menu_number}`);
                        }}
                        title="Rename menu"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: 2,
                          display: 'flex',
                          alignItems: 'center',
                          opacity: isSelected ? 1 : 0.6
                        }}
                      >
                        <Edit2 size={13} />
                      </button>
                      {m.menu_number !== 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteMenu(m);
                          }}
                          title={`Delete ${m.name || `Menu ${m.menu_number}`}`}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#f43f5e',
                            cursor: 'pointer',
                            padding: 2,
                            display: 'flex',
                            alignItems: 'center',
                            opacity: isSelected ? 0.9 : 0.6,
                            transition: 'opacity 0.15s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                          onMouseLeave={(e) => e.currentTarget.style.opacity = isSelected ? '0.9' : '0.6'}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="responsive-grid-12" style={{ width: '100%' }}>
      
      {/* Category Management Column */}
      <div style={{ gridColumn: 'span 4', display: 'flex', flexDirection: 'column', gap: '32px' }}>
        <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '32px', padding: '24px 32px', border: '1px solid var(--border-rgba-05)' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '44px', height: '44px', backgroundColor: 'rgba(99, 102, 241, 0.1)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                 <Layers size={22} style={{ color: '#818cf8', margin: 'auto' }} />
              </div>
              <div>
                <h2 style={{fontSize: '18px', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>{t('menu_groups', 'Groups & Categories')}</h2>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 700 }}>
                  {categories.length} {t('category_name', 'Categories')}
                </span>
              </div>
            </div>
          </div>

          {/* Content */}
          <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <form onSubmit={addCategory} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('category_name', 'New Category Title')}</label>
                  <div style={{ position: 'relative' }}>
                    <Tag style={{ position: 'absolute', top: '14px', left: '16px', color: 'var(--text-muted)' }} size={16} />
                    <input
                      type="text"
                      placeholder={t('category_name', 'Category Title...')}
                      style={{width: '100%', backgroundColor: 'var(--bg-base)', border: '2px solid var(--bg-border)', color: 'var(--text-primary)', padding: '12px 16px 12px 40px', borderRadius: '14px', outline: 'none', fontSize: '14px', fontWeight: 600 }}
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <button type="submit" style={{width: '100%', backgroundColor: '#6366f1', color: '#ffffff', border: 'none', padding: '14px', borderRadius: '14px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                  <Plus size={18} strokeWidth={3} /> {t('add_category', 'Add Category')}
                </button>
              </form>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h3 style={{ fontSize: '10px', fontWeight: 950, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.2em', borderBottom: '1px solid var(--bg-border)', paddingBottom: '8px', margin: 0 }}>{t('menu_groups', 'Category Groups')}</h3>
                {(categories || []).map(cat => {
                  return (
                    <div key={cat.id} style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Tag size={16} style={{ color: '#818cf8' }} />
                        {editingCatId === cat.id ? (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                              autoFocus
                              placeholder="English Category"
                              value={editCatName}
                              onChange={(e) => setEditCatName(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && saveCategoryUpdate(cat.id)}
                              style={{ background: 'var(--bg-card)', border: '1px solid #38bdf8', outline: 'none', color: '#38bdf8', fontWeight: 900, textTransform: 'uppercase', padding: '4px 8px', borderRadius: '6px', fontSize: '13px', width: '140px' }}
                            />
                            <input
                              placeholder="Marathi Category"
                              value={editCatMarathiName}
                              onChange={(e) => setEditCatMarathiName(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && saveCategoryUpdate(cat.id)}
                              style={{ background: 'var(--bg-card)', border: '1px solid #38bdf8', outline: 'none', color: '#38bdf8', fontWeight: 900, padding: '4px 8px', borderRadius: '6px', fontSize: '13px', width: '140px' }}
                            />
                          </div>
                        ) : (
                          <span style={{ textTransform: 'uppercase', fontWeight: 800, fontSize: '14px', color: 'var(--text-primary)' }}>
                            {language === 'mr' ? (cat.marathi_name || cat.name) : cat.name}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {editingCatId === cat.id ? (
                          <button onClick={() => saveCategoryUpdate(cat.id)} style={{ color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', cursor: 'pointer', padding: '10px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Check size={18} strokeWidth={3} /></button>
                        ) : (
                          <button onClick={() => { setEditingCatId(cat.id); setEditCatName(cat.name); setEditCatMarathiName(cat.marathi_name || ''); }} style={{ color: 'var(--text-primary)', background: 'var(--bg-card)', border: '1px solid var(--border-color)', cursor: 'pointer', padding: '10px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Edit2 size={18} /></button>
                        )}
                        <button onClick={() => deleteCategory(cat.id)} style={{ color: '#f43f5e', background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.2)', cursor: 'pointer', padding: '10px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Trash2 size={18} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

      {/* Item Management Column */}
      <div style={{ gridColumn: 'span 8', display: 'flex', flexDirection: 'column', gap: '32px' }}>
        <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '32px', padding: '40px', border: '1px solid var(--border-rgba-05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '44px', height: '44px', backgroundColor: 'rgba(16, 185, 129, 0.1)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                 <Utensils size={22} style={{ color: '#10b981' }} />
              </div>
              <h2 style={{fontSize: '18px', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>{t('add_to_live_menu', 'Add To Live Menu')}</h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <label style={{ backgroundColor: 'rgba(14, 165, 233, 0.1)', color: '#0ea5e9', border: '1px solid rgba(14, 165, 233, 0.2)', padding: '10px 16px', borderRadius: '12px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s', width: '220px', justifyContent: 'center', margin: 0 }}>
                <UploadCloud size={18} /> {user?.multipleMenuEnabled ? `Import ${menus.find(m => m.menu_number === selectedMenuNumber)?.name || `Menu ${selectedMenuNumber}`} CSV` : t('import_csv', 'Import Menu CSV')}
                <input type="file" accept=".csv, text/csv, application/vnd.ms-excel, text/plain, text/comma-separated-values" style={{ display: 'none' }} onChange={handleFileUpload} ref={fileInputRef} />
              </label>
              <button onClick={handleRenumberMenu} type="button" style={{ backgroundColor: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.2)', padding: '10px 16px', borderRadius: '12px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s', width: '180px', justifyContent: 'center' }} title="Contiguously renumber all active items (1 to N)">
                <Hash size={18} /> Renumber (1 to N)
              </button>
              <button onClick={deleteAllMenu} type="button" style={{ backgroundColor: 'rgba(244, 63, 94, 0.1)', color: '#f43f5e', border: '1px solid rgba(244, 63, 94, 0.2)', padding: '10px 16px', borderRadius: '12px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s', width: '220px', justifyContent: 'center' }}>
                <Trash2 size={18} /> {user?.multipleMenuEnabled ? `Clear ${menus.find(m => m.menu_number === selectedMenuNumber)?.name || `Menu ${selectedMenuNumber}`}` : t('delete_menu', 'Delete Entire Menu')}
              </button>
            </div>
          </div>
        </div>

          <form onSubmit={addItem} style={{ gap: '20px' }} className="responsive-grid-12">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', gridColumn: 'span 2' }}>
              <label style={{ fontSize: '11px', fontWeight: 950, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Item No. (Auto)</label>
              <input
                type="number"
                placeholder="Auto"
                style={{width: '100%', backgroundColor: 'var(--bg-base)', border: '2px solid var(--bg-border)', color: '#38bdf8', padding: '14px 12px', borderRadius: '16px', outline: 'none', fontSize: '14px', fontWeight: 800, textAlign: 'center' }}
                value={newItem.item_number || ''}
                onChange={(e) => setNewItem({...newItem, item_number: e.target.value})}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', gridColumn: 'span 4' }}>
              <label style={{ fontSize: '11px', fontWeight: 950, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('item_name', 'Dish Name')} (English) {language === 'mr' ? '(Optional)' : ''}</label>
              <input
                type="text"
                style={{width: '100%', backgroundColor: 'var(--bg-base)', border: '2px solid var(--bg-border)', color: 'var(--text-primary)', padding: '14px 16px', borderRadius: '16px', outline: 'none', fontSize: '14px', fontWeight: 700 }}
                value={newItem.name}
                onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                required={language !== 'mr'}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', gridColumn: 'span 3' }}>
              <label style={{ fontSize: '11px', fontWeight: 950, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Marathi Name {language !== 'mr' ? '(Optional)' : ''}</label>
              <input
                type="text"
                style={{width: '100%', backgroundColor: 'var(--bg-base)', border: '2px solid var(--bg-border)', color: 'var(--text-primary)', padding: '14px 16px', borderRadius: '16px', outline: 'none', fontSize: '14px', fontWeight: 700 }}
                value={newItem.marathi_name || ''}
                onChange={(e) => setNewItem({...newItem, marathi_name: e.target.value})}
                required={language === 'mr'}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', gridColumn: 'span 3' }}>
              <label style={{ fontSize: '11px', fontWeight: 950, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('item_price', 'Price (₹)')}</label>
              <div style={{ position: 'relative' }}>
                <IndianRupee style={{ position: 'absolute', top: '15px', left: '16px', color: 'var(--text-muted)' }} size={16} />
                <input
                  type="number"
                  style={{ width: '100%', backgroundColor: 'var(--bg-base)', border: '2px solid var(--bg-border)', color: '#10b981', padding: '14px 16px 14px 40px', borderRadius: '16px', outline: 'none', fontSize: '18px', fontWeight: 900 }}
                  value={newItem.price}
                  onChange={(e) => setNewItem({...newItem, price: e.target.value})}
                  required
                />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', gridColumn: 'span 5' }}>
              <label style={{ fontSize: '11px', fontWeight: 950, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('category_name', 'Category')}</label>
              <select
                style={{width: '100%', backgroundColor: 'var(--bg-base)', border: '2px solid var(--bg-border)', color: 'var(--text-primary)', padding: '14px 16px', borderRadius: '16px', outline: 'none', fontSize: '14px', fontWeight: 700 }}
                value={newItem.category_id}
                onChange={(e) => setNewItem({...newItem, category_id: e.target.value})}
              >
                <option value="">{t('select_category', '-- Select Category --')}</option>
                {(categories || []).map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {language === 'mr' ? (cat.marathi_name || cat.name) : cat.name.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', gridColumn: 'span 7' }}>
              <label style={{ fontSize: '11px', fontWeight: 950, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('description_label', 'Description')}</label>
              <input
                type="text"
                style={{ width: '100%', backgroundColor: 'var(--bg-base)', border: '2px solid var(--bg-border)', color: 'var(--text-secondary)', padding: '14px 16px', borderRadius: '16px', outline: 'none', fontSize: '14px' }}
                value={newItem.description}
                onChange={(e) => setNewItem({...newItem, description: e.target.value})}
              />
            </div>
            <button type="submit" style={{ gridColumn: 'span 12', backgroundColor: '#10b981', color: 'white', border: 'none', padding: '18px', borderRadius: '20px', fontSize: '16px', fontWeight: 950, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
              <Plus size={22} strokeWidth={4} /> {t('add_item', 'Publish To Menu')}
            </button>
          </form>

        {/* Master Menu View with Edit Capability */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
               <ListChecks size={20} style={{ color: 'var(--text-muted)' }} />
               <h3 style={{ fontSize: '14px', fontWeight: 950, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.2em', margin: 0 }}>{t('menu_management_title', 'Current Menu Catalog')}</h3>
            </div>
            
            <div style={{ position: 'relative', width: '320px', maxWidth: '100%' }}>
               <Search style={{ position: 'absolute', top: '12px', left: '16px', color: 'var(--text-muted)' }} size={16} />
               <input
                 type="text"
                 placeholder={t('search_menu', 'Search dishes or groups...')}
                 value={searchTerm}
                 onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                 style={{width: '100%', backgroundColor: 'var(--bg-base)', border: '2px solid var(--bg-border)', color: 'var(--text-primary)', padding: '10px 16px 10px 42px', borderRadius: '12px', outline: 'none', fontSize: '13px', fontWeight: 700 }}
               />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {(items || []).map(item => (
              <div key={item.id} style={{ 
                backgroundColor: 'var(--bg-card)', 
                border: editingItemId === item.id ? '2px solid #38bdf8' : '1px solid var(--border-rgba-05)', 
                borderRadius: '16px', 
                padding: '16px 24px', 
                display: 'flex', 
                flexWrap: 'wrap',
                gap: '16px',
                alignItems: 'center', 
                justifyContent: 'space-between',
                transition: 'all 0.2s ease',
                cursor: 'default'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flex: 1, minWidth: '250px', flexWrap: 'wrap' }}>
                   <div style={{ display: 'flex', flexDirection: 'column', minWidth: '120px' }}>
                      <span style={{ fontSize: '9px', color: '#10b981', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.1em', backgroundColor: 'rgba(16, 185, 129, 0.08)', padding: '2px 8px', borderRadius: '6px', width: 'fit-content', marginBottom: '4px' }}>
                        {language === 'mr' ? (item.category_marathi_name || item.category_name) : item.category_name}
                      </span>
                      {editingItemId === item.id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 900, color: '#38bdf8' }}>No:</span>
                            <input type="number" value={editItemData.item_number ?? ''} placeholder="Item #" onChange={(e) => setEditItemData({...editItemData, item_number: e.target.value})} style={{background: 'var(--bg-base)', border: '1.5px solid #38bdf8', color: '#38bdf8', padding: '3px 6px', borderRadius: '8px', fontSize: '13px', fontWeight: 900, width: '75px', outline: 'none' }} title="Edit Item Number" />
                          </div>
                          <input value={editItemData.name} placeholder="English Name" onChange={(e) => setEditItemData({...editItemData, name: e.target.value})} style={{background: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', padding: '4px 8px', borderRadius: '8px', fontSize: '15px', fontWeight: 900, width: '200px' }} />
                          <input value={editItemData.marathi_name || ''} placeholder="Marathi Name" onChange={(e) => setEditItemData({...editItemData, marathi_name: e.target.value})} style={{background: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', padding: '4px 8px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, width: '200px' }} />
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 900, color: '#0284c7', backgroundColor: 'rgba(14, 165, 233, 0.12)', border: '1px solid rgba(14, 165, 233, 0.25)', padding: '1px 7px', borderRadius: '6px', letterSpacing: '0.02em' }}>
                              #{item.item_number || '-'}
                            </span>
                            <h4 style={{fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, textTransform: 'uppercase' }}>{item.name}</h4>
                          </div>
                          {item.marathi_name && <span style={{fontSize: '15px', fontWeight: 800, color: 'var(--text-muted)', marginTop: '2px', marginLeft: '4px' }}>{item.marathi_name}</span>}
                        </div>
                      )}
                   </div>
                   
                   <div style={{ flex: 1, padding: '0 16px', minWidth: '220px' }}>
                      {editingItemId === item.id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '10px', fontWeight: 900, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('item_description_details', 'Item Description / Details')}</label>
                          <textarea 
                            value={editItemData.description || ''} 
                            onChange={(e) => setEditItemData({...editItemData, description: e.target.value})} 
                            placeholder={t('enter_dish_description', 'Enter dish description, ingredients, or notes...')}
                            style={{ 
                              width: '100%', 
                              background: 'var(--bg-base)', 
                              border: '1.5px solid #38bdf8', 
                              color: 'var(--text-primary)', 
                              padding: '10px 12px', 
                              borderRadius: '10px', 
                              fontSize: '13px', 
                              fontWeight: 500, 
                              minHeight: '65px',
                              resize: 'vertical',
                              outline: 'none',
                              boxSizing: 'border-box'
                            }} 
                          />
                        </div>
                      ) : (
                        <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0, lineHeight: '1.4' }}>{item.description || t('no_description', 'No description provided')}</p>
                      )}
                   </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '32px', flexWrap: 'wrap' }}>
                   <div style={{ textAlign: 'right', minWidth: '80px' }}>
                      {editingItemId === item.id ? (
                        <div style={{ position: 'relative' }}>
                          <span style={{ position: 'absolute', left: '8px', top: '6px', color: '#10b981', fontSize: '14px', fontWeight: 900 }}>₹</span>
                          <input type="number" value={editItemData.price} onChange={(e) => setEditItemData({...editItemData, price: e.target.value})} style={{ background: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: '#10b981', padding: '4px 8px 4px 20px', borderRadius: '8px', fontSize: '16px', fontWeight: 900, width: '90px' }} />
                        </div>
                      ) : (
                        <span style={{fontSize: '18px', fontWeight: 900, color: 'var(--text-primary)' }}>₹{item.price}</span>
                      )}
                   </div>

                   <div style={{ display: 'flex', gap: '10px', borderLeft: '1px solid var(--border-rgba-05)', paddingLeft: '24px' }}>
                      {editingItemId === item.id ? (
                        <>
                          <button onClick={() => setEditingItemId(null)} style={{ padding: '8px', color: 'var(--text-muted)', background: 'rgba(100, 116, 139, 0.1)', border: 'none', borderRadius: '10px', cursor: 'pointer' }}><X size={18} /></button>
                          <button onClick={() => saveItemUpdate(item.id)} style={{ padding: '8px', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', border: 'none', borderRadius: '10px', cursor: 'pointer' }}><Check size={18} strokeWidth={3} /></button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => togglePinItem(item)} style={{ padding: '8px', color: item.is_pinned ? '#f59e0b' : 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', transition: 'all 0.2s', borderRadius: '10px' }} title={item.is_pinned ? "Unpin item" : "Pin item to top"}><Pin size={18} fill={item.is_pinned ? '#f59e0b' : 'none'} /></button>
                          <button onClick={() => startEditItem(item)} style={{ padding: '8px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', transition: 'all 0.2s', borderRadius: '10px' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(100, 116, 139, 0.1)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}><Edit2 size={18} /></button>
                          <button onClick={() => deleteItem(item.id)} style={{ padding: '8px', color: '#f43f5e', background: 'none', border: 'none', cursor: 'pointer', transition: 'all 0.2s', borderRadius: '10px' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(244, 63, 94, 0.1)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}><Trash2 size={18} /></button>
                        </>
                      )}
                   </div>
                 </div>
              </div>
            ))}
          </div>

          {/* Pagination Bar */}
          {renderPagination('#38bdf8')}
        </div>
      </div>
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })}
      />
    </div>
  );
};

export default MenuManagement;
