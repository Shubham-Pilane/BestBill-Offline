import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { toast } from 'react-hot-toast';
import { 
  Boxes, 
  Package, 
  ListCollapse, 
  PlusCircle, 
  AlertCircle, 
  Search,
  Check, 
  X, 
  Trash2,
  Sliders,
  DollarSign
} from 'lucide-react';

const InventoryManagement = () => {
    const { user } = useAuth();
    const [tab, setTab] = useState('overview');
    
    // Core data states
    const [items, setItems] = useState([]);
    const [recipes, setRecipes] = useState([]);
    const [menuItems, setMenuItems] = useState([]);
    const [loading, setLoading] = useState(true);

    // Search and Pagination States
    const [itemSearchQuery, setItemSearchQuery] = useState('');
    const [itemCurrentPage, setItemCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const [menuSearchQuery, setMenuSearchQuery] = useState('');
    const [menuCurrentPage, setMenuCurrentPage] = useState(1);
    const menuItemsPerPage = 10;

    // Dashboard metrics
    const [metrics, setMetrics] = useState({
        totalItems: 0,
        lowStockItems: 0,
        inventoryValue: 0
    });

    // Modals
    const [showItemModal, setShowItemModal] = useState(false);
    const [showAdjustModal, setShowAdjustModal] = useState(false);
    const [showRecipeModal, setShowRecipeModal] = useState(false);

    // Add/Edit Item Form State
    const [editingItem, setEditingItem] = useState(null);
    const [itemName, setItemName] = useState('');
    const [itemUnit, setItemUnit] = useState('KG');
    const [itemStock, setItemStock] = useState('0');
    const [itemMinStock, setItemMinStock] = useState('0');
    const [itemRate, setItemRate] = useState('0');

    // Adjust Stock Form State
    const [selectedAdjustItemId, setSelectedAdjustItemId] = useState('');
    const [adjustQty, setAdjustQty] = useState('0');
    const [adjustRemarks, setAdjustRemarks] = useState('');

    // Recipe Form State
    const [selectedMenuItem, setSelectedMenuItem] = useState(null);
    const [recipeIngredients, setRecipeIngredients] = useState([]); // Array of { inventory_item_id, quantity_required, unit }

    // Init & Refresh
    const fetchData = async () => {
        try {
            setLoading(true);
            const [itemsRes, menuRes, recipesRes, metricsRes] = await Promise.all([
                api.get('/inventory/items'),
                api.get('/menu/items'),
                api.get('/inventory/recipes'),
                api.get('/inventory/dashboard')
            ]);
            setItems(itemsRes.data || []);
            setMenuItems(menuRes.data || []);
            setRecipes(recipesRes.data || []);
            setMetrics(metricsRes.data || { totalItems: 0, lowStockItems: 0, inventoryValue: 0 });
        } catch (err) {
            console.error('Failed to load inventory data:', err);
            toast.error('Could not fetch inventory records');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // --- ITEM SAVE & DELETE ---
    const handleSaveItem = async (e) => {
        e.preventDefault();
        if (!itemName.trim()) return toast.error('Ingredient name is required');
        
        const payload = {
            name: itemName,
            unit: itemUnit,
            current_stock: parseFloat(itemStock) || 0,
            minimum_stock: parseFloat(itemMinStock) || 0,
            purchase_rate: parseFloat(itemRate) || 0
        };

        try {
            if (editingItem) {
                await api.put(`/inventory/items/${editingItem.id}`, payload);
                toast.success('Inventory item updated');
            } else {
                await api.post('/inventory/items', payload);
                toast.success('Raw ingredient added to catalog');
            }
            setShowItemModal(false);
            resetItemForm();
            fetchData();
        } catch (err) {
            toast.error('Failed to save item');
        }
    };

    const handleDeleteItem = async (id) => {
        if (!window.confirm('Are you sure you want to delete this ingredient? This will clear any associated recipes.')) return;
        try {
            await api.delete(`/inventory/items/${id}`);
            toast.success('Ingredient deleted');
            fetchData();
        } catch (err) {
            toast.error('Delete failed');
        }
    };

    const resetItemForm = () => {
        setEditingItem(null);
        setItemName('');
        setItemUnit('KG');
        setItemStock('0');
        setItemMinStock('0');
        setItemRate('0');
    };

    const openEditItem = (item) => {
        setEditingItem(item);
        setItemName(item.name);
        setItemUnit(item.unit);
        setItemStock(String(item.current_stock));
        setItemMinStock(String(item.minimum_stock));
        setItemRate(String(item.purchase_rate));
        setShowItemModal(true);
    };

    // --- STOCK ADJUSTMENT ---
    const handleAdjustStock = async (e) => {
        e.preventDefault();
        if (!selectedAdjustItemId) return toast.error('Please select an ingredient');

        try {
            await api.post('/inventory/adjustments', {
                inventory_item_id: Number(selectedAdjustItemId),
                physical_stock: parseFloat(adjustQty) || 0,
                remarks: adjustRemarks
            });
            toast.success('Stock adjusted successfully');
            setShowAdjustModal(false);
            setAdjustQty('0');
            setAdjustRemarks('');
            fetchData();
        } catch (err) {
            toast.error('Adjustment failed');
        }
    };

    // --- RECIPE MAPPING ---
    const openRecipeModal = async (menuItem) => {
        setSelectedMenuItem(menuItem);
        
        try {
            // Fetch existing recipe for this specific menu item
            const res = await api.get(`/inventory/recipes/product/${menuItem.id}`);
            if (res.data && res.data.items) {
                setRecipeIngredients(res.data.items.map(item => {
                    const matchedItem = items.find(i => i.id === item.inventory_item_id);
                    let displayQty = Number(item.quantity_required) || 0;
                    let displayUnit = matchedItem ? matchedItem.unit : 'KG';

                    if (matchedItem) {
                        const baseUnitLower = matchedItem.unit.toLowerCase();
                        if (baseUnitLower === 'kg' && displayQty < 1) {
                            displayQty = displayQty * 1000;
                            displayUnit = 'Gram';
                        } else if ((baseUnitLower === 'litre' || baseUnitLower === 'l' || baseUnitLower === 'litres') && displayQty < 1) {
                            displayQty = displayQty * 1000;
                            displayUnit = 'ML';
                        } else {
                            // Standardize case to match dropdown values
                            if (baseUnitLower === 'kg') displayUnit = 'KG';
                            else if (baseUnitLower === 'gram') displayUnit = 'Gram';
                            else if (baseUnitLower === 'litre' || baseUnitLower === 'l' || baseUnitLower === 'litres') displayUnit = 'Litre';
                            else if (baseUnitLower === 'ml') displayUnit = 'ML';
                        }
                    }

                    return {
                        inventory_item_id: String(item.inventory_item_id),
                        quantity_required: String(displayQty),
                        unit: displayUnit
                    };
                }));
            } else {
                setRecipeIngredients([]);
            }
            setShowRecipeModal(true);
        } catch (err) {
            toast.error('Failed to load recipe details');
        }
    };

    const addIngredientRow = () => {
        setRecipeIngredients([...recipeIngredients, { inventory_item_id: '', quantity_required: '0', unit: 'KG' }]);
    };

    const removeIngredientRow = (index) => {
        setRecipeIngredients(recipeIngredients.filter((_, idx) => idx !== index));
    };

    const updateIngredientRow = (index, field, value) => {
        setRecipeIngredients(recipeIngredients.map((row, idx) => {
            if (idx === index) {
                const updatedRow = { ...row, [field]: value };
                // If ingredient is changed, sync its default unit and standardize casing
                if (field === 'inventory_item_id') {
                    const selectedItem = items.find(item => String(item.id) === String(value));
                    if (selectedItem) {
                        const baseUnitLower = selectedItem.unit.toLowerCase();
                        if (baseUnitLower === 'kg') updatedRow.unit = 'KG';
                        else if (baseUnitLower === 'gram') updatedRow.unit = 'Gram';
                        else if (baseUnitLower === 'litre' || baseUnitLower === 'l' || baseUnitLower === 'litres') updatedRow.unit = 'Litre';
                        else if (baseUnitLower === 'ml') updatedRow.unit = 'ML';
                        else updatedRow.unit = selectedItem.unit;
                    }
                }
                return updatedRow;
            }
            return row;
        }));
    };

    // Helper to convert units to raw item display unit
    const convertToItemDisplayUnit = (qty, inputUnit, itemUnit) => {
        const q = parseFloat(qty) || 0;
        const iu = String(inputUnit).toLowerCase().trim();
        const iuBase = String(itemUnit).toLowerCase().trim();

        if (iuBase === 'kg') {
            if (iu === 'gram' || iu === 'g' || iu === 'gm' || iu === 'grams') return q / 1000;
            return q;
        }
        if (iuBase === 'gram' || iuBase === 'g' || iuBase === 'gm' || iuBase === 'grams') {
            if (iu === 'kg' || iu === 'kilogram' || iu === 'kilograms') return q * 1000;
            return q;
        }
        if (iuBase === 'litre' || iuBase === 'l' || iuBase === 'litres') {
            if (iu === 'ml' || iu === 'millilitre' || iu === 'millilitres') return q / 1000;
            return q;
        }
        if (iuBase === 'ml' || iuBase === 'millilitre' || iuBase === 'millilitres') {
            if (iu === 'litre' || iu === 'l' || iu === 'litres') return q * 1000;
            return q;
        }
        return q;
    };

    const handleSaveRecipe = async () => {
        if (recipeIngredients.some(row => !row.inventory_item_id)) {
            return toast.error('Please select ingredients for all mapped rows');
        }

        try {
            const mappedItems = recipeIngredients.map(row => {
                const selectedItem = items.find(item => String(item.id) === String(row.inventory_item_id));
                if (!selectedItem) {
                    throw new Error(`Ingredient for ID ${row.inventory_item_id} not found in catalog.`);
                }
                const convertedQty = convertToItemDisplayUnit(
                    row.quantity_required,
                    row.unit || selectedItem.unit,
                    selectedItem.unit
                );
                return {
                    inventory_item_id: Number(row.inventory_item_id),
                    quantity_required: convertedQty
                };
            });

            await api.post('/inventory/recipes', {
                product_id: selectedMenuItem.id,
                items: mappedItems
            });

            toast.success(`Recipe saved for ${selectedMenuItem.name}!`);
            setShowRecipeModal(false);
            setSelectedMenuItem(null);
            setRecipeIngredients([]);
            fetchData();
        } catch (err) {
            const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to map recipe';
            toast.error(errorMsg);
        }
    };

    // --- FILTERED & PAGINATED LISTS ---
    const filteredItems = items.filter(item => 
        item.name.toLowerCase().includes(itemSearchQuery.toLowerCase())
    );
    const itemsTotalPages = Math.ceil(filteredItems.length / itemsPerPage);
    const paginatedItems = filteredItems.slice((itemCurrentPage - 1) * itemsPerPage, itemCurrentPage * itemsPerPage);

    const filteredMenuItems = menuItems.filter(menuItem => 
        menuItem.name.toLowerCase().includes(menuSearchQuery.toLowerCase())
    );
    const menuTotalPages = Math.ceil(filteredMenuItems.length / menuItemsPerPage);
    const paginatedMenuItems = filteredMenuItems.slice((menuCurrentPage - 1) * menuItemsPerPage, menuCurrentPage * menuItemsPerPage);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', width: '100%', maxWidth: '1440px', color: 'var(--text-primary)' }}>
            
            {/* Header section */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ 
                        width: '56px', 
                        height: '56px', 
                        backgroundColor: 'rgba(14, 165, 233, 0.1)', 
                        borderRadius: '16px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        border: '1px solid rgba(14, 165, 233, 0.2)'
                    }}>
                        <Boxes color="#0ea5e9" size={28} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <h1 style={{ fontSize: '32px', fontWeight: 950, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
                            Inventory Management
                        </h1>
                        <span style={{ color: 'var(--text-muted)', fontSize: '14px', fontWeight: 700 }}>
                            Add raw materials, customize recipe mappings, and audit current physical stock.
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                    <button 
                        onClick={() => { resetItemForm(); setShowItemModal(true); }}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px', borderRadius: '12px', border: 'none', backgroundColor: '#0ea5e9', color: 'white', fontWeight: 800, fontSize: '14px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(14, 165, 233, 0.2)' }}
                    >
                        <PlusCircle size={18} /> Add Raw Ingredient
                    </button>
                    <button 
                        onClick={() => {
                            if (items.length === 0) return toast.error('No items registered to adjust stock');
                            setSelectedAdjustItemId(String(items[0].id));
                            setShowAdjustModal(true);
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px', borderRadius: '12px', border: 'none', backgroundColor: 'var(--bg-border)', color: 'var(--text-primary)', fontWeight: 800, fontSize: '14px', cursor: 'pointer' }}
                    >
                        <Sliders size={18} /> Adjust Physical Stock
                    </button>
                </div>
            </div>

            {/* Quick Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '24px' }}>
                <div style={{ backgroundColor: 'var(--bg-card)', padding: '24px', borderRadius: '24px', border: '1px solid var(--bg-border)', display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: 'rgba(14, 165, 233, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Package color="#0ea5e9" size={24} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase' }}>Total Ingredients</span>
                        <span style={{ fontSize: '24px', fontWeight: 900, color: 'var(--text-primary)', marginTop: '4px' }}>{metrics.totalItems}</span>
                    </div>
                </div>

                <div style={{ backgroundColor: 'var(--bg-card)', padding: '24px', borderRadius: '24px', border: '1px solid var(--bg-border)', display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <AlertCircle color="#ef4444" size={24} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase' }}>Low Stock Items</span>
                        <span style={{ fontSize: '24px', fontWeight: 900, color: '#ef4444', marginTop: '4px' }}>{metrics.lowStockItems}</span>
                    </div>
                </div>

                <div style={{ backgroundColor: 'var(--bg-card)', padding: '24px', borderRadius: '24px', border: '1px solid var(--bg-border)', display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <DollarSign color="#10b981" size={24} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase' }}>Stock Value (Valuation)</span>
                        <span style={{ fontSize: '24px', fontWeight: 900, color: '#10b981', marginTop: '4px' }}>₹{Number(metrics.inventoryValue || 0).toFixed(2)}</span>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid var(--bg-border)', paddingBottom: '1px' }}>
                <button 
                    onClick={() => setTab('overview')} 
                    style={{
                        padding: '12px 24px', 
                        backgroundColor: 'transparent', 
                        border: 'none', 
                        borderBottom: tab === 'overview' ? '2px solid #0ea5e9' : '2px solid transparent',
                        color: tab === 'overview' ? '#0ea5e9' : 'var(--text-muted)',
                        fontWeight: 800,
                        cursor: 'pointer',
                        fontSize: '15px'
                    }}
                >
                    Overview & Stock
                </button>
                <button 
                    onClick={() => setTab('recipes')} 
                    style={{
                        padding: '12px 24px', 
                        backgroundColor: 'transparent', 
                        border: 'none', 
                        borderBottom: tab === 'recipes' ? '2px solid #0ea5e9' : '2px solid transparent',
                        color: tab === 'recipes' ? '#0ea5e9' : 'var(--text-muted)',
                        fontWeight: 800,
                        cursor: 'pointer',
                        fontSize: '15px'
                    }}
                >
                    Recipes & BOM Mappings
                </button>
            </div>

            {/* Loading Indicator */}
            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '100px', backgroundColor: 'var(--bg-card)', borderRadius: '24px', border: '1px solid var(--bg-border)' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '4px solid var(--bg-border)', borderTopColor: '#0ea5e9', animation: 'spin 1s linear infinite' }}></div>
                    <p style={{ marginTop: '16px', fontWeight: 800, color: 'var(--text-muted)' }}>Retrieving records...</p>
                </div>
            ) : tab === 'overview' ? (
                
                /* TAB 1: OVERVIEW & STOCK */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>Raw Ingredients Catalog</h3>
                        <div style={{ position: 'relative', width: '300px' }}>
                            <Search style={{ position: 'absolute', top: '12px', left: '16px', color: 'var(--text-muted)' }} size={16} />
                            <input 
                                placeholder="Search Raw Ingredient..."
                                value={itemSearchQuery}
                                onChange={(e) => { setItemSearchQuery(e.target.value); setItemCurrentPage(1); }}
                                style={{ width: '100%', backgroundColor: 'var(--bg-card)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', padding: '10px 16px 10px 44px', borderRadius: '8px', outline: 'none', fontWeight: 600, fontSize: '14px', boxSizing: 'border-box' }}
                            />
                        </div>
                    </div>

                    <div style={{ overflowX: 'auto', borderRadius: '16px', border: '1px solid var(--bg-border)', backgroundColor: 'var(--bg-card)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                            <thead>
                                <tr style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
                                    <th style={{ padding: '16px', borderBottom: '2px solid var(--bg-border)', color: 'var(--text-muted)', fontWeight: 800 }}>Ingredient Name</th>
                                    <th style={{ padding: '16px', borderBottom: '2px solid var(--bg-border)', color: 'var(--text-muted)', fontWeight: 800 }}>Current Stock</th>
                                    <th style={{ padding: '16px', borderBottom: '2px solid var(--bg-border)', color: 'var(--text-muted)', fontWeight: 800 }}>Min Safety Stock</th>
                                    <th style={{ padding: '16px', borderBottom: '2px solid var(--bg-border)', color: 'var(--text-muted)', fontWeight: 800 }}>Est. Purchase Rate</th>
                                    <th style={{ padding: '16px', borderBottom: '2px solid var(--bg-border)', color: 'var(--text-muted)', fontWeight: 800 }}>Status</th>
                                    <th style={{ padding: '16px', borderBottom: '2px solid var(--bg-border)', color: 'var(--text-muted)', fontWeight: 800, textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedItems.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>
                                            No matching ingredients found.
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedItems.map(item => {
                                        const isLow = item.current_stock <= item.minimum_stock;
                                        return (
                                            <tr key={item.id} style={{ borderBottom: '1px solid var(--border-rgba-05)', transition: 'background-color 0.2s' }} onMouseOver={e => e.currentTarget.style.backgroundColor = 'var(--bg-base)'} onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                <td style={{ padding: '16px', fontWeight: 700 }}>{item.name}</td>
                                                <td style={{ padding: '16px', fontWeight: 800, color: isLow ? '#ef4444' : 'var(--text-primary)' }}>
                                                    {item.current_stock} {item.unit}
                                                </td>
                                                <td style={{ padding: '16px', fontWeight: 600 }}>{item.minimum_stock} {item.unit}</td>
                                                <td style={{ padding: '16px', fontWeight: 600 }}>₹{parseFloat(item.purchase_rate).toFixed(2)}</td>
                                                <td style={{ padding: '16px' }}>
                                                    <span style={{ 
                                                        padding: '4px 8px', 
                                                        borderRadius: '6px', 
                                                        fontSize: '11px', 
                                                        fontWeight: 900, 
                                                        textTransform: 'uppercase', 
                                                        backgroundColor: isLow ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', 
                                                        color: isLow ? '#ef4444' : '#10b981' 
                                                    }}>
                                                        {isLow ? 'Low Stock' : 'Healthy'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '16px', textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                        <button 
                                                            onClick={() => openEditItem(item)}
                                                            style={{ padding: '6px 12px', border: 'none', borderRadius: '6px', backgroundColor: 'rgba(14, 165, 233, 0.1)', color: '#0ea5e9', cursor: 'pointer', fontWeight: 700 }}
                                                        >
                                                            Edit
                                                        </button>
                                                        <button 
                                                            onClick={() => handleDeleteItem(item.id)}
                                                            style={{ padding: '6px 12px', border: 'none', borderRadius: '6px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', cursor: 'pointer', fontWeight: 700 }}
                                                        >
                                                            Delete
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {itemsTotalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                            <button disabled={itemCurrentPage === 1} onClick={() => setItemCurrentPage(p => p - 1)} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--bg-border)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', cursor: itemCurrentPage === 1 ? 'default' : 'pointer', fontWeight: 800 }}>Prev</button>
                            <span style={{ padding: '8px 16px', fontWeight: 800, color: 'var(--text-primary)' }}>{itemCurrentPage} / {itemsTotalPages}</span>
                            <button disabled={itemCurrentPage === itemsTotalPages} onClick={() => setItemCurrentPage(p => p + 1)} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--bg-border)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', cursor: itemCurrentPage === itemsTotalPages ? 'default' : 'pointer', fontWeight: 800 }}>Next</button>
                        </div>
                    )}
                </div>
            ) : (
                
                /* TAB 2: RECIPES & BOM */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>Menu Recipes (BOM)</h3>
                        <div style={{ position: 'relative', width: '300px' }}>
                            <Search style={{ position: 'absolute', top: '12px', left: '16px', color: 'var(--text-muted)' }} size={16} />
                            <input 
                                placeholder="Search Menu Product..."
                                value={menuSearchQuery}
                                onChange={(e) => { setMenuSearchQuery(e.target.value); setMenuCurrentPage(1); }}
                                style={{ width: '100%', backgroundColor: 'var(--bg-card)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', padding: '10px 16px 10px 44px', borderRadius: '8px', outline: 'none', fontWeight: 600, fontSize: '14px', boxSizing: 'border-box' }}
                            />
                        </div>
                    </div>

                    <div style={{ overflowX: 'auto', borderRadius: '16px', border: '1px solid var(--bg-border)', backgroundColor: 'var(--bg-card)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                            <thead>
                                <tr style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
                                    <th style={{ padding: '16px', borderBottom: '2px solid var(--bg-border)', color: 'var(--text-muted)', fontWeight: 800 }}>Menu Product</th>
                                    <th style={{ padding: '16px', borderBottom: '2px solid var(--bg-border)', color: 'var(--text-muted)', fontWeight: 800 }}>Base Selling Price</th>
                                    <th style={{ padding: '16px', borderBottom: '2px solid var(--bg-border)', color: 'var(--text-muted)', fontWeight: 800 }}>Recipe Mapped Ingredients</th>
                                    <th style={{ padding: '16px', borderBottom: '2px solid var(--bg-border)', color: 'var(--text-muted)', fontWeight: 800 }}>Status</th>
                                    <th style={{ padding: '16px', borderBottom: '2px solid var(--bg-border)', color: 'var(--text-muted)', fontWeight: 800, textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedMenuItems.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>
                                            No matching menu products found.
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedMenuItems.map(menuItem => {
                                        const linkedRecipe = recipes.find(r => r.product_id === menuItem.id);
                                        
                                        return (
                                            <tr key={menuItem.id} style={{ borderBottom: '1px solid var(--border-rgba-05)', transition: 'background-color 0.2s' }} onMouseOver={e => e.currentTarget.style.backgroundColor = 'var(--bg-base)'} onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                <td style={{ padding: '16px', fontWeight: 700 }}>{menuItem.name}</td>
                                                <td style={{ padding: '16px', fontWeight: 800, color: '#10b981' }}>₹{parseFloat(menuItem.price).toFixed(2)}</td>
                                                <td style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: 600 }}>
                                                    {linkedRecipe ? (
                                                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                                            Recipe active ({linkedRecipe.ingredients?.length || 0} ingredients mapped)
                                                        </span>
                                                    ) : (
                                                        <span style={{ fontStyle: 'italic', fontSize: '13px' }}>No ingredients linked</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '16px' }}>
                                                    <span style={{ 
                                                        padding: '4px 8px', 
                                                        borderRadius: '6px', 
                                                        fontSize: '11px', 
                                                        fontWeight: 900, 
                                                        textTransform: 'uppercase', 
                                                        backgroundColor: linkedRecipe ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', 
                                                        color: linkedRecipe ? '#10b981' : '#f59e0b' 
                                                    }}>
                                                        {linkedRecipe ? 'Active BOM' : 'Needs Setup'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '16px', textAlign: 'right' }}>
                                                    <button 
                                                        onClick={() => openRecipeModal(menuItem)}
                                                        style={{ padding: '8px 16px', border: 'none', borderRadius: '8px', backgroundColor: linkedRecipe ? 'var(--bg-border)' : '#0ea5e9', color: linkedRecipe ? 'var(--text-primary)' : 'white', cursor: 'pointer', fontWeight: 800, fontSize: '13px' }}
                                                    >
                                                        {linkedRecipe ? 'Edit Recipe / BOM' : 'Configure Recipe'}
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {menuTotalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                            <button disabled={menuCurrentPage === 1} onClick={() => setMenuCurrentPage(p => p - 1)} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--bg-border)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', cursor: menuCurrentPage === 1 ? 'default' : 'pointer', fontWeight: 800 }}>Prev</button>
                            <span style={{ padding: '8px 16px', fontWeight: 800, color: 'var(--text-primary)' }}>{menuCurrentPage} / {menuTotalPages}</span>
                            <button disabled={menuCurrentPage === menuTotalPages} onClick={() => setMenuCurrentPage(p => p + 1)} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--bg-border)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', cursor: menuCurrentPage === menuTotalPages ? 'default' : 'pointer', fontWeight: 800 }}>Next</button>
                        </div>
                    )}
                </div>
            )}

            {/* MODAL 1: ADD / EDIT RAW MATERIAL */}
            {showItemModal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', backdropFilter: 'blur(8px)' }} onClick={() => setShowItemModal(false)}>
                    <div style={{ backgroundColor: 'var(--bg-card)', padding: '36px', borderRadius: '32px', width: '90%', maxWidth: '460px', display: 'flex', flexDirection: 'column', gap: '24px', border: '1px solid var(--bg-border)', boxShadow: '0 30px 60px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 900, color: 'var(--text-primary)' }}>
                                {editingItem ? 'Edit Raw Ingredient' : 'Add Raw Material'}
                            </h3>
                            <button onClick={() => setShowItemModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20}/></button>
                        </div>

                        <form onSubmit={handleSaveItem} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Ingredient Name</label>
                                <input 
                                    type="text" 
                                    value={itemName} 
                                    onChange={e => setItemName(e.target.value)} 
                                    placeholder="e.g. Rice, Chicken, Cooking Oil"
                                    required
                                    style={{ padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--bg-border)', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', fontWeight: 700, outline: 'none' }}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Measurement Unit</label>
                                    <select 
                                        value={itemUnit} 
                                        onChange={e => setItemUnit(e.target.value)} 
                                        style={{ padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--bg-border)', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', fontWeight: 700, outline: 'none' }}
                                    >
                                        <option value="KG">Kilogram (KG)</option>
                                        <option value="Gram">Gram (g)</option>
                                        <option value="Litre">Litre (L)</option>
                                        <option value="ML">Millilitre (ML)</option>
                                        <option value="Piece">Piece (pc)</option>
                                        <option value="Packet">Packet (pkt)</option>
                                        <option value="Bottle">Bottle (btl)</option>
                                    </select>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Initial Stock Level</label>
                                    <input 
                                        type="number" 
                                        step="any"
                                        value={itemStock} 
                                        onChange={e => setItemStock(e.target.value)} 
                                        disabled={!!editingItem} // stock adjustments should be logged separately
                                        style={{ padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--bg-border)', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', fontWeight: 700, outline: 'none' }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Safety Alert Min</label>
                                    <input 
                                        type="number" 
                                        step="any"
                                        value={itemMinStock} 
                                        onChange={e => setItemMinStock(e.target.value)} 
                                        style={{ padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--bg-border)', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', fontWeight: 700, outline: 'none' }}
                                    />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Purchase Rate (₹)</label>
                                    <input 
                                        type="number" 
                                        step="any"
                                        value={itemRate} 
                                        onChange={e => setItemRate(e.target.value)} 
                                        style={{ padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--bg-border)', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', fontWeight: 700, outline: 'none' }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
                                <button 
                                    type="button" 
                                    onClick={() => setShowItemModal(false)}
                                    style={{ padding: '12px 20px', borderRadius: '12px', border: 'none', cursor: 'pointer', backgroundColor: 'var(--bg-border)', color: 'var(--text-secondary)', fontWeight: 800 }}
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    style={{ padding: '12px 24px', borderRadius: '12px', border: 'none', cursor: 'pointer', backgroundColor: '#0ea5e9', color: 'white', fontWeight: 800, boxShadow: '0 4px 12px rgba(14, 165, 233, 0.2)' }}
                                >
                                    Save Ingredient
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL 2: ADJUST STOCK LEVEL */}
            {showAdjustModal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', backdropFilter: 'blur(8px)' }} onClick={() => setShowAdjustModal(false)}>
                    <div style={{ backgroundColor: 'var(--bg-card)', padding: '36px', borderRadius: '32px', width: '90%', maxWidth: '440px', display: 'flex', flexDirection: 'column', gap: '24px', border: '1px solid var(--bg-border)', boxShadow: '0 30px 60px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 900, color: 'var(--text-primary)' }}>Adjust Stock Level</h3>
                            <button onClick={() => setShowAdjustModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20}/></button>
                        </div>

                        <form onSubmit={handleAdjustStock} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Select Ingredient</label>
                                <select 
                                    value={selectedAdjustItemId} 
                                    onChange={e => setSelectedAdjustItemId(e.target.value)} 
                                    style={{ padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--bg-border)', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', fontWeight: 700, outline: 'none' }}
                                >
                                    {items.map(item => (
                                        <option key={item.id} value={item.id}>{item.name} (Current: {item.current_stock} {item.unit})</option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>New Physical Stock Quantity</label>
                                <input 
                                    type="number" 
                                    step="any"
                                    value={adjustQty} 
                                    onChange={e => setAdjustQty(e.target.value)} 
                                    placeholder="Enter actual stock level audited"
                                    required
                                    style={{ padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--bg-border)', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', fontWeight: 700, outline: 'none' }}
                                />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Audit Notes / Remarks</label>
                                <input 
                                    type="text" 
                                    value={adjustRemarks} 
                                    onChange={e => setAdjustRemarks(e.target.value)} 
                                    placeholder="e.g. Monthly Physical stock verification"
                                    style={{ padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--bg-border)', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', fontWeight: 700, outline: 'none' }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
                                <button 
                                    type="button" 
                                    onClick={() => setShowAdjustModal(false)}
                                    style={{ padding: '12px 20px', borderRadius: '12px', border: 'none', cursor: 'pointer', backgroundColor: 'var(--bg-border)', color: 'var(--text-secondary)', fontWeight: 800 }}
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    style={{ padding: '12px 24px', borderRadius: '12px', border: 'none', cursor: 'pointer', backgroundColor: '#0ea5e9', color: 'white', fontWeight: 800, boxShadow: '0 4px 12px rgba(14, 165, 233, 0.2)' }}
                                >
                                    Save Adjustment
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL 3: CONFIGURE RECIPE / BOM */}
            {showRecipeModal && selectedMenuItem && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', backdropFilter: 'blur(8px)' }} onClick={() => setShowRecipeModal(false)}>
                    <div style={{ backgroundColor: 'var(--bg-card)', padding: '36px', borderRadius: '32px', width: '90%', maxWidth: '600px', maxHeight: '85vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px', border: '1px solid var(--bg-border)', boxShadow: '0 30px 60px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 900, color: 'var(--text-primary)' }}>Configure Recipe (BOM)</h3>
                                <p style={{ color: 'var(--text-muted)', fontSize: '13px', fontWeight: 700, margin: '4px 0 0 0' }}>Define raw ingredients for product: <span style={{ color: '#0ea5e9' }}>{selectedMenuItem.name}</span></p>
                            </div>
                            <button onClick={() => setShowRecipeModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20}/></button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Mapped Ingredients List</label>
                                <button 
                                    onClick={addIngredientRow}
                                    style={{ padding: '6px 12px', border: 'none', borderRadius: '6px', backgroundColor: 'rgba(14, 165, 233, 0.1)', color: '#0ea5e9', cursor: 'pointer', fontWeight: 800, fontSize: '12px' }}
                                >
                                    + Add Ingredient Row
                                </button>
                            </div>

                            {recipeIngredients.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '32px', border: '2px dashed var(--bg-border)', borderRadius: '16px', color: 'var(--text-muted)', fontSize: '13px', fontWeight: 600 }}>
                                    No ingredients added. Click "+ Add Ingredient Row" to build the bill of materials.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {recipeIngredients.map((row, index) => {
                                        const selectedItemObj = items.find(i => String(i.id) === String(row.inventory_item_id));
                                        
                                        return (
                                            <div key={index} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                                
                                                {/* Ingredient select */}
                                                <select 
                                                    value={row.inventory_item_id}
                                                    onChange={e => updateIngredientRow(index, 'inventory_item_id', e.target.value)}
                                                    style={{ flex: 2, padding: '12px', borderRadius: '12px', border: '1px solid var(--bg-border)', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', fontWeight: 700, fontSize: '14px', outline: 'none' }}
                                                >
                                                    <option value="">Choose Raw Ingredient...</option>
                                                    {items.map(item => (
                                                        <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>
                                                    ))}
                                                </select>

                                                {/* Quantity required input with unit dropdown */}
                                                <div style={{ flex: 1.5, display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'var(--bg-base)', padding: '0 12px', borderRadius: '12px', border: '1px solid var(--bg-border)' }}>
                                                    <input 
                                                        type="number"
                                                        step="any"
                                                        value={row.quantity_required}
                                                        placeholder="Qty"
                                                        onChange={e => updateIngredientRow(index, 'quantity_required', e.target.value)}
                                                        style={{ width: '100%', padding: '12px 0', border: 'none', background: 'none', color: 'var(--text-primary)', fontWeight: 700, fontSize: '14px', outline: 'none' }}
                                                    />
                                                    {selectedItemObj && (
                                                        ['kg', 'gram', 'g', 'gm', 'grams'].includes(selectedItemObj.unit.toLowerCase()) ? (
                                                            <select
                                                                value={row.unit}
                                                                onChange={e => updateIngredientRow(index, 'unit', e.target.value)}
                                                                style={{ border: '1px solid var(--bg-border)', backgroundColor: 'var(--bg-card)', padding: '4px 8px', borderRadius: '8px', color: 'var(--text-primary)', fontWeight: 800, fontSize: '12px', cursor: 'pointer', outline: 'none' }}
                                                            >
                                                                <option value="KG">KG</option>
                                                                <option value="Gram">Gram</option>
                                                            </select>
                                                        ) : ['litre', 'l', 'ml', 'litres'].includes(selectedItemObj.unit.toLowerCase()) ? (
                                                            <select
                                                                value={row.unit}
                                                                onChange={e => updateIngredientRow(index, 'unit', e.target.value)}
                                                                style={{ border: '1px solid var(--bg-border)', backgroundColor: 'var(--bg-card)', padding: '4px 8px', borderRadius: '8px', color: 'var(--text-primary)', fontWeight: 800, fontSize: '12px', cursor: 'pointer', outline: 'none' }}
                                                            >
                                                                <option value="Litre">Litre</option>
                                                                <option value="ML">ML</option>
                                                            </select>
                                                        ) : (
                                                            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)' }}>
                                                                {selectedItemObj.unit}
                                                            </span>
                                                        )
                                                    )}
                                                </div>

                                                {/* Delete row */}
                                                <button 
                                                    onClick={() => removeIngredientRow(index)}
                                                    style={{ padding: '10px', borderRadius: '12px', border: 'none', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', cursor: 'pointer' }}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
                            <button 
                                type="button" 
                                onClick={() => setShowRecipeModal(false)}
                                style={{ padding: '12px 20px', borderRadius: '12px', border: 'none', cursor: 'pointer', backgroundColor: 'var(--bg-border)', color: 'var(--text-secondary)', fontWeight: 800 }}
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleSaveRecipe}
                                style={{ padding: '12px 24px', borderRadius: '12px', border: 'none', cursor: 'pointer', backgroundColor: '#10b981', color: 'white', fontWeight: 800, boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)' }}
                            >
                                Save Recipe BOM
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Spinner keyframe styling */}
            <style>{`
                @keyframes spin { 
                    0% { transform: rotate(0deg); } 
                    100% { transform: rotate(360deg); } 
                }
            `}</style>
        </div>
    );
};

export default InventoryManagement;
