import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import PageHeader from '../components/ui/PageHeader';
import DashboardWidgets, { DashboardPulseData } from '../components/dashboard/DashboardWidgets';
import DashboardFilters from '../components/dashboard/DashboardFilters';
import DashboardCharts, { ChartFunnel, ChartIntegrityBreakdown, WeeklyTrendPoint } from '../components/dashboard/DashboardCharts';
import DashboardTables, { WorklistsData } from '../components/dashboard/DashboardTables';

interface DashboardData {
  pulse: DashboardPulseData;
  charts: {
    funnel: ChartFunnel;
    integrityBreakdown: ChartIntegrityBreakdown;
    weeklyTrends: WeeklyTrendPoint[];
  };
  worklists: WorklistsData;
  lastUpdated: string;
}

export interface DashboardFiltersState {
  batch: string;
  center: string;
  timeframe: string;
  riskLevel: string;
}

const Dashboard = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  
  const abortRef = useRef<AbortController | null>(null);
  const filtersRef = useRef<DashboardFiltersState>({
    batch: 'all',
    center: 'all',
    timeframe: '',
    riskLevel: 'All Levels',
  });
  const isMountedRef = useRef(true);

  const fetchStats = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const filtersToUse = filtersRef.current;
      const params: Record<string, string> = {};
      
      if (filtersToUse.batch && filtersToUse.batch !== 'all') {
        params.batchId = filtersToUse.batch;
      }
      if (filtersToUse.center && filtersToUse.center !== 'all') {
        params.locationId = filtersToUse.center;
      }
      if (filtersToUse.timeframe) {
        params.timeframe = filtersToUse.timeframe;
      }
      if (filtersToUse.riskLevel && filtersToUse.riskLevel !== 'All Levels') {
        params.riskLevel = filtersToUse.riskLevel;
      }

      const res = await axios.get<DashboardData>('/api/admin/dashboard', {
        params,
        signal: abortRef.current.signal,
      });
      
      if (isMountedRef.current) {
        setData(res.data);
      }
    } catch (error) {
      if ((error as { name?: string }).name !== 'CanceledError' && isMountedRef.current) {
        toast.error('Failed to fetch dashboard metrics');
      }
    } finally {
      if (isMountedRef.current && !isSilent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    fetchStats();
    
    const interval = setInterval(() => fetchStats(true), 60000);
    
    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [fetchStats]);

  const handleFilterChange = useCallback((newFilters: DashboardFiltersState) => {
    filtersRef.current = newFilters;
    fetchStats();
  }, [fetchStats]);

  return (
    <div className="container min-h-screen bg-slate-50 dark:bg-slate-950 p-6 md:p-8 flex flex-col gap-6 transition-colors duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-col gap-1">
          <PageHeader title="Command Center" />
          <p className="text-slate-500 dark:text-slate-400 text-sm transition-colors duration-300">Real-time Insights. Actionable Decisions.</p>
        </div>
        <DashboardFilters onFilterChange={handleFilterChange} />
      </div>
      <DashboardWidgets pulse={data?.pulse || null} loading={loading} />
      <DashboardCharts charts={data?.charts || null} loading={loading} />
      <DashboardTables worklists={data?.worklists || null} loading={loading} />
    </div>
  );
};

export default Dashboard;
