import React, { useState, useEffect } from 'react';
import { 
  X, 
  Upload, 
  Download, 
  FileSpreadsheet, 
  CheckCircle, 
  AlertCircle, 
  AlertTriangle,
  RefreshCw, 
  Package,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { getApiUrl } from '../api/config.js';

export default function ProductImportModal({
  isOpen,
  onClose,
  token,
  onImportSuccess,
  showToast
}) {
  // File Upload & Variance State
  const [fileContent, setFileContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [parsedItems, setParsedItems] = useState([]);
  const [varianceStats, setVarianceStats] = useState(null);
  const [filterVariance, setFilterVariance] = useState('all'); // 'all', 'price_changed', 'new_items', 'low_stock'
  const [updateExisting, setUpdateExisting] = useState(true);
  const [parsingLoading, setParsingLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);

  // Reset state on open
  useEffect(() => {
    if (isOpen) {
      setFileContent('');
      setFileName('');
      setParsedItems([]);
      setVarianceStats(null);
      setFilterVariance('all');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAuthError = () => {
    window.dispatchEvent(new CustomEvent('monipack_session_expired'));
    onClose();
  };

  // 1. Download Official CSV Template
  const handleDownloadTemplate = async () => {
    try {
      const res = await fetch(getApiUrl('/api/products/template'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) {
        handleAuthError();
        return;
      }
      if (!res.ok) throw new Error('Failed to generate template');
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'monipack_product_catalog_template.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      if (showToast) showToast('Official product template downloaded!');
    } catch (err) {
      console.error(err);
      if (showToast) showToast('Error downloading product template.', 'error');
    }
  };

  // 2. Handle File Input (CSV or Text)
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setParsingLoading(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result;
      setFileContent(content);

      try {
        const res = await fetch(getApiUrl('/api/products/parse-csv'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ csvData: content })
        });

        if (res.status === 401) {
          handleAuthError();
          return;
        }

        const data = await res.json();
        if (res.ok) {
          setParsedItems(data.items || []);
          setVarianceStats({
            count: data.count || 0,
            newCount: data.newCount || 0,
            priceChangedCount: data.priceChangedCount || 0,
            lowStockCount: data.lowStockCount || 0,
            formatDetected: data.formatDetected || 'CSV Spreadsheet'
          });
          if (showToast) showToast(`Parsed ${data.count} items (${data.formatDetected})`);
        } else {
          if (showToast) {
            showToast(data.error || 'Failed to parse file.', 'error');
          } else {
            alert(data.error || 'Failed to parse file.');
          }
        }
      } catch (err) {
        console.error(err);
        if (showToast) showToast('Error parsing uploaded file.', 'error');
      } finally {
        setParsingLoading(false);
      }
    };
    reader.readAsText(file);
  };

  // 3. Commit File Import into Database
  const handleCommitFileImport = async () => {
    if (parsedItems.length === 0) return;
    setImportLoading(true);

    try {
      const res = await fetch(getApiUrl('/api/products/bulk-import'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          items: parsedItems,
          options: { updateExisting }
        })
      });

      if (res.status === 401) {
        handleAuthError();
        return;
      }

      const data = await res.json();
      if (res.ok) {
        if (showToast) showToast(data.message || 'Products imported successfully!');
        if (onImportSuccess) onImportSuccess();
        onClose();
      } else {
        if (showToast) {
          showToast(data.error || 'Failed to import products.', 'error');
        } else {
          alert(data.error || 'Failed to import products.');
        }
      }
    } catch (err) {
      console.error(err);
      if (showToast) showToast('Network error during product import.', 'error');
    } finally {
      setImportLoading(false);
    }
  };

  const handleResetFile = () => {
    setFileName('');
    setFileContent('');
    setParsedItems([]);
    setVarianceStats(null);
    setFilterVariance('all');
  };

  // Filter items in preview
  const displayedItems = parsedItems.filter(item => {
    if (filterVariance === 'price_changed') return item.priceChanged;
    if (filterVariance === 'new_items') return item.isNew;
    if (filterVariance === 'low_stock') return item.isLowStock || item.isOutOfStock;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-6 max-h-[92vh] flex flex-col">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-red-950 text-white p-5 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600/30 border border-red-500/40 flex items-center justify-center text-red-400">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black tracking-tight">Product Catalog CSV Importer</h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/30">
                  Price Variance Inspector
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Morooj Nizwa International LLC • Multi-Brand Inventory (<span className="font-monipack lowercase text-xs">monipack</span>, Moniclean, Monifood, Kohe)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          <div className="space-y-5">
            
            {/* Top Banner & Template Download */}
            <div className="bg-gradient-to-r from-slate-50 via-red-50/20 to-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900">Bilingual Catalog CSV Importer:</span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">
                    Automatic Header Recognition
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 max-w-xl">
                  Upload standard product CSV spreadsheets or download our official bilingual template. Our parser automatically normalizes stock balances, unit rates in OMR, and inspects price shifts against the existing catalog.
                </p>
              </div>
              <button
                onClick={handleDownloadTemplate}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition active:scale-95 shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download CSV Template</span>
              </button>
            </div>

            {/* Upload Dropzone */}
            {!parsedItems.length ? (
              <div className="border-2 border-dashed border-slate-300 hover:border-red-400 rounded-2xl p-8 text-center bg-slate-50/50 hover:bg-red-50/10 transition group">
                <input
                  type="file"
                  id="productFileInput"
                  accept=".csv, .txt, text/csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <label
                  htmlFor="productFileInput"
                  className="cursor-pointer flex flex-col items-center justify-center space-y-3"
                >
                  <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 group-hover:text-red-600 group-hover:scale-105 transition">
                    <Upload className="w-7 h-7" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-800 block">
                      Drop your CSV Spreadsheet here
                    </span>
                    <span className="text-xs text-slate-400 block mt-1">
                      Supports Excel CSV and Monipack Product Templates
                    </span>
                  </div>
                  <div className="pt-2 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 shadow-2xs">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                      Browse File (.csv)
                    </span>
                  </div>
                </label>
                {parsingLoading && (
                  <div className="mt-4 flex items-center justify-center gap-2 text-xs text-red-600 font-semibold">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Analyzing catalog structure, detecting brands, and computing price variances...
                  </div>
                )}
              </div>
            ) : (
              /* Smart Variance Dashboard & Table */
              <div className="space-y-4">
                
                {/* Variance Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Format Detected</span>
                    <span className="text-xs font-black text-slate-900 block mt-1 truncate" title={varianceStats?.formatDetected}>
                      {varianceStats?.formatDetected}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono mt-0.5 block">
                      {varianceStats?.count} Total Items
                    </span>
                  </div>

                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5">
                    <span className="text-[10px] font-bold uppercase text-emerald-600 block">New Products</span>
                    <span className="text-xl font-black text-emerald-700 block mt-0.5">
                      +{varianceStats?.newCount}
                    </span>
                    <span className="text-[11px] text-emerald-600 mt-0.5 block">New SKUs to add</span>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5">
                    <span className="text-[10px] font-bold uppercase text-amber-700 block">Price Adjustments</span>
                    <span className="text-xl font-black text-amber-800 block mt-0.5">
                      {varianceStats?.priceChangedCount}
                    </span>
                    <span className="text-[11px] text-amber-700 mt-0.5 block">OMR rate shifts</span>
                  </div>

                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5">
                    <span className="text-[10px] font-bold uppercase text-rose-700 block">Stock Warnings</span>
                    <span className="text-xl font-black text-rose-800 block mt-0.5">
                      {varianceStats?.lowStockCount}
                    </span>
                    <span className="text-[11px] text-rose-700 mt-0.5 block">Low / Zero Balance</span>
                  </div>
                </div>

                {/* Filter Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-semibold">
                    <button
                      onClick={() => setFilterVariance('all')}
                      className={`px-3 py-1.5 rounded-md transition ${filterVariance === 'all' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      All Items ({parsedItems.length})
                    </button>
                    <button
                      onClick={() => setFilterVariance('price_changed')}
                      className={`px-3 py-1.5 rounded-md transition ${filterVariance === 'price_changed' ? 'bg-white text-amber-800 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      Price Changed ({varianceStats?.priceChangedCount || 0})
                    </button>
                    <button
                      onClick={() => setFilterVariance('new_items')}
                      className={`px-3 py-1.5 rounded-md transition ${filterVariance === 'new_items' ? 'bg-white text-emerald-800 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      New Only ({varianceStats?.newCount || 0})
                    </button>
                    <button
                      onClick={() => setFilterVariance('low_stock')}
                      className={`px-3 py-1.5 rounded-md transition ${filterVariance === 'low_stock' ? 'bg-white text-rose-800 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      Low Stock ({varianceStats?.lowStockCount || 0})
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={updateExisting}
                        onChange={(e) => setUpdateExisting(e.target.checked)}
                        className="rounded text-red-600 focus:ring-red-500"
                      />
                      <span className="font-medium">Update prices and stock for matching SKUs</span>
                    </label>
                    <button
                      onClick={handleResetFile}
                      className="text-xs text-slate-400 hover:text-red-600 font-bold transition"
                    >
                      Upload Another File
                    </button>
                  </div>
                </div>

                {/* Pre-Commit Table with Visual Badges */}
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-600 sticky top-0 font-semibold border-b border-slate-200 z-10">
                      <tr>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">SKU</th>
                        <th className="py-2.5 px-3">Product Name</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3">Brand</th>
                        <th className="py-2.5 px-3 text-right">Price (OMR)</th>
                        <th className="py-2.5 px-3 text-right">Stock Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-normal text-slate-700">
                      {displayedItems.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition">
                          <td className="py-2 px-3 whitespace-nowrap">
                            {item.isNew ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                + New SKU
                              </span>
                            ) : item.priceChanged ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                {item.isPriceIncrease ? <TrendingUp className="w-2.5 h-2.5 text-amber-700" /> : <TrendingDown className="w-2.5 h-2.5 text-blue-700" />}
                                {item.priceDiffPct > 0 ? `+${item.priceDiffPct}%` : `${item.priceDiffPct}%`} Price
                              </span>
                            ) : item.isLowStock ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                Low Stock
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
                                Synced
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 font-mono font-bold text-slate-800 text-[11px]">
                            {item.sku}
                          </td>
                          <td className="py-2 px-3">
                            <span className="font-bold text-slate-900 block">{item.name}</span>
                            {item.nameAr && <span className="text-[10px] text-slate-400 block">{item.nameAr}</span>}
                          </td>
                          <td className="py-2 px-3">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-medium border border-slate-200">
                              {item.category}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-semibold text-slate-700">
                            {item.brand}
                          </td>
                          <td className="py-2 px-3 text-right font-mono">
                            {item.priceChanged ? (
                              <div>
                                <span className="line-through text-slate-400 text-[10px] block">
                                  {item.oldPrice?.toFixed(3)}
                                </span>
                                <span className="font-black text-amber-900 block">
                                  {item.newPrice?.toFixed(3)} OMR
                                </span>
                              </div>
                            ) : (
                              <span className="font-bold text-slate-800">
                                {item.newPrice?.toFixed(3)} OMR
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right font-mono">
                            {item.isLowStock || item.isOutOfStock ? (
                              <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded font-black text-xs">
                                {item.newStock} {item.unit}
                              </span>
                            ) : (
                              <span className="font-semibold text-slate-800">
                                {item.newStock} {item.unit}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

              </div>
            )}

            {/* Commit Button Footer */}
            {parsedItems.length > 0 && (
              <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                <span className="text-xs text-slate-500">
                  Ready to commit <strong>{parsedItems.length}</strong> items to the Multi-Brand Catalog
                </span>
                <button
                  onClick={handleCommitFileImport}
                  disabled={importLoading}
                  className="flex items-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition active:scale-95"
                >
                  {importLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Updating Catalog...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      <span>Commit {parsedItems.length} Items to Catalog</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

