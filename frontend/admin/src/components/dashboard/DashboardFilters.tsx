import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { AnimatePresence, motion } from 'framer-motion';
import { Filter, X, Check, Loader2, RotateCcw } from 'lucide-react';

interface FilterOption {
  value: string;
  label: string;
}

interface DashboardFiltersProps {
  onFilterChange?: (filters: {
    batch: string;
    center: string;
    timeframe: string;
    riskLevel: string;
  }) => void;
}

interface FilterPopupProps {
  open: boolean;
  onClose: () => void;
  onApply: (values: { batch: string; center: string; timeframe: string; riskLevel: string }) => void;
  initialValues: { batch: string; center: string; timeframe: string; riskLevel: string };
}

const FilterPopup: React.FC<FilterPopupProps> = ({ open, onClose, onApply, initialValues }) => {
  const [batch, setBatch] = useState(initialValues.batch);
  const [center, setCenter] = useState(initialValues.center);
  const [timeframe, setTimeframe] = useState(initialValues.timeframe);
  const [riskLevel, setRiskLevel] = useState(initialValues.riskLevel);

  const [batchOptions, setBatchOptions] = useState<FilterOption[]>([{ value: 'all', label: 'All Batches' }]);
  const [centerOptions, setCenterOptions] = useState<FilterOption[]>([{ value: 'all', label: 'All Centers' }]);
  const [timeframeOptions, setTimeframeOptions] = useState<FilterOption[]>([]);
  const [riskLevelOptions] = useState<FilterOption[]>([
    { value: 'All Levels', label: 'All Levels' },
    { value: 'High Risk', label: 'High Risk' },
    { value: 'Medium Risk', label: 'Medium Risk' },
    { value: 'Low Risk', label: 'Low Risk' },
  ]);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      setBatch(initialValues.batch);
      setCenter(initialValues.center);
      setTimeframe(initialValues.timeframe);
      setRiskLevel(initialValues.riskLevel);
    }
  }, [open, initialValues]);

  useEffect(() => {
    const fetchFilters = async () => {
      try {
        setLoading(true);
        const response = await axios.get('/api/admin/dashboard/filters');
        const data = response.data;

        setBatchOptions(data.batches || [{ value: 'all', label: 'All Batches' }]);
        setCenterOptions(data.centers || [{ value: 'all', label: 'All Centers' }]);
        
        const tfOptions = (data.timeframes || []).map((tf: string) => ({
          value: tf,
          label: tf,
        }));
        setTimeframeOptions(tfOptions);
        if (tfOptions.length > 0 && !timeframe) {
          setTimeframe(tfOptions[0].value);
        }
      } catch {
        setLoading(false);
      } finally {
        setLoading(false);
      }
    };

    if (open) {
      fetchFilters();
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) {
      document.addEventListener('keydown', handler);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  const handleApply = () => {
    onApply({ batch, center, timeframe, riskLevel });
    onClose();
  };

  const handleReset = () => {
    setBatch('all');
    setCenter('all');
    if (timeframeOptions.length > 0) {
      setTimeframe(timeframeOptions[0].value);
    }
    setRiskLevel('All Levels');
  };

  if (!open) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-2xl max-h-[90vh] rounded-2xl glass-card flex flex-col overflow-hidden shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/10 flex-shrink-0 bg-white/60 dark:bg-slate-950/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-cyan-500/10 border border-cyan-500/20">
                <Filter className="w-5 h-5 text-cyan-500 dark:text-cyan-400" />
              </div>
              <div>
                <h2 className="text-slate-900 dark:text-white text-lg font-bold">Filter Dashboard</h2>
                <p className="text-slate-500 dark:text-slate-400 text-xs">Select filter criteria to refine your view</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            </button>
          </div>

          {/* Content area - scrollable if modal exceeds viewport */}
          <div className="overflow-y-auto custom-scrollbar flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
              </div>
            ) : (
              <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
                <FilterSection
                  label="Batch / Program"
                  options={batchOptions}
                  value={batch}
                  onChange={setBatch}
                />
                <FilterSection
                  label="Training Center"
                  options={centerOptions}
                  value={center}
                  onChange={setCenter}
                />
                <FilterSection
                  label="Timeframe"
                  options={timeframeOptions}
                  value={timeframe}
                  onChange={setTimeframe}
                />
                <FilterSection
                  label="Risk Level"
                  options={riskLevelOptions}
                  value={riskLevel}
                  onChange={setRiskLevel}
                />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-white/10 bg-white/60 dark:bg-slate-950/40 flex-shrink-0">
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset All
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-5 py-2.5 rounded-lg text-sm font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                className="px-6 py-2.5 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-cyan-500 to-sky-500 hover:from-cyan-400 hover:to-sky-400 transition-all shadow-lg shadow-cyan-500/25"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};

interface FilterSectionProps {
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (val: string) => void;
}

const FilterSection: React.FC<FilterSectionProps> = ({ label, options, value, onChange }) => {
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <label className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
        {label}
      </label>
      <div className="max-h-[200px] overflow-y-auto overflow-x-hidden custom-scrollbar rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5">
        <div className="flex flex-col gap-1 p-2">
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                onClick={() => onChange(option.value)}
                className={`flex items-center justify-between w-full min-w-0 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  isSelected
                    ? 'text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-500/10'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
              >
                <span className="flex-1 text-left truncate pr-2" title={option.label}>
                  {option.label}
                </span>
                {isSelected && <Check className="w-4 h-4 text-cyan-400 flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const DashboardFilters: React.FC<DashboardFiltersProps> = ({ onFilterChange }) => {
  const [popupOpen, setPopupOpen] = useState(false);
  const [filters, setFilters] = useState({
    batch: 'all',
    center: 'all',
    timeframe: '',
    riskLevel: 'All Levels',
  });
  
  const onFilterChangeRef = useRef(onFilterChange);
  onFilterChangeRef.current = onFilterChange;

  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const response = await axios.get('/api/admin/dashboard/filters');
        const data = response.data;
        if (data.timeframes && data.timeframes.length > 0) {
          setFilters(prev => ({ ...prev, timeframe: data.timeframes[0] }));
        }
      } catch {
        // Silently fail - defaults will be used
      }
    };
    fetchFilters();
  }, []);

  const handleApply = useCallback((values: { batch: string; center: string; timeframe: string; riskLevel: string }) => {
    setFilters(values);
    if (onFilterChangeRef.current) {
      onFilterChangeRef.current(values);
    }
  }, []);

  const activeFiltersCount = [
    filters.batch !== 'all',
    filters.center !== 'all',
    filters.riskLevel !== 'All Levels',
  ].filter(Boolean).length;

  return (
    <>
      <button
        onClick={() => setPopupOpen(true)}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
          activeFiltersCount > 0
            ? 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-600 dark:text-cyan-400'
            : 'bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:border-slate-300 dark:hover:border-white/20'
        }`}
      >
        <Filter className="w-4 h-4" />
        <span>Filters</span>
        {activeFiltersCount > 0 && (
          <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold bg-cyan-400 text-slate-900">
            {activeFiltersCount}
          </span>
        )}
      </button>

      <FilterPopup
        open={popupOpen}
        onClose={() => setPopupOpen(false)}
        onApply={handleApply}
        initialValues={filters}
      />
    </>
  );
};

export default DashboardFilters;
