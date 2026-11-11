import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  FileText, 
  Plus, 
  Printer, 
  Trash2, 
  Check, 
  Search, 
  Eye, 
  Download, 
  Sparkles,
  ArrowRight,
  Building,
  User,
  MapPin,
  Calendar,
  DollarSign,
  ShoppingBag,
  Filter,
  CheckSquare,
  Square,
  Percent,
  ChevronDown,
  X,
  Tag,
  Package,
  Layers,
  Share2,
  Pencil
} from 'lucide-react';
import PrintQuotation from '../components/PrintQuotation.jsx';
import QuoteStatus, { effectiveQuoteStatus, QUOTE_STATUS } from '../components/QuoteStatus.jsx';

export const DEFAULT_TERMS = [
  'All prices are quoted in Omani Rial (OMR).',
  'Quotation validity: 30 days from date of issue.',
  'Payment terms: As per agreed commercial credit terms.',
  'Delivery: Fast delivery across all Oman Wilayats upon confirmed PO.',
];

/**
 * In-Line Smart Product Combobox for Quotation Item Rows
 * Features instant search across Name (EN/AR), SKU, Brand, Category with badge highlights.
 */
function ProductCombobox({ products, selectedProductId, onSelect, onClear }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef(null);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId),
    [products, selectedProductId]
  );

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return products.slice(0, 30);
    const q = searchTerm.toLowerCase();
    return products
      .filter((p) => {
        return (
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.nameAr && p.nameAr.toLowerCase().includes(q)) ||
          (p.sku && p.sku.toLowerCase().includes(q)) ||
          (p.brand && p.brand.toLowerCase().includes(q)) ||
          (p.category && p.category.toLowerCase().includes(q))
        );
      })
      .slice(0, 30);
  }, [products, searchTerm]);

  return (
    <div className="relative w-full" ref={wrapperRef}>
      {selectedProduct ? (
        <div className="flex items-center justify-between bg-slate-100/90 hover:bg-slate-200/80 border border-slate-300 rounded px-2 py-1 text-xs transition">
          <div className="flex items-center gap-1.5 overflow-hidden">
            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-200 text-slate-800 flex-shrink-0">
              {selectedProduct.brand || 'Item'}
            </span>
            <span className="truncate font-semibold text-slate-900" title={selectedProduct.name}>
              {selectedProduct.name}
            </span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
              setSearchTerm('');
            }}
            className="p-0.5 text-slate-400 hover:text-red-600 rounded cursor-pointer"
            title="Clear & Search Another"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <div>
          <div className="relative flex items-center">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              placeholder="Search product, SKU, brand..."
              className="w-full text-xs bg-slate-50 border border-slate-300 rounded pl-7 pr-2 py-1 focus:bg-white focus:outline-none focus:ring-1 focus:ring-red-500"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 pointer-events-none" />
          </div>

          {isOpen && (
            <div className="absolute left-0 top-full mt-1 w-80 max-h-56 overflow-y-auto bg-white rounded-lg shadow-xl border border-slate-200 z-50 divide-y divide-slate-100">
              {filteredProducts.length > 0 ? (
                filteredProducts.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => {
                      onSelect(p);
                      setIsOpen(false);
                      setSearchTerm('');
                    }}
                    className="p-2 hover:bg-red-50/60 cursor-pointer transition text-left"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold text-slate-900 text-xs truncate">
                        {p.name}
                      </span>
                      <span className="font-mono font-bold text-red-700 text-xs flex-shrink-0">
                        OMR {Number(p.priceOMR || 0).toFixed(3)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
                      <span className="px-1.5 py-0.2 rounded bg-slate-100 font-semibold text-slate-700">
                        {p.brand === 'Monipack' ? (
                          <span className="font-monipack lowercase text-[11px]">monipack</span>
                        ) : (
                          p.brand || 'General'
                        )}
                      </span>
                      {p.sku && <span className="font-mono text-slate-400">{p.sku}</span>}
                      <span>Unit: {p.unit || 'PCS'}</span>
                      {p.stock !== undefined && (
                        <span className="text-slate-400">Stock: {p.stock}</span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-3 text-center text-xs text-slate-400">
                  No catalog products found. You can still type custom details directly into the row!
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Dedicated Catalog Quick-Picker Modal
 * Supports all dynamic commercial brands, multi-item batch selection, and quantity adjustment.
 */
function CatalogQuickPickerModal({ isOpen, onClose, products, categories, onAddProducts }) {
  const [search, setSearch] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('All Brands');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [selectedItems, setSelectedItems] = useState({}); // { [prodId]: { product, quantity } }

  // Extract all unique brands dynamically
  const availableBrands = useMemo(() => {
    const set = new Set();
    products.forEach((p) => {
      if (p.brand && typeof p.brand === 'string' && p.brand.trim()) {
        set.add(p.brand.trim());
      }
    });
    ['Monipack', 'Moniclean', 'Monifood', 'Kohe'].forEach((b) => set.add(b));
    return ['All Brands', ...Array.from(set).sort()];
  }, [products]);

  // Extract all unique categories dynamically
  const availableCategories = useMemo(() => {
    const set = new Set();
    if (Array.isArray(categories)) {
      categories.forEach((c) => {
        if (c && typeof c === 'string' && c.trim()) set.add(c.trim());
      });
    }
    products.forEach((p) => {
      if (p.category && typeof p.category === 'string' && p.category.trim()) {
        set.add(p.category.trim());
      }
    });
    return ['All Categories', ...Array.from(set).sort()];
  }, [products, categories]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (selectedBrand !== 'All Brands' && p.brand !== selectedBrand) return false;
      if (selectedCategory !== 'All Categories' && p.category !== selectedCategory) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const match =
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.nameAr && p.nameAr.toLowerCase().includes(q)) ||
          (p.sku && p.sku.toLowerCase().includes(q)) ||
          (p.brand && p.brand.toLowerCase().includes(q)) ||
          (p.category && p.category.toLowerCase().includes(q)) ||
          (p.description && p.description.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [products, selectedBrand, selectedCategory, search]);

  const toggleSelect = (prod) => {
    setSelectedItems((prev) => {
      const copy = { ...prev };
      if (copy[prod.id]) {
        delete copy[prod.id];
      } else {
        copy[prod.id] = { product: prod, quantity: 1 };
      }
      return copy;
    });
  };

  const updateQuantity = (prodId, delta) => {
    setSelectedItems((prev) => {
      if (!prev[prodId]) return prev;
      const newQty = Math.max(1, (prev[prodId].quantity || 1) + delta);
      return {
        ...prev,
        [prodId]: { ...prev[prodId], quantity: newQty },
      };
    });
  };

  const selectedCount = Object.keys(selectedItems).length;

  const handleApply = () => {
    const itemsToAdd = Object.values(selectedItems).map(({ product, quantity }) => ({
      productId: product.id,
      item: product.name,
      description: product.description || '',
      quantity,
      unit: product.unit || 'PCS',
      unitPriceOMR: product.priceOMR || 0,
    }));
    onAddProducts(itemsToAdd);
    setSelectedItems({});
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 mp-overlay bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] sm:max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-red-600" />
              <span>Browse Catalog & Quick-Add Products</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Select products across all commercial brands and insert them directly into your quotation.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters Bar: Search, Dynamic Brands, and Categories */}
        <div className="p-4 border-b border-slate-200 bg-white space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by product name, SKU, keywords..."
                className="w-full text-xs pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
            </div>

            <div className="flex gap-2">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-slate-700 focus:bg-white focus:outline-none"
              >
                {availableCategories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Dynamic Brand Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Brands:</span>
            {availableBrands.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setSelectedBrand(b)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  selectedBrand === b
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
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
        </div>

        {/* Products List Table */}
        <div className="flex-1 overflow-y-auto p-4">
          {filtered.length > 0 ? (
            <div className="border border-slate-200 rounded-xl overflow-x-auto shadow-2xs">
              <table className="w-full min-w-[540px] sm:min-w-0 text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-600 text-[10px] uppercase font-bold tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 w-10 text-center">Select</th>
                    <th className="py-2.5 px-3">Product Name</th>
                    <th className="py-2.5 px-3 w-28">Brand & SKU</th>
                    <th className="py-2.5 px-3 w-20 text-center">Unit</th>
                    <th className="py-2.5 px-3 w-24 text-right">Price (OMR)</th>
                    <th className="py-2.5 px-3 w-32 text-center">Quantity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((prod) => {
                    const isSelected = Boolean(selectedItems[prod.id]);
                    const currentQty = selectedItems[prod.id]?.quantity || 1;

                    return (
                      <tr 
                        key={prod.id} 
                        className={`transition ${isSelected ? 'bg-red-50/50' : 'hover:bg-slate-50/60'}`}
                      >
                        <td className="py-2 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(prod)}
                            className="w-4 h-4 text-red-600 rounded focus:ring-red-500 cursor-pointer"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <div className="font-bold text-slate-900">{prod.name}</div>
                          {prod.nameAr && (
                            <div className="text-[10px] text-slate-500 font-cairo">{prod.nameAr}</div>
                          )}
                          {prod.description && (
                            <div className="text-[11px] text-slate-500 truncate max-w-md">{prod.description}</div>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-200 mb-0.5">
                            {prod.brand || 'General'}
                          </span>
                          {prod.sku && <div className="font-mono text-[10px] text-slate-400">{prod.sku}</div>}
                        </td>
                        <td className="py-2 px-3 text-center font-medium text-slate-700">
                          {prod.unit || 'PCS'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                          {Number(prod.priceOMR || 0).toFixed(3)}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {isSelected ? (
                            <div className="inline-flex items-center border border-slate-300 rounded-lg overflow-hidden bg-white shadow-2xs">
                              <button
                                type="button"
                                onClick={() => updateQuantity(prod.id, -1)}
                                className="px-2 py-0.5 hover:bg-slate-100 text-slate-700 font-bold"
                              >
                                -
                              </button>
                              <span className="px-2 py-0.5 font-bold text-xs w-8 text-center font-mono">
                                {currentQty}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateQuantity(prod.id, 1)}
                                className="px-2 py-0.5 hover:bg-slate-100 text-slate-700 font-bold"
                              >
                                +
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => toggleSelect(prod)}
                              className="text-[11px] font-bold text-slate-600 hover:text-red-700 px-2 py-1 rounded hover:bg-slate-100 transition"
                            >
                              + Select
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-400 space-y-2">
              <Package className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-sm font-semibold">No products match your brand or search filter.</p>
              <p className="text-xs">Try selecting "All Brands" or clearing search terms.</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="text-xs text-slate-600 font-medium">
            {selectedCount > 0 ? (
              <span className="text-slate-900 font-bold">
                {selectedCount} product{selectedCount > 1 ? 's' : ''} selected
              </span>
            ) : (
              <span>Select items to insert into quotation</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={selectedCount === 0}
              className="flex items-center gap-1.5 px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-xs font-bold rounded-lg shadow-sm transition active:scale-95"
            >
              <Check className="w-4 h-4" />
              <span>Add Selected ({selectedCount}) to Quote</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

export default function Quotations({
  quotations,
  products,
  categories,
  leads,
  prefilledLead,
  onClearPrefilledLead,
  onCreateQuotation,
  onUpdateQuotation,
  onDeleteQuotation,
  onRefresh,
  currentUser,
  onSetQuoteStatus,
}) {
  const [activeView, setActiveView] = useState('list'); // 'list' or 'create'
  const [selectedQuotationForPrint, setSelectedQuotationForPrint] = useState(null);
  const [isCatalogPickerOpen, setIsCatalogPickerOpen] = useState(false);
  const [quoteSearchQuery, setQuoteSearchQuery] = useState('');
  const [quoteVatFilter, setQuoteVatFilter] = useState('all'); // 'all', 'with_vat', 'without_vat'
  const [quoteStatusFilter, setQuoteStatusFilter] = useState('all');
  const [editingQuote, setEditingQuote] = useState(null); // the quotation being edited (null = new)
  const canEdit = Boolean(onUpdateQuotation && currentUser?.permissions?.includes('quotations.update'));

  const filteredQuotations = useMemo(() => {
    if (!quotations) return [];
    return quotations.filter((q) => {
      if (quoteSearchQuery) {
        const s = quoteSearchQuery.toLowerCase();
        const match =
          (q.code && q.code.toLowerCase().includes(s)) ||
          (q.customerName && q.customerName.toLowerCase().includes(s)) ||
          (q.address && q.address.toLowerCase().includes(s)) ||
          (q.salesRep && q.salesRep.toLowerCase().includes(s));
        if (!match) return false;
      }
      if (quoteVatFilter === 'with_vat' && q.enableVat === false) return false;
      if (quoteVatFilter === 'without_vat' && q.enableVat !== false) return false;
      if (quoteStatusFilter !== 'all' && effectiveQuoteStatus(q) !== quoteStatusFilter) return false;
      return true;
    });
  }, [quotations, quoteSearchQuery, quoteVatFilter, quoteStatusFilter]);

  const handleDeleteQuotationClick = (q) => {
    if (window.confirm(`Are you sure you want to permanently delete quotation "${q.code}" for ${q.customerName}? This action cannot be undone.`)) {
      if (onDeleteQuotation) {
        onDeleteQuotation(q.id);
      }
    }
  };

  // Form State with Default 5% VAT
  const [form, setForm] = useState({
    leadId: '',
    customerName: '',
    address: 'Muscat, Sultanate of Oman',
    attn: '',
    date: new Date().toISOString().split('T')[0],
    validityDays: 30,
    salesRep: currentUser?.name || '',
    enableVat: true,
    vatRate: 5,
    terms: [...DEFAULT_TERMS],
    items: [
      {
        productId: '',
        item: '',
        description: '',
        quantity: 1,
        unit: 'PCS',
        unitPriceOMR: 0,
      },
    ],
  });

  const blankForm = () => ({
    leadId: '',
    customerName: '',
    address: 'Muscat, Sultanate of Oman',
    attn: '',
    date: new Date().toISOString().split('T')[0],
    validityDays: 30,
    salesRep: currentUser?.name || '',
    enableVat: true,
    vatRate: 5,
    terms: [...DEFAULT_TERMS],
    items: [{ productId: '', item: '', description: '', quantity: 1, unit: 'PCS', unitPriceOMR: 0 }],
  });

  // Open an existing quotation in the form
  const startEdit = (q) => {
    setEditingQuote(q);
    setForm({
      leadId: q.leadId || '',
      customerName: q.customerName || '',
      address: q.address || '',
      attn: q.attn || '',
      date: q.date || new Date().toISOString().split('T')[0],
      validityDays: q.validityDays || 30,
      salesRep: q.salesRep || '',
      enableVat: q.enableVat !== false,
      vatRate: q.vatRate ?? 5,
      terms: Array.isArray(q.terms) && q.terms.length ? [...q.terms] : [...DEFAULT_TERMS],
      items: (q.items && q.items.length ? q.items : [{}]).map((it) => ({
        productId: it.productId || '',
        item: it.item || '',
        description: it.description || '',
        quantity: Number(it.quantity || 1),
        unit: it.unit || 'PCS',
        unitPriceOMR: Number(it.unitPriceOMR || 0),
      })),
    });
    setActiveView('create');
    window.scrollTo?.({ top: 0, behavior: 'smooth' });
  };
  const startNew = () => { setEditingQuote(null); setForm(blankForm()); setActiveView('create'); };
  const backToList = () => { setEditingQuote(null); setForm(blankForm()); setActiveView('list'); };

  // Handle prefilled lead if arrived from Leads page or Customer Care
  useEffect(() => {
    if (prefilledLead) {
      setForm((prev) => ({
        ...prev,
        leadId: prefilledLead.id || '',
        customerName: prefilledLead.name || '',
        attn: prefilledLead.phone || prefilledLead.mobile || '',
        address: `${prefilledLead.customerLocation || prefilledLead.branch || 'Muscat'}, Sultanate of Oman`,
        salesRep: prefilledLead.salesman || prev.salesRep || currentUser?.name || '',
      }));
      setEditingQuote(null);
      setActiveView('create');
      if (onClearPrefilledLead) onClearPrefilledLead();
    }
  }, [prefilledLead]);

  // Add Item Row
  const handleAddItem = () => {
    setForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          productId: '',
          item: '',
          description: '',
          quantity: 1,
          unit: 'PCS',
          unitPriceOMR: 0,
        },
      ],
    }));
  };

  // Batch Add Items from Catalog Quick-Picker
  const handleBatchAddProducts = (newItems) => {
    if (!newItems || newItems.length === 0) return;
    setForm((prev) => {
      // If current items only has one empty item, replace it
      const currentItems = [...prev.items];
      if (
        currentItems.length === 1 &&
        !currentItems[0].productId &&
        !currentItems[0].item.trim()
      ) {
        return { ...prev, items: newItems };
      }
      return { ...prev, items: [...currentItems, ...newItems] };
    });
  };

  // Remove Item Row
  const handleRemoveItem = (index) => {
    if (form.items.length <= 1) return;
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  // Change Item field
  const handleItemChange = (index, field, value) => {
    setForm((prev) => {
      const newItems = [...prev.items];
      newItems[index] = { ...newItems[index], [field]: value };
      return { ...prev, items: newItems };
    });
  };

  // Handle Product selection from Combobox
  const handleSelectProductInRow = (index, prod) => {
    setForm((prev) => {
      const newItems = [...prev.items];
      newItems[index] = {
        ...newItems[index],
        productId: prod.id,
        item: prod.name,
        description: prod.description || '',
        unit: prod.unit || 'PCS',
        unitPriceOMR: prod.priceOMR || 0,
      };
      return { ...prev, items: newItems };
    });
  };

  const handleClearProductInRow = (index) => {
    setForm((prev) => {
      const newItems = [...prev.items];
      newItems[index] = {
        ...newItems[index],
        productId: '',
      };
      return { ...prev, items: newItems };
    });
  };

  // Calculate live totals with Oman 5% VAT
  const subtotal = form.items.reduce(
    (acc, curr) => acc + (Number(curr.quantity) || 0) * (Number(curr.unitPriceOMR) || 0),
    0
  );
  const vatRateNumber = Number(form.vatRate !== undefined ? form.vatRate : 5);
  const vatAmount = form.enableVat ? Number((subtotal * (vatRateNumber / 100)).toFixed(3)) : 0;
  const grandTotal = Number((subtotal + vatAmount).toFixed(3));

  const handleAddTerm = () => {
    setForm((prev) => ({
      ...prev,
      terms: [...(prev.terms || []), ''],
    }));
  };

  const handleTermChange = (index, value) => {
    setForm((prev) => {
      const updated = [...(prev.terms || [])];
      updated[index] = value;
      return { ...prev, terms: updated };
    });
  };

  const handleRemoveTerm = (index) => {
    setForm((prev) => ({
      ...prev,
      terms: (prev.terms || []).filter((_, i) => i !== index),
    }));
  };

  const handleResetTerms = () => {
    setForm((prev) => ({
      ...prev,
      terms: [...DEFAULT_TERMS],
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.customerName.trim()) {
      alert('Please enter a customer or business name.');
      return;
    }

    const payload = {
      ...form,
      terms: (form.terms || []).filter((t) => typeof t === 'string' && t.trim().length > 0),
      subtotalOMR: subtotal,
      enableVat: form.enableVat,
      vatRate: vatRateNumber,
      vatAmountOMR: vatAmount,
      grandTotalOMR: grandTotal,
    };

    if (editingQuote) {
      // Save changes to the same quotation (same number); totals are recalculated
      onUpdateQuotation(editingQuote.id, payload, (updatedQuote) => {
        backToList();
        setSelectedQuotationForPrint(updatedQuote);
      });
      return;
    }
    onCreateQuotation(payload, (createdQuote) => {
      backToList();
      setSelectedQuotationForPrint(createdQuote);
    });
  };

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 max-w-7xl mx-auto pb-24 md:pb-8">
      {/* Catalog Quick-Picker Modal */}
      <CatalogQuickPickerModal
        isOpen={isCatalogPickerOpen}
        onClose={() => setIsCatalogPickerOpen(false)}
        products={products}
        categories={categories}
        onAddProducts={handleBatchAddProducts}
      />

      {/* Print View Modal */}
      {selectedQuotationForPrint && (
        <PrintQuotation
          quotation={selectedQuotationForPrint}
          onClose={() => setSelectedQuotationForPrint(null)}
          onUpdateTerms={async (newTerms) => {
            if (onUpdateQuotation && selectedQuotationForPrint.id) {
              const updated = await onUpdateQuotation(selectedQuotationForPrint.id, { terms: newTerms });
              if (updated) setSelectedQuotationForPrint(updated);
            } else {
              setSelectedQuotationForPrint((prev) => ({ ...prev, terms: newTerms }));
            }
          }}
          onUpdateVat={async (vatSettings) => {
            if (onUpdateQuotation && selectedQuotationForPrint.id) {
              const updated = await onUpdateQuotation(selectedQuotationForPrint.id, vatSettings);
              if (updated) setSelectedQuotationForPrint(updated);
            } else {
              setSelectedQuotationForPrint((prev) => ({ ...prev, ...vatSettings }));
            }
          }}
        />
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[24px] leading-tight font-extrabold text-slate-900">Quotations</h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11.5px] font-bold bg-white border border-slate-200 text-slate-600">MNI executive spec</span>
            <span className="px-2.5 py-0.5 rounded-full text-[11.5px] font-bold bg-emerald-50 text-emerald-700">5% VAT</span>
          </div>
          <p className="hidden sm:block text-xs text-slate-500 mt-1">
            Generate and print verified OMR quotations with multi-brand catalog search and Oman 5% VAT calculation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeView === 'list' ? (
            <button
              onClick={startNew}
              className="mp-btn mp-btn-red min-h-[40px] w-full sm:w-auto"
            >
              <Plus className="w-4 h-4" />
              <span>New quotation</span>
            </button>
          ) : (
            <button
              onClick={backToList}
              className="mp-btn mp-btn-line min-h-[40px]"
            >
              ← Back to quotations
            </button>
          )}
        </div>
      </div>

      {/* CREATE VIEW */}
      {activeView === 'create' && (
        <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.04)] p-6 space-y-6">
          {editingQuote && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-[12.5px] text-blue-900" role="status">
              <Pencil className="w-4 h-4" aria-hidden="true" />
              <span>Editing <b>{editingQuote.code}</b>. Saving keeps the same quotation number and recalculates the totals.</span>
              {['accepted', 'rejected'].includes(editingQuote.status) && (
                <span className="w-full text-[11.5px] text-amber-800">This quotation is already marked {editingQuote.status}. Only change it if the customer agreed to the new version.</span>
              )}
            </div>
          )}
          <div className="border-b border-slate-200 pb-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Customer & Document Details
            </h3>
            <p className="text-xs text-slate-500">
              Fill in client information and quotation parameters.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Customer / Business Name *
              </label>
              <input
                type="text"
                required
                value={form.customerName}
                onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                placeholder="e.g. Nizwa Oasis Hotel & Suites"
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-3 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Delivery Wilayat / Address
              </label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="e.g. Nizwa, Ad Dakhiliyah"
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-3 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Contact Phone / Attn
              </label>
              <input
                type="text"
                placeholder="+968 99887766"
                value={form.attn}
                onChange={(e) => setForm({ ...form, attn: e.target.value })}
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-3 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Quotation Date
              </label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-3 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Validity (Days)
              </label>
              <input
                type="number"
                value={form.validityDays}
                onChange={(e) => setForm({ ...form, validityDays: Number(e.target.value) })}
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-3 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Prepared By (Sales Rep)
              </label>
              <input
                type="text"
                value={form.salesRep}
                onChange={(e) => setForm({ ...form, salesRep: e.target.value })}
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-3 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition"
              />
            </div>
          </div>

          {/* Line Items Table with Smart Product Search & Catalog Modal */}
          <div className="space-y-3 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Quotation Line Items ({form.items.length})
                </h4>
                <p className="text-[11px] text-slate-500">
                  Search across all commercial brands or browse the catalog. Custom items and prices can also be typed directly.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsCatalogPickerOpen(true)}
                  className="flex items-center gap-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 px-3 py-1.5 rounded-lg shadow-sm transition active:scale-95 cursor-pointer"
                >
                  <ShoppingBag className="w-3.5 h-3.5 text-red-400" />
                  <span>Browse Product Catalog</span>
                </button>

                <button
                  type="button"
                  onClick={handleAddItem}
                  className="flex items-center gap-1 text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 px-2.5 py-1.5 rounded-lg border border-red-200 transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Blank Row</span>
                </button>
              </div>
            </div>

            {/* Mobile Line Items Cards (< md only) */}
            <div className="md:hidden space-y-3">
              {form.items.map((item, idx) => (
                <div key={idx} className="bg-white rounded-3xl border border-slate-200 p-3.5 space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                      Item #{idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      disabled={form.items.length <= 1}
                      className="p-1 text-slate-400 hover:text-red-600 disabled:opacity-30 cursor-pointer"
                      title="Remove Row"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Catalog search combobox */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Catalog Search
                    </label>
                    <ProductCombobox
                      products={products}
                      selectedProductId={item.productId}
                      onSelect={(prod) => handleSelectProductInRow(idx, prod)}
                      onClear={() => handleClearProductInRow(idx)}
                    />
                  </div>

                  {/* Item Title */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Item Title
                    </label>
                    <input
                      type="text"
                      required
                      value={item.item}
                      onChange={(e) => handleItemChange(idx, 'item', e.target.value)}
                      placeholder="Product Name"
                      className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-red-500 font-semibold"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Description / Specs
                    </label>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                      placeholder="Specifications, volume, packaging unit..."
                      className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-600 focus:outline-none focus:border-red-500"
                    />
                  </div>

                  {/* Quantity, Unit & Price Grid */}
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Quantity
                      </label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={item.quantity}
                        onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                        className="w-full text-xs text-center border border-slate-200 rounded-lg py-1.5 font-bold focus:outline-none focus:border-red-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Unit
                      </label>
                      <select
                        value={item.unit}
                        onChange={(e) => handleItemChange(idx, 'unit', e.target.value)}
                        className="w-full text-xs border border-slate-200 rounded-lg py-1.5 px-1 focus:outline-none focus:border-red-500"
                      >
                        <option value="PCS">PCS</option>
                        <option value="CTN">CTN</option>
                        <option value="PACK">PACK</option>
                        <option value="ROLL">ROLL</option>
                        <option value="SET">SET</option>
                        <option value="BOX">BOX</option>
                        <option value="CAN">CAN</option>
                        <option value="BOTTLE">BOTTLE</option>
                        <option value="DRUM">DRUM</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Price (OMR)
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        required
                        value={item.unitPriceOMR}
                        onChange={(e) => handleItemChange(idx, 'unitPriceOMR', e.target.value)}
                        className="w-full text-xs text-right font-mono border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-red-500 font-bold"
                      />
                    </div>
                  </div>

                  {/* Line Total */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    <span className="text-slate-400 font-bold uppercase text-[10px]">Row Total:</span>
                    <span className="font-mono font-black text-slate-900">
                      OMR {((Number(item.quantity) || 0) * (Number(item.unitPriceOMR) || 0)).toFixed(3)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table (hidden on mobile, visible md:) */}
            <div className="hidden md:block border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 w-8 text-center">#</th>
                    <th className="py-2.5 px-3 w-56">Catalog Search</th>
                    <th className="py-2.5 px-3">Item Name / Title</th>
                    <th className="py-2.5 px-3">Description / Specs</th>
                    <th className="py-2.5 px-3 w-20 text-center">Qty</th>
                    <th className="py-2.5 px-3 w-24 text-center">Unit</th>
                    <th className="py-2.5 px-3 w-28 text-right">Price (OMR)</th>
                    <th className="py-2.5 px-3 w-28 text-right">Total (OMR)</th>
                    <th className="py-2.5 px-3 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {form.items.map((item, idx) => (
                    <tr key={idx} className="bg-white hover:bg-slate-50/50 transition">
                      <td className="py-2 px-3 text-center font-bold text-slate-500">{idx + 1}</td>
                      <td className="py-2 px-3">
                        <ProductCombobox
                          products={products}
                          selectedProductId={item.productId}
                          onSelect={(prod) => handleSelectProductInRow(idx, prod)}
                          onClear={() => handleClearProductInRow(idx)}
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          required
                          value={item.item}
                          onChange={(e) => handleItemChange(idx, 'item', e.target.value)}
                          placeholder="Product Name"
                          className="w-full text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-red-500"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                          placeholder="Description / Specs"
                          className="w-full text-xs border border-slate-200 rounded px-2 py-1 text-slate-600 focus:outline-none focus:border-red-500"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number"
                          min="1"
                          required
                          value={item.quantity}
                          onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                          className="w-full text-xs text-center border border-slate-200 rounded px-1.5 py-1 font-bold focus:outline-none focus:border-red-500"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <select
                          value={item.unit}
                          onChange={(e) => handleItemChange(idx, 'unit', e.target.value)}
                          className="w-full text-xs border border-slate-200 rounded px-1 py-1 focus:outline-none focus:border-red-500"
                        >
                          <option value="PCS">PCS</option>
                          <option value="CTN">CTN</option>
                          <option value="PACK">PACK</option>
                          <option value="ROLL">ROLL</option>
                          <option value="SET">SET</option>
                          <option value="BOX">BOX</option>
                          <option value="CAN">CAN</option>
                          <option value="BOTTLE">BOTTLE</option>
                          <option value="DRUM">DRUM</option>
                        </select>
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          required
                          value={item.unitPriceOMR}
                          onChange={(e) => handleItemChange(idx, 'unitPriceOMR', e.target.value)}
                          className="w-full text-xs text-right font-mono border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-red-500"
                        />
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                        {((Number(item.quantity) || 0) * (Number(item.unitPriceOMR) || 0)).toFixed(3)}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          disabled={form.items.length <= 1}
                          className="p-1 text-slate-400 hover:text-red-600 disabled:opacity-30 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals Summary Panel with 5% Oman VAT Option */}
            <div className="flex justify-end pt-3">
              <div className="w-80 bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                {/* VAT Toggle & Rate Selection */}
                <div className="border-b border-slate-200 pb-2.5">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={form.enableVat}
                        onChange={(e) => setForm({ ...form, enableVat: e.target.checked })}
                        className="w-4 h-4 text-red-600 rounded focus:ring-red-500 cursor-pointer"
                      />
                      <span className="text-xs font-bold text-slate-900">
                        Apply VAT (Oman 5%)
                      </span>
                    </label>

                    {form.enableVat && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, vatRate: 5 })}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border transition ${
                            form.vatRate === 5
                              ? 'bg-red-600 text-white border-red-600'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          5%
                        </button>
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, vatRate: 0 })}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border transition ${
                            form.vatRate === 0
                              ? 'bg-red-600 text-white border-red-600'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          0%
                        </button>
                      </div>
                    )}
                  </div>

                  {form.enableVat && form.vatRate !== 5 && form.vatRate !== 0 && (
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[11px] text-slate-500">Custom Rate %:</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={form.vatRate}
                        onChange={(e) => setForm({ ...form, vatRate: Number(e.target.value) })}
                        className="w-16 text-xs text-right font-mono bg-white border border-slate-300 rounded px-1.5 py-0.5"
                      />
                    </div>
                  )}
                </div>

                {/* Subtotal, VAT, Grand Total Calculation */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal:</span>
                    <span className="font-mono font-bold text-slate-800">OMR {subtotal.toFixed(3)}</span>
                  </div>

                  {form.enableVat ? (
                    <div className="flex justify-between text-slate-700 font-medium">
                      <span>VAT ({form.vatRate}%):</span>
                      <span className="font-mono font-bold text-slate-900">OMR {vatAmount.toFixed(3)}</span>
                    </div>
                  ) : (
                    <div className="flex justify-between text-slate-400 italic text-[11px]">
                      <span>VAT:</span>
                      <span>Exempt / Zero-Rated</span>
                    </div>
                  )}

                  <div className="flex justify-between text-sm font-black text-red-700 border-t border-slate-200 pt-2">
                    <span>Grand Total:</span>
                    <span className="font-mono">OMR {grandTotal.toFixed(3)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Terms & Conditions Section */}
          <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Terms & Conditions (Editable Per Quotation)
                </h4>
                <p className="text-[11px] text-slate-500">
                  Customize the commercial terms printed on this quotation. Modify any line or add custom clauses.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetTerms}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 px-2 py-1 rounded transition cursor-pointer"
                >
                  Reset Defaults
                </button>
                <button
                  type="button"
                  onClick={handleAddTerm}
                  className="flex items-center gap-1 text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 px-2.5 py-1 rounded-md border border-red-200 transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Term</span>
                </button>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              {(form.terms || []).map((term, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 w-5 text-right">{idx + 1}.</span>
                  <input
                    type="text"
                    value={term}
                    placeholder="Enter condition or commercial rule..."
                    onChange={(e) => handleTermChange(idx, e.target.value)}
                    className="flex-1 text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveTerm(idx)}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded transition cursor-pointer"
                    title="Remove Term"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {(!form.terms || form.terms.length === 0) && (
                <p className="text-xs text-slate-400 italic">No terms specified. Click "+ Add Term" to add custom terms.</p>
              )}
            </div>
          </div>

          {/* Form Actions */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={backToList}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-[#9E0A22] to-[#C8102E] hover:brightness-110 text-white text-xs font-bold rounded-full shadow-md shadow-red-900/30 transition active:scale-95 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{editingQuote ? 'Save changes & preview' : 'Save & Preview Quotation'}</span>
            </button>
          </div>
        </form>
      )}

      {/* LIST VIEW */}
      {activeView === 'list' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.04)] overflow-hidden">
          {/* List Header with Search & Filter Controls */}
          <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Issued <span className="font-monipack lowercase text-sm">monipack</span> Quotations
              </h3>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-mono">
                {filteredQuotations.length} {filteredQuotations.length !== quotations.length ? `of ${quotations.length}` : ''}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Instant Search Bar */}
              <div className="relative min-w-[240px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={quoteSearchQuery}
                  onChange={(e) => setQuoteSearchQuery(e.target.value)}
                  placeholder="Search customer, ref #, Wilayat..."
                  className="w-full pl-8 pr-7 py-2.5 sm:py-2 text-xs bg-white border border-slate-200 rounded-full focus:outline-none focus:ring-1 focus:ring-red-500 font-medium"
                />
                {quoteSearchQuery && (
                  <button aria-label="Clear search"
                    onClick={() => setQuoteSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                )}
              </div>

              {/* Status Filter */}
              <select
                value={quoteStatusFilter}
                onChange={(e) => setQuoteStatusFilter(e.target.value)}
                aria-label="Quotation status"
                className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-red-500 cursor-pointer"
              >
                <option value="all">All statuses</option>
                {Object.entries(QUOTE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>

              {/* VAT Filter */}
              <select
                value={quoteVatFilter}
                onChange={(e) => setQuoteVatFilter(e.target.value)}
                className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-red-500 cursor-pointer"
              >
                <option value="all">All Tax Types</option>
                <option value="with_vat">5% VAT Active</option>
                <option value="without_vat">Tax Exempt (0%)</option>
              </select>

              {(quoteSearchQuery || quoteVatFilter !== 'all' || quoteStatusFilter !== 'all') && (
                <button
                  onClick={() => {
                    setQuoteSearchQuery('');
                    setQuoteVatFilter('all');
                    setQuoteStatusFilter('all');
                  }}
                  className="text-xs text-[#CC1A22] hover:text-red-700 font-bold px-2 py-1 cursor-pointer"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Mobile Quotation Cards Feed (< md only) */}
          <div className="mp-stagger lg:hidden divide-y divide-slate-100">
            {filteredQuotations.length > 0 ? (
              filteredQuotations.map((q) => (
                <div key={q.id} className="p-4 space-y-2.5 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-black text-xs text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                      {q.code}
                    </span>
                    <span className="flex items-center gap-2"><QuoteStatus quote={q} onSetStatus={onSetQuoteStatus} /><span className="font-mono text-xs text-slate-400 font-semibold">{q.date}</span></span>
                  </div>

                  <div>
                    <h4 className="text-sm font-black text-slate-900 capitalize">{q.customerName}</h4>
                    <p className="text-xs text-slate-500 mt-0.5">{q.address} • {q.items ? q.items.length : 0} items</p>
                  </div>

                  <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                    <span className="text-xs font-semibold text-slate-500">
                      Grand Total {q.enableVat !== false ? '(5% VAT)' : ''}:
                    </span>
                    <span className="font-mono font-black text-sm text-slate-900">
                      OMR {(() => {
                        const val = Number(q.grandTotalOMR);
                        return (!isNaN(val) ? val : 0).toFixed(3);
                      })()}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setSelectedQuotationForPrint(q)}
                      className="flex-1 min-h-[44px] bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-full flex items-center justify-center gap-1.5 shadow-xs transition active:scale-95 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5 text-red-400" />
                      <span>Print MNI Spec</span>
                    </button>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => startEdit(q)}
                        className="w-11 h-11 flex items-center justify-center bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-full border border-blue-200 transition active:scale-95 cursor-pointer"
                        title={`Edit ${q.code}`}
                        aria-label={`Edit ${q.code}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedQuotationForPrint(q)}
                      className="w-11 h-11 flex items-center justify-center bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-full border border-emerald-200 transition active:scale-95 cursor-pointer"
                      title="Share Quotation via WhatsApp"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                    {onDeleteQuotation && (
                      <button
                        type="button"
                        onClick={() => handleDeleteQuotationClick(q)}
                        className="w-11 h-11 flex items-center justify-center bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-full border border-rose-200 transition active:scale-95 cursor-pointer"
                        title="Delete Quotation"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-xs text-slate-400 font-medium">
                No quotations found.
              </div>
            )}
          </div>

          {/* Desktop Table (hidden on mobile, visible md:) */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-bold">Quote Ref</th>
                  <th className="py-3 px-4 font-bold">Customer / Business</th>
                  <th className="py-3 px-4 font-bold">Address</th>
                  <th className="py-3 px-4 font-bold">Status</th>
                  <th className="py-3 px-4 font-bold">Issue Date</th>
                  <th className="py-3 px-4 font-bold">Items</th>
                  <th className="py-3 px-4 font-bold text-right">Grand Total (OMR)</th>
                  <th className="py-3 px-4 font-bold">Prepared By</th>
                  <th className="py-3 px-4 font-bold text-center">Print / View</th>
                </tr>
              </thead>
              <tbody className="mp-stagger divide-y divide-slate-100 font-medium">
                {filteredQuotations.length > 0 ? (
                  filteredQuotations.map((q) => (
                    <tr key={q.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-red-700 whitespace-nowrap">
                        {q.code}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900 capitalize">{q.customerName}</td>
                      <td className="py-3 px-4 text-slate-600">{q.address}</td>
                      <td className="py-3 px-4"><QuoteStatus quote={q} onSetStatus={onSetQuoteStatus} /></td>
                      <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">{q.date}</td>
                      <td className="py-3 px-4 text-slate-600">
                        {q.items ? q.items.length : 0} items
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-black text-slate-950 whitespace-nowrap">
                        <div>OMR {(() => {
                          const val = Number(q.grandTotalOMR);
                          return (!isNaN(val) ? val : 0).toFixed(3);
                        })()}</div>
                        {q.enableVat !== false && (
                          <div className="text-[10px] text-emerald-700 font-sans font-bold">
                            Incl. {q.vatRate || 5}% VAT
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{q.salesRep}</td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setSelectedQuotationForPrint(q)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 font-bold rounded-lg border border-red-200 text-[11px] transition active:scale-95 cursor-pointer"
                            title="Print or Preview Quotation"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Print MNI Spec</span>
                          </button>
                          {canEdit && (
                            <button
                              onClick={() => startEdit(q)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-lg border border-blue-200 text-[11px] transition active:scale-95 cursor-pointer"
                              title={`Edit ${q.code}`}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedQuotationForPrint(q)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-lg border border-emerald-200 text-[11px] transition active:scale-95 cursor-pointer"
                            title="Share Quotation via WhatsApp"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                            <span>Share</span>
                          </button>
                          {onDeleteQuotation && (
                            <button
                              onClick={() => handleDeleteQuotationClick(q)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-lg border border-rose-200 text-[11px] transition active:scale-95 cursor-pointer"
                              title="Delete Quotation"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="9" className="text-center py-10 text-slate-400">
                      {quoteSearchQuery || quoteVatFilter !== 'all' ? (
                        <div>
                          <p className="text-xs font-semibold text-slate-600 mb-1">No quotations matched your filters</p>
                          <p className="text-[11px] text-slate-400">Try adjusting your search query or reset filters.</p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-xs font-semibold text-slate-600 mb-1">No quotations generated yet</p>
                          <p className="text-[11px] text-slate-400">Click "+ Create New Quotation" to issue your first commercial quotation.</p>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
