import React from 'react';
import { Building2, Phone, Mail, MapPin, Users, ChevronRight, ShieldCheck, UserCheck } from 'lucide-react';

export default function Branches({ branches, leads, onSelectBranch, onNavigate }) {
  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 max-w-7xl mx-auto pb-24 md:pb-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Oman Branch Network</h2>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200">
            {branches?.length || 10} Regional Hubs
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Distribution centers, retail outlets, and customer support points across the Sultanate of Oman.
        </p>
      </div>

      {/* Customer Service & Complaint Banner */}
      <div className="bg-gradient-to-r from-red-900 to-slate-900 text-white rounded-xl p-4 sm:p-5 border border-red-800 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-red-400 shrink-0" />
            <h3 className="text-sm font-bold">Centralized Customer Care & Quality Guarantee</h3>
          </div>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            Morooj Nizwa International LLC guarantees prompt dispatch and replacement across all wilayats.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs font-mono w-full md:w-auto">
          <a
            href="tel:+96897150774"
            className="flex-1 sm:flex-initial bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg border border-white/10 transition active:scale-95 cursor-pointer"
          >
            <span className="text-slate-400 block text-[10px] uppercase font-sans">Complaints Hotline</span>
            <span className="font-bold text-white flex items-center gap-1.5 mt-0.5">
              <Phone className="w-3.5 h-3.5 text-red-400" />
              <span>+968 9715 0774</span>
            </span>
          </a>
          <a
            href="mailto:customersupport@monipack.com"
            className="flex-1 sm:flex-initial bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg border border-white/10 transition active:scale-95 cursor-pointer"
          >
            <span className="text-slate-400 block text-[10px] uppercase font-sans">Support Email</span>
            <span className="font-bold text-white flex items-center gap-1.5 mt-0.5">
              <Mail className="w-3.5 h-3.5 text-red-400" />
              <span>customersupport@monipack.com</span>
            </span>
          </a>
        </div>
      </div>

      {/* Branches Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {branches.map((b) => {
          const count = leads.filter((l) =>
            (l.branchId && b.id && l.branchId === b.id) ||
            (l.branch === b.name && (!b.salesman || l.salesman === b.salesman))
          ).length;
          const branchPhone = b.phone || '+968 79062219';

          return (
            <div
              key={b.id}
              className="bg-white rounded-xl p-4 sm:p-5 border border-slate-200 shadow-xs hover:shadow-md hover:border-slate-300 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-red-600 shrink-0" />
                      <span>{b.name}</span>
                    </h3>
                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>{b.city ? `${b.city}, Oman` : 'Sultanate of Oman'}</span>
                    </p>
                  </div>
                  {b.isHeadquarters && (
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-red-100 text-red-800 border border-red-200 shrink-0">
                      Headquarters
                    </span>
                  )}
                </div>

                <div className="mt-4 space-y-2 text-xs text-slate-600">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <a
                        href={`tel:${branchPhone.replace(/\s+/g, '')}`}
                        className="font-mono hover:text-red-600 transition"
                      >
                        {branchPhone}
                      </a>
                    </div>
                    <a
                      href={`tel:${branchPhone.replace(/\s+/g, '')}`}
                      className="p-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition active:scale-95 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      title="Direct Call"
                    >
                      <Phone className="w-3 h-3" />
                      <span>Call</span>
                    </a>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <a href="mailto:info@monipack.com" className="hover:text-red-600 transition">
                      info@monipack.com
                    </a>
                  </div>
                  {b.salesman && (
                    <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                      <UserCheck className="w-3.5 h-3.5 text-red-600 shrink-0" />
                      <span>Sales Rep: <strong className="text-slate-800 font-semibold">{b.salesman}</strong></span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-bold text-slate-800 font-mono">{count} Leads</span>
                </div>

                <button
                  onClick={() => {
                    onSelectBranch(b.id || b.name);
                    onNavigate('leads');
                  }}
                  className="flex items-center gap-1 text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg border border-red-200 transition active:scale-95 cursor-pointer"
                >
                  <span>Filter Leads</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
