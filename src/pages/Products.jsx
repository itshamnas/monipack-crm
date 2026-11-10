import React, { useState, useMemo } from 'react';
import { 
  Package, 
  Plus, 
  Search, 
  Tag, 
  Check, 
  Sparkles, 
  Filter, 
  Upload, 
  FileSpreadsheet,
  Edit2,
  Trash2,
  CheckSquare,
  Square,
  LayoutGrid,
  Table as TableIcon,
  AlertTriangle,
  X,
  Layers,
  DollarSign
} from 'lucide-react';
import ProductImportModal from '../components/ProductImportModal';

export const DEFAULT_BRANDS = ['Monipack', 'Moniclean', 'Monifood', 'Kohe'];

export default function Products({ 
  products, 
  categories, 
  onAddProduct, 
  onUpdateProduct, 
  onDeleteProduct, 
  onBulkDeleteProducts, 
  onRefresh, 
  token, 
  showToast,
  canManage = true,
}) {
  const [selectedBrand, setSelectedBrand] = useState('All Brands');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'table'
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [deletingLoading, setDeletingLoading] = useState(false);

  // Active categories list
  const activeCategories = useMemo(() => {
    return Array.isArray(categories) && categories.length > 0
      ? categories
      : ['Packaging Products', 'Disposable Products', 'Kohe Products', 'Cleaning Products', 'Food Products'];
  }, [categories]);

  // Dynamically extract all brands present across products + defaults
  const availableBrands = useMemo(() => {
    const brandSet = new Set(DEFAULT_BRANDS);
    (products || []).forEach((p) => {
      if (p.brand && typeof p.brand === 'string' && p.brand.trim()) {
        brandSet.add(p.brand.trim());
      }
    });
    return ['All Brands', ...Array.from(brandSet).sort()];
  }, [products]);

  // New product form
  const [newProd, setNewProd] = useState({
    name: '',
    nameAr: '',
    sku: '',
    category: 'Packaging Products',
    brand: 'Monipack',
    unit: 'CTN',
    priceOMR: '',
    stock: 100,
    description: '',
  });

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (selectedBrand !== 'All Brands' && p.brand !== selectedBrand) return false;
      if (selectedCategory !== 'All Categories' && p.category !== selectedCategory) return false;
      if (search) {
        const q = search.toLowerCase();
        const match =
          p.name.toLowerCase().includes(q) ||
          (p.nameAr && p.nameAr.includes(q)) ||
          p.sku.toLowerCase().includes(q) ||
          (p.category && p.category.toLowerCase().includes(q)) ||
          (p.description && p.description.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [products, selectedBrand, selectedCategory, search]);

  // Selection handlers
  const handleToggleSelect = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredProducts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredProducts.map(p => p.id));
    }
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
  };

  // Add Product
  const handleCreateProduct = async (e) => {
    e.preventDefault();
    if (!newProd.name.trim()) return;

    if (onAddProduct) {
      await onAddProduct({
        ...newProd,
        priceOMR: Number(newProd.priceOMR) || 0,
        stock: Number(newProd.stock) || 0,
      });
    }

    setIsModalOpen(false);
    setNewProd({
      name: '',
      nameAr: '',
      sku: '',
      category: 'Packaging Products',
      brand: 'Monipack',
      unit: 'CTN',
      priceOMR: '',
      stock: 100,
      description: '',
    });
  };

  // Edit Product Submit
  const handleSaveEditProduct = async (e) => {
    e.preventDefault();
    if (!editingProduct || !editingProduct.name.trim()) return;

    try {
      if (onUpdateProduct) {
        await onUpdateProduct(editingProduct.id, {
          ...editingProduct,
          priceOMR: Number(editingProduct.priceOMR) || 0,
          stock: Number(editingProduct.stock) || 0,
        });
      }
      setEditingProduct(null);
    } catch (err) {
      console.error(err);
      alert('Failed to update product.');
    }
  };

  // Delete Single Product
  const handleDeleteSingle = async (p) => {
    const confirm = window.confirm(`Are you sure you want to delete "${p.name}" (${p.sku}) from the catalog?`);
    if (!confirm) return;

    try {
      if (onDeleteProduct) {
        await onDeleteProduct(p.id);
      }
      setSelectedIds(prev => prev.filter(id => id !== p.id));
    } catch (err) {
      console.error(err);
      alert('Error deleting product.');
    }
  };

  // Bulk Delete Selected Products
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const confirm = window.confirm(`Are you sure you want to permanently delete ${selectedIds.length} selected products?`);
    if (!confirm) return;

    setDeletingLoading(true);
    try {
      if (onBulkDeleteProducts) {
        await onBulkDeleteProducts(selectedIds);
      }
      setSelectedIds([]);
    } catch (err) {
      console.error(err);
      alert('Error deleting selected products.');
    } finally {
      setDeletingLoading(false);
    }
  };

  const isAllSelected = filteredProducts.length > 0 && selectedIds.length === filteredProducts.length;

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 max-w-7xl mx-auto pb-24 md:pb-8">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Product Catalog</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200">
              {filteredProducts.length} Items
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Browse, manage, edit, and organize packaging supplies, chemical detergents, and Kohe cutlery.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* View Mode Toggle */}
          <div className="flex bg-slate-200/80 p-0.5 rounded-lg border border-slate-300">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition ${viewMode === 'grid' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'}`}
              title="Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md transition ${viewMode === 'table' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'}`}
              title="Table View"
            >
              <TableIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          {canManage && (<>
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold rounded-lg border border-slate-300 shadow-2xs transition active:scale-95"
          >
            <Upload className="w-3.5 h-3.5 text-red-600" />
            <span className="hidden xs:inline">Import</span><span className="xs:hidden">CSV</span>
          </button>

          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg shadow-sm shadow-red-900/30 transition active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Product</span>
          </button>
          </>)}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* Brand Tabs (scrollable chips on mobile) */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 max-w-full">
          {availableBrands.map((b) => (
            <button
              key={b}
              onClick={() => setSelectedBrand(b)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                selectedBrand === b
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {b === 'Monipack' ? (
                <span className="font-monipack lowercase text-xs">monipack</span>
              ) : (
                b
              )}
            </button>
          ))}
        </div>

        {/* Category Filter & Search */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 font-semibold focus:bg-white focus:outline-none focus:ring-1 focus:ring-red-500 cursor-pointer"
          >
            <option value="All Categories">All Categories</option>
            {activeCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {(selectedBrand !== 'All Brands' || selectedCategory !== 'All Categories' || search) && (
            <button
              type="button"
              onClick={() => {
                setSelectedBrand('All Brands');
                setSelectedCategory('All Categories');
                setSearch('');
              }}
              className="text-xs text-[#CC1A22] hover:text-red-700 font-bold px-1.5 py-1 cursor-pointer"
            >
              Reset
            </button>
          )}

          {/* Search */}
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search SKU or product..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 focus:bg-white focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>
        </div>
      </div>

      {/* Floating Selection Action Bar */}
      {canManage && selectedIds.length > 0 && (
        <div className="bg-slate-900 text-white p-3.5 rounded-xl shadow-lg flex items-center justify-between animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <span className="w-7 h-7 rounded-lg bg-red-600 text-white font-bold text-xs flex items-center justify-center">
              {selectedIds.length}
            </span>
            <span className="text-xs font-bold">
              {selectedIds.length} product{selectedIds.length > 1 ? 's' : ''} selected
            </span>
            <button
              onClick={handleClearSelection}
              className="text-xs text-slate-400 hover:text-white underline ml-2 transition"
            >
              Deselect All
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkDelete}
              disabled={deletingLoading}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition active:scale-95"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected ({selectedIds.length})</span>
            </button>
          </div>
        </div>
      )}

      {/* Select All Checkbox Header for Table / Grid */}
      <div className="flex items-center justify-between px-1 text-xs text-slate-500">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isAllSelected}
            onChange={handleSelectAll}
            className="rounded text-red-600 focus:ring-red-500 w-4 h-4 cursor-pointer"
          />
          <span className="font-semibold text-slate-700">Select All ({filteredProducts.length} Items)</span>
        </label>
        {selectedIds.length > 0 && (
          <span className="text-red-600 font-bold">{selectedIds.length} of {filteredProducts.length} checked</span>
        )}
      </div>

      {/* GRID VIEW */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          {filteredProducts.map((p) => {
            const isSelected = selectedIds.includes(p.id);

            return (
              <div
                key={p.id}
                className={`bg-white rounded-xl p-5 border shadow-2xs hover:shadow-md transition-all flex flex-col justify-between relative ${
                  isSelected ? 'border-red-500 ring-2 ring-red-500/20 bg-red-50/10' : 'border-slate-200'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(p.id)}
                        className="rounded text-red-600 focus:ring-red-500 w-4 h-4 cursor-pointer"
                      />
                      <span className="font-mono text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                        {p.sku}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                          p.brand === 'Monipack'
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : p.brand === 'Moniclean'
                            ? 'bg-cyan-50 text-cyan-700 border border-cyan-200'
                            : p.brand === 'Monifood'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {p.brand === 'Monipack' ? (
                          <span className="font-monipack lowercase text-[11px]">monipack</span>
                        ) : (
                          p.brand
                        )}
                      </span>
                    </div>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 leading-snug">{p.name}</h3>
                  {p.nameAr && (
                    <p className="text-xs text-slate-500 font-cairo mt-0.5 leading-snug">{p.nameAr}</p>
                  )}

                  <p className="text-xs text-slate-500 mt-2 line-clamp-2 leading-relaxed">
                    {p.description || 'Standard commercial wholesale packaging supply.'}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-semibold text-slate-400 block">Unit: {p.unit}</span>
                    <span className="text-sm font-black text-red-700 font-mono">
                      OMR {Number(p.priceOMR).toFixed(3)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-2 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-md">
                      Stock: {p.stock}
                    </span>

                    {/* Quick Action Buttons (only for roles that manage the catalog) */}
                    {canManage && (<>
                    <button
                      onClick={() => setEditingProduct({ ...p })}
                      className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-md transition"
                      title="Edit Product"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteSingle(p)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition"
                      title="Delete Product"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    </>)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TABLE VIEW */}
      {viewMode === 'table' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={handleSelectAll}
                      className="rounded text-red-600 focus:ring-red-500 w-4 h-4 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-3">SKU</th>
                  <th className="py-3 px-3">Product Name</th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-3">Brand</th>
                  <th className="py-3 px-3">Unit</th>
                  <th className="py-3 px-3 text-right">Price (OMR)</th>
                  <th className="py-3 px-3 text-right">Stock</th>
                  <th className="py-3 px-3 text-center w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredProducts.map((p) => {
                  const isSelected = selectedIds.includes(p.id);

                  return (
                    <tr 
                      key={p.id} 
                      className={`hover:bg-slate-50/80 transition ${isSelected ? 'bg-red-50/20' : ''}`}
                    >
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(p.id)}
                          className="rounded text-red-600 focus:ring-red-500 w-4 h-4 cursor-pointer"
                        />
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800 text-[11px]">
                        {p.sku}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-bold text-slate-900 block">{p.name}</span>
                        {p.nameAr && <span className="text-[10px] text-slate-400 block font-cairo">{p.nameAr}</span>}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-medium border border-slate-200">
                          {p.category}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800">
                        {p.brand}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 font-mono">
                        {p.unit}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-red-700">
                        {Number(p.priceOMR).toFixed(3)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded font-semibold text-[11px]">
                          {p.stock}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {canManage && (<>
                          <button
                            onClick={() => setEditingProduct({ ...p })}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded transition"
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteSingle(p)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          </>)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 mp-overlay bg-slate-900/60 backdrop-blur-xs flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-auto my-3 sm:my-6">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-red-400" />
                <h3 className="text-sm font-bold">Edit Product: {editingProduct.sku}</h3>
              </div>
              <button aria-label="Close"
                onClick={() => setEditingProduct(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSaveEditProduct} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Product Title (English) *
                </label>
                <input
                  type="text"
                  required
                  value={editingProduct.name}
                  onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:border-red-500 font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Product Title (Arabic)
                </label>
                <input
                  type="text"
                  value={editingProduct.nameAr || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, nameAr: e.target.value })}
                  className="w-full text-xs font-cairo border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">SKU / Code</label>
                  <input
                    type="text"
                    value={editingProduct.sku}
                    onChange={(e) => setEditingProduct({ ...editingProduct, sku: e.target.value })}
                    className="w-full text-xs font-mono font-bold border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:border-red-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Brand (Select or Type Brand)</label>
                  <input
                    type="text"
                    list="edit-product-brand-list"
                    value={editingProduct.brand || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, brand: e.target.value })}
                    placeholder="e.g. Monipack, Hotpack, Falcon..."
                    className="w-full text-xs font-semibold border border-slate-300 rounded-lg p-2.5 bg-white focus:outline-none focus:border-red-500"
                  />
                  <datalist id="edit-product-brand-list">
                    {availableBrands.filter((b) => b !== 'All Brands').map((b) => (
                      <option key={b} value={b} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category *</label>
                  <select
                    value={editingProduct.category}
                    onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value })}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-white font-medium"
                  >
                    {(() => {
                      const cats = [...activeCategories];
                      if (editingProduct.category && !cats.includes(editingProduct.category)) {
                        cats.push(editingProduct.category);
                      }
                      return cats.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ));
                    })()}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Unit (UOM)</label>
                  <input
                    type="text"
                    value={editingProduct.unit}
                    onChange={(e) => setEditingProduct({ ...editingProduct, unit: e.target.value })}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2.5"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Price (OMR) *</label>
                  <input
                    type="number"
                    step="0.001"
                    required
                    value={editingProduct.priceOMR}
                    onChange={(e) => setEditingProduct({ ...editingProduct, priceOMR: e.target.value })}
                    className="w-full text-xs font-mono font-bold text-red-700 border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Current Stock Balance</label>
                <input
                  type="number"
                  value={editingProduct.stock}
                  onChange={(e) => setEditingProduct({ ...editingProduct, stock: e.target.value })}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Specifications & Description
                </label>
                <textarea
                  rows="3"
                  value={editingProduct.description || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:border-red-500"
                ></textarea>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 shadow-sm transition active:scale-95"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Product Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 mp-overlay bg-slate-900/60 backdrop-blur-xs flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-auto my-3 sm:my-6">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold">Add Product to Catalog</h3>
              <button aria-label="Close"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleCreateProduct} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Product Title (English) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Single Wall Kraft Cups 4oz"
                  value={newProd.name}
                  onChange={(e) => setNewProd({ ...newProd, name: e.target.value })}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Product Title (Arabic)
                </label>
                <input
                  type="text"
                  placeholder="e.g. أكواب كرافت 4 أونصة"
                  value={newProd.nameAr}
                  onChange={(e) => setNewProd({ ...newProd, nameAr: e.target.value })}
                  className="w-full text-xs font-cairo border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Brand (Select or Type Brand)</label>
                  <input
                    type="text"
                    list="new-product-brand-list"
                    value={newProd.brand}
                    onChange={(e) => setNewProd({ ...newProd, brand: e.target.value })}
                    placeholder="e.g. Monipack, Hotpack, Falcon..."
                    className="w-full text-xs font-semibold border border-slate-300 rounded-lg p-2.5 bg-white focus:outline-none focus:border-red-500"
                  />
                  <datalist id="new-product-brand-list">
                    {availableBrands.filter((b) => b !== 'All Brands').map((b) => (
                      <option key={b} value={b} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category *</label>
                  <select
                    value={newProd.category}
                    onChange={(e) => setNewProd({ ...newProd, category: e.target.value })}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-white font-medium"
                  >
                    {activeCategories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">SKU (Optional)</label>
                  <input
                    type="text"
                    placeholder="Auto-generated"
                    value={newProd.sku}
                    onChange={(e) => setNewProd({ ...newProd, sku: e.target.value })}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2.5"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Unit</label>
                  <input
                    type="text"
                    value={newProd.unit}
                    onChange={(e) => setNewProd({ ...newProd, unit: e.target.value })}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2.5"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Price (OMR) *</label>
                  <input
                    type="number"
                    step="0.001"
                    required
                    placeholder="0.000"
                    value={newProd.priceOMR}
                    onChange={(e) => setNewProd({ ...newProd, priceOMR: e.target.value })}
                    className="w-full text-xs font-mono font-bold text-red-700 border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Opening Stock</label>
                <input
                  type="number"
                  value={newProd.stock}
                  onChange={(e) => setNewProd({ ...newProd, stock: e.target.value })}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Specifications & Description
                </label>
                <textarea
                  rows="3"
                  placeholder="Material specs, carton dimensions, or usage..."
                  value={newProd.description}
                  onChange={(e) => setNewProd({ ...newProd, description: e.target.value })}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:border-red-500"
                ></textarea>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 shadow-sm transition active:scale-95"
                >
                  Save Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Product Catalog CSV Import Modal */}
      <ProductImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        token={token}
        showToast={showToast}
        onImportSuccess={() => {
          if (onRefresh) onRefresh();
        }}
      />

    </div>
  );
}
