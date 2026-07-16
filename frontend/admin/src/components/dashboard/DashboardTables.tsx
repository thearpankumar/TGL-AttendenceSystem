import React, { useState } from 'react';
import {
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Minus,
  CheckCircle2,
  XCircle,
  MessageSquareWarning,
  Users2,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RescueEntry {
  rollNo: string;
  name: string;
  batch: string;
  attendance: number;
  trend: 'up' | 'right' | 'down';
}

export interface QuarantineEntry {
  _id: string;
  rollNo: string;
  name: string;
  flag: string;
  distance: number;
  face: 'Y' | 'N';
}

export interface LowBatchEntry {
  name: string;
  center: string;
  trainer: string;
  attendance: number;
}

export interface WorklistsData {
  rescueList: RescueEntry[];
  rescueCount: number;
  quarantineList: QuarantineEntry[];
  quarantineCount: number;
  lowBatches: LowBatchEntry[];
  lowBatchesCount: number;
}

interface DashboardTablesProps {
  worklists: WorklistsData | null;
  loading: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const pctClass = (pct: number) => {
  if (pct < 75) return 'worklist-pct worklist-pct-danger';
  if (pct < 85) return 'worklist-pct worklist-pct-warning';
  return 'worklist-pct worklist-pct-ok';
};

const flagBadgeClass = (flag: string) => {
  const f = flag.toLowerCase();
  if (f.includes('gps')) return 'worklist-badge worklist-badge-red';
  if (f.includes('device') || f.includes('multi')) return 'worklist-badge worklist-badge-amber';
  if (f.includes('fingerprint') || f.includes('shared')) return 'worklist-badge worklist-badge-purple';
  return 'worklist-badge worklist-badge-slate';
};

const TrendIcon: React.FC<{ trend: 'up' | 'right' | 'down' }> = ({ trend }) => {
  if (trend === 'up') return <TrendingUp size={14} className="text-[#32d583]" />;
  if (trend === 'down') return <TrendingDown size={14} className="text-[#f97066]" />;
  return <Minus size={14} className="text-[#fdb022]" />;
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

const SkeletonPanel: React.FC<{ accent: string }> = ({ accent }) => (
  <div className={`worklist-card worklist-card-${accent}`}>
    <div className="worklist-header">
      <div className="worklist-header-top">
        <div className="worklist-skeleton-cell" style={{ width: 180, height: 16 }} />
        <div className="worklist-skeleton-cell" style={{ width: 36, height: 20, borderRadius: 999 }} />
      </div>
      <div className="worklist-skeleton-cell" style={{ width: 210, height: 11, marginTop: 4 }} />
    </div>
    {[...Array(5)].map((_, i) => (
      <div className="worklist-skeleton-row" key={i}>
        <div className="worklist-skeleton-cell" style={{ width: 90, height: 12 }} />
        <div className="worklist-skeleton-cell" style={{ flex: 1, height: 13, margin: '0 12px' }} />
        <div className="worklist-skeleton-cell" style={{ width: 60, height: 12 }} />
      </div>
    ))}
  </div>
);

// ─── Panel A: Placement Rescue List ──────────────────────────────────────────
const RESCUE_MIN_W = 420;

const RescueListPanel: React.FC<{ data: WorklistsData }> = ({ data }) => {
  const { rescueList, rescueCount } = data;

  return (
    <div className="worklist-card worklist-card-red">
      <div className="worklist-header">
        <div className="worklist-header-top">
          <div className="worklist-title">
            <ShieldAlert size={16} className="worklist-icon-red flex-shrink-0" />
            <span className="worklist-title-text">1. Placement Rescue List</span>
          </div>
          <span className="worklist-count-badge worklist-count-red">{rescueCount}</span>
        </div>
        <p className="worklist-subtitle">Students at risk of placement disqualification</p>
      </div>

      <div className="worklist-scroll-zone">
        <div className="worklist-table-inner" style={{ minWidth: RESCUE_MIN_W }}>
          <div className="worklist-table-header">
            <span className="worklist-col-label" style={{ width: 95, flexShrink: 0 }}>Roll No</span>
            <span className="worklist-col-label" style={{ flex: 1, minWidth: 120 }}>Name</span>
            <span className="worklist-col-label" style={{ width: 100, flexShrink: 0 }}>Batch</span>
            <span className="worklist-col-label" style={{ width: 55, flexShrink: 0, textAlign: 'right' }}>Att%</span>
            <span className="worklist-col-label" style={{ width: 36, flexShrink: 0, textAlign: 'center' }}>Trend</span>
          </div>

          <div className="worklist-body">
            {rescueList.length === 0 ? (
              <div className="worklist-empty">
                <span className="worklist-empty-icon">🎉</span>
                <span className="worklist-empty-text">No students at risk right now</span>
              </div>
            ) : (
              rescueList.map((entry, idx) => (
                <div className="worklist-row" key={`${entry.rollNo}-${idx}`}>
                  <span className="worklist-cell worklist-roll" style={{ width: 95, flexShrink: 0 }} title={entry.rollNo}>
                    {entry.rollNo}
                  </span>
                  <span className="worklist-cell worklist-name" style={{ flex: 1, minWidth: 120, paddingRight: 8 }} title={entry.name}>
                    {entry.name}
                  </span>
                  <span className="worklist-cell worklist-meta" style={{ width: 100, flexShrink: 0, paddingRight: 8 }} title={entry.batch}>
                    {entry.batch}
                  </span>
                  <span className={`worklist-cell ${pctClass(entry.attendance)}`} style={{ width: 55, flexShrink: 0, justifyContent: 'flex-end' }}>
                    {entry.attendance}%
                  </span>
                  <span className="worklist-cell" style={{ width: 36, flexShrink: 0, justifyContent: 'center' }}>
                    <TrendIcon trend={entry.trend} />
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Panel B: Security Quarantine ────────────────────────────────────────────
const QUARANTINE_MIN_W = 460;

const QuarantinePanel: React.FC<{ data: WorklistsData }> = ({ data }) => {
  const [list] = useState<QuarantineEntry[]>(data.quarantineList);
  const [count] = useState<number>(data.quarantineCount);

  return (
    <div className="worklist-card worklist-card-amber">
      <div className="worklist-header">
        <div className="worklist-header-top">
          <div className="worklist-title">
            <MessageSquareWarning size={16} className="worklist-icon-amber flex-shrink-0" />
            <span className="worklist-title-text">2. Security Quarantine</span>
          </div>
          <span className="worklist-count-badge worklist-count-amber">{count}</span>
        </div>
        <p className="worklist-subtitle">High priority flags requiring review</p>
      </div>

      <div className="worklist-scroll-zone">
        <div className="worklist-table-inner" style={{ minWidth: QUARANTINE_MIN_W }}>
          <div className="worklist-table-header">
            <span className="worklist-col-label" style={{ width: 100, flexShrink: 0 }}>Roll No</span>
            <span className="worklist-col-label" style={{ flex: 1, minWidth: 120 }}>Name</span>
            <span className="worklist-col-label" style={{ width: 130, flexShrink: 0 }}>Device Flag</span>
            <span className="worklist-col-label" style={{ width: 60, flexShrink: 0, textAlign: 'right' }}>Dist (m)</span>
            <span className="worklist-col-label" style={{ width: 36, flexShrink: 0, textAlign: 'center' }}>Face</span>
          </div>

          <div className="worklist-body">
            {list.length === 0 ? (
              <div className="worklist-empty">
                <span className="worklist-empty-icon">🛡️</span>
                <span className="worklist-empty-text">No flagged records — all clear</span>
              </div>
            ) : (
              list.map((entry, idx) => (
                <div className="worklist-row" key={`${entry._id}-${idx}`}>
                  <span className="worklist-cell worklist-roll" style={{ width: 100, flexShrink: 0 }} title={entry.rollNo}>
                    {entry.rollNo}
                  </span>
                  <span className="worklist-cell worklist-name" style={{ flex: 1, minWidth: 120, paddingRight: 8 }} title={entry.name}>
                    {entry.name}
                  </span>
                  <span className="worklist-cell" style={{ width: 130, flexShrink: 0, paddingRight: 6 }}>
                    <span className={flagBadgeClass(entry.flag)} title={entry.flag}>{entry.flag}</span>
                  </span>
                  <span className="worklist-cell" style={{ width: 60, flexShrink: 0, justifyContent: 'flex-end', fontSize: 12, fontWeight: 600, color: entry.distance > 100 ? '#f97066' : '#5c6080' }}>
                    {entry.distance > 0 ? entry.distance.toLocaleString() : '—'}
                  </span>
                  <span className="worklist-cell" style={{ width: 36, flexShrink: 0, justifyContent: 'center' }}>
                    {entry.face === 'Y'
                      ? <CheckCircle2 size={14} className="text-[#32d583]" />
                      : <XCircle size={14} className="text-[#f97066]" />}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Panel C: Low-Engagement Batches ─────────────────────────────────────────
const LOW_BATCH_MIN_W = 380;

const LowBatchesPanel: React.FC<{ data: WorklistsData }> = ({ data }) => {
  const { lowBatches, lowBatchesCount } = data;

  return (
    <div className="worklist-card worklist-card-orange">
      <div className="worklist-header">
        <div className="worklist-header-top">
          <div className="worklist-title">
            <Users2 size={16} className="worklist-icon-orange flex-shrink-0" />
            <span className="worklist-title-text">3. Low-Engagement Batches</span>
          </div>
          <span className="worklist-count-badge worklist-count-orange">{lowBatchesCount}</span>
        </div>
        <p className="worklist-subtitle">Batches below target attendance</p>
      </div>

      <div className="worklist-scroll-zone">
        <div className="worklist-table-inner" style={{ minWidth: LOW_BATCH_MIN_W }}>
          <div className="worklist-table-header">
            <span className="worklist-col-label" style={{ flex: 1, minWidth: 120 }}>Batch Name</span>
            <span className="worklist-col-label" style={{ width: 90, flexShrink: 0 }}>Center</span>
            <span className="worklist-col-label" style={{ width: 90, flexShrink: 0 }}>Trainer</span>
            <span className="worklist-col-label" style={{ width: 60, flexShrink: 0, textAlign: 'right' }}>Avg %</span>
          </div>

          <div className="worklist-body">
            {lowBatches.length === 0 ? (
              <div className="worklist-empty">
                <span className="worklist-empty-icon">✅</span>
                <span className="worklist-empty-text">All batches are on track</span>
              </div>
            ) : (
              lowBatches.map((entry, idx) => (
                <div className="worklist-row" key={`${entry.name}-${idx}`}>
                  <span className="worklist-cell worklist-name" style={{ flex: 1, minWidth: 120, paddingRight: 8 }} title={entry.name}>
                    {entry.name}
                  </span>
                  <span className="worklist-cell worklist-meta" style={{ width: 90, flexShrink: 0, paddingRight: 6 }} title={entry.center}>
                    {entry.center}
                  </span>
                  <span className="worklist-cell worklist-meta" style={{ width: 90, flexShrink: 0, paddingRight: 6 }} title={entry.trainer}>
                    {entry.trainer}
                  </span>
                  <span className={`worklist-cell ${pctClass(entry.attendance)}`} style={{ width: 60, flexShrink: 0, justifyContent: 'flex-end' }}>
                    {entry.attendance}%
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Root Export ──────────────────────────────────────────────────────────────

const DashboardTables: React.FC<DashboardTablesProps> = ({ worklists, loading }) => {
  if (loading) {
    return (
      <div className="worklist-grid">
        <SkeletonPanel accent="red" />
        <SkeletonPanel accent="amber" />
        <SkeletonPanel accent="orange" />
      </div>
    );
  }

  if (!worklists) return null;

  return (
    <div className="worklist-grid">
      <RescueListPanel data={worklists} />
      <QuarantinePanel data={worklists} />
      <LowBatchesPanel data={worklists} />
    </div>
  );
};

export default DashboardTables;
