import React, { useState } from 'react';
import { Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Chart Data Types
export interface ChartFunnel {
  total: number;
  onTrack: { count: number; percentage: number };
  atRisk: { count: number; percentage: number };
  disqualified: { count: number; percentage: number };
}

export interface ChartIntegrityBreakdown {
  totalCheckins: number;
  flaggedAnomalies: number;
  score: number;
  flags: {
    gpsViolations: { count: number; percentage: number };
    deviceAnomalies: { count: number; percentage: number };
  };
}

export interface WeeklyTrendPoint {
  date: string;
  day: string;
  rate: number;
}

export interface DashboardChartsProps {
  charts: {
    funnel: ChartFunnel;
    integrityBreakdown: ChartIntegrityBreakdown;
    weeklyTrends: WeeklyTrendPoint[];
  } | null;
  loading: boolean;
}

const generateDynamicTicks = (value: number) => {
  const targetMax = Math.max(100, value * 1.15);
  const rawStep = targetMax / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;

  let step = magnitude;
  if (normalized <= 1) step = magnitude;
  else if (normalized <= 2) step = 2 * magnitude;
  else if (normalized <= 5) step = 5 * magnitude;
  else step = 10 * magnitude;

  const max = step * 4;
  const ticks: string[] = [];
  for (let i = 4; i >= 0; i--) {
    const val = i * step;
    if (val >= 1000) {
      ticks.push(`${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}K`);
    } else {
      ticks.push(val.toString());
    }
  }
  return { ticks, max };
};

const DashboardCharts: React.FC<DashboardChartsProps> = ({ charts, loading }) => {
  const [hoveredSegment, setHoveredSegment] = useState<'ontrack' | 'atrisk' | 'disqualified' | null>(null);
  const [hoveredTrendIndex, setHoveredTrendIndex] = useState<number | null>(null);

  // Skeleton Loader for charts
  if (loading || !charts) {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 w-full">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="w-full rounded-2xl animate-pulse glass-card"
            style={{
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              height: '270px',
            }}
          >
            <div className="flex flex-col gap-2">
              <div className="h-5 bg-slate-200 dark:bg-white/10 rounded w-1/2" />
              <div className="h-3 bg-slate-100 dark:bg-white/5 rounded w-3/4" />
            </div>
            <div className="flex-1 bg-slate-100 dark:bg-white/5 rounded-xl flex items-center justify-center">
              <div className="w-24 h-24 rounded-full border-4 border-slate-200 dark:border-white/10 border-t-slate-400 dark:border-t-white/30 animate-spin" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Segment Math for Donut Chart (Funnel)
  const totalStudents = charts.funnel.total || 0;
  const onTrackPercent = charts.funnel.onTrack.percentage || 0;
  const atRiskPercent = charts.funnel.atRisk.percentage || 0;
  const disqualifiedPercent = charts.funnel.disqualified.percentage || 0;

  const R = 50;
  const circumference = 2 * Math.PI * R; // ~314.16

  const onTrackDash = `${(onTrackPercent / 100) * circumference} ${circumference}`;
  const atRiskDash = `${(atRiskPercent / 100) * circumference} ${circumference}`;
  const disqualifiedDash = `${(disqualifiedPercent / 100) * circumference} ${circumference}`;

  const onTrackOffset = 0;
  const atRiskOffset = -((onTrackPercent / 100) * circumference);
  const disqualifiedOffset = -(((onTrackPercent + atRiskPercent) / 100) * circumference);

  // Math for Integrity Breakdown (Bar Chart)
  const totalCheckins = charts.integrityBreakdown.totalCheckins || 0;
  const deviceAnomalies = charts.integrityBreakdown.flags.deviceAnomalies.count || 0;
  const gpsViolations = charts.integrityBreakdown.flags.gpsViolations.count || 0;
  const rightTotal = gpsViolations + deviceAnomalies;

  // Generate dynamic Y-axis ticks and max scaling bound
  const { ticks: integrityTicks, max: maxIntegrity } = generateDynamicTicks(totalCheckins);
  const leftBarHeightPercent = (totalCheckins / maxIntegrity) * 100;
  const rightBarHeightPercent = (rightTotal / maxIntegrity) * 100;

  // Math for Weekly Engagement Trends (Line Chart)
  const weeklyTrends = charts.weeklyTrends || [];
  const svgW = 480;
  const svgH = 265; 
  const padL = 40;
  const padR = 20; // Stretched to fill the entire card width
  const padT = 15;
  const padB = 45;

  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const getX = (index: number) => padL + (index / (Math.max(1, weeklyTrends.length - 1))) * plotW;
  const getY = (rate: number) => padT + plotH - (rate / 100) * plotH;

  const trendPoints = weeklyTrends.map((t, idx) => ({
    x: getX(idx),
    y: getY(t.rate),
    rate: t.rate,
    date: t.date,
    day: t.day,
  }));

  // Smooth Bezier Curve Path Generator
  const getCurvePath = (points: { x: number; y: number }[]) => {
    if (points.length === 0) return '';
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cpX1 = p0.x + (p1.x - p0.x) / 2;
      const cpY1 = p0.y;
      const cpX2 = p0.x + (p1.x - p0.x) / 2;
      const cpY2 = p1.y;
      path += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p1.x} ${p1.y}`;
    }
    return path;
  };

  const linePath = getCurvePath(trendPoints);

  const greenZoneY = getY(100);
  const greenZoneH = getY(85) - getY(100);

  const orangeZoneY = getY(85);
  const orangeZoneH = getY(70) - getY(85);

  const redZoneY = getY(70);
  const redZoneH = getY(0) - getY(70);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 w-full">
      
      {/* Chart A: Placement Eligibility Funnel */}
      <div
        className="w-full rounded-2xl transition-all duration-300 flex flex-col glass-card"
        style={{
          padding: '20px 24px 28px',
          height: '340px',
          gap: '12px',
        }}
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="text-slate-900 dark:text-white text-[15px] font-bold tracking-tight">
              A. Placement Eligibility Funnel
            </span>
            <div className="relative group">
              <Info size={14} className="text-slate-400 dark:text-[#5c6080] hover:text-slate-600 dark:hover:text-[#8b90b8] cursor-help transition-colors" />
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-48 bg-white dark:bg-slate-950/95 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white text-[10px] p-2 rounded-lg shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                Distribution of students categorized by attendance requirements.
              </div>
            </div>
          </div>
          <span className="text-slate-500 dark:text-[#8b90b8] text-[11px] font-semibold block mt-0.5">
            Distribution of students by attendance eligibility
          </span>
        </div>

        <div className="flex items-center justify-center gap-14 flex-1">
          {/* Donut Area */}
          <div className="relative w-[180px] h-[180px] flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 120 120" className="w-full h-full transform -rotate-90">
              {/* Background Circle Track */}
              <circle cx="60" cy="60" r={R} fill="transparent" className="stroke-slate-200 dark:stroke-white/5" strokeWidth={11} />
              
              {/* On Track Segment */}
              <circle
                cx="60"
                cy="60"
                r={R}
                fill="transparent"
                stroke="#12b76a"
                strokeWidth={11}
                strokeDasharray={onTrackDash}
                strokeDashoffset={onTrackOffset}
                strokeLinecap="round"
                className="transition-all duration-500 cursor-pointer"
                onMouseEnter={() => setHoveredSegment('ontrack')}
                onMouseLeave={() => setHoveredSegment(null)}
                style={{
                  filter: hoveredSegment === 'ontrack' ? 'drop-shadow(0 0 4px #12b76a)' : 'none',
                  opacity: hoveredSegment && hoveredSegment !== 'ontrack' ? 0.4 : 1,
                }}
              />

              {/* At Risk Segment */}
              <circle
                cx="60"
                cy="60"
                r={R}
                fill="transparent"
                stroke="#f79009"
                strokeWidth={11}
                strokeDasharray={atRiskDash}
                strokeDashoffset={atRiskOffset}
                strokeLinecap="round"
                className="transition-all duration-500 cursor-pointer"
                onMouseEnter={() => setHoveredSegment('atrisk')}
                onMouseLeave={() => setHoveredSegment(null)}
                style={{
                  filter: hoveredSegment === 'atrisk' ? 'drop-shadow(0 0 4px #f79009)' : 'none',
                  opacity: hoveredSegment && hoveredSegment !== 'atrisk' ? 0.4 : 1,
                }}
              />

              {/* Disqualified Segment */}
              <circle
                cx="60"
                cy="60"
                r={R}
                fill="transparent"
                stroke="#f04438"
                strokeWidth={11}
                strokeDasharray={disqualifiedDash}
                strokeDashoffset={disqualifiedOffset}
                strokeLinecap="round"
                className="transition-all duration-500 cursor-pointer"
                onMouseEnter={() => setHoveredSegment('disqualified')}
                onMouseLeave={() => setHoveredSegment(null)}
                style={{
                  filter: hoveredSegment === 'disqualified' ? 'drop-shadow(0 0 4px #f04438)' : 'none',
                  opacity: hoveredSegment && hoveredSegment !== 'disqualified' ? 0.4 : 1,
                }}
              />
            </svg>

            {/* Inner text overlay */}
            <div className="absolute flex flex-col items-center justify-center text-center animate-fade-in" style={{ gap: '2px' }}>
              <span className="text-slate-900 dark:text-white text-3xl font-black leading-none tracking-tight">
                {totalStudents.toLocaleString()}
              </span>
              <span className="text-slate-500 dark:text-[#8b90b8] text-[10px] font-extrabold uppercase tracking-widest leading-none mt-1">
                Total Students
              </span>
            </div>
          </div>

          {/* Right Legend */}
          <div className="flex flex-col gap-2.5 min-w-[120px]">
            {/* On Track */}
            <div
              className="flex items-start gap-2.5 transition-all duration-300 cursor-pointer"
              onMouseEnter={() => setHoveredSegment('ontrack')}
              onMouseLeave={() => setHoveredSegment(null)}
              style={{ opacity: hoveredSegment && hoveredSegment !== 'ontrack' ? 0.5 : 1 }}
            >
              <span className="w-3 h-3 rounded bg-[#12b76a] mt-0.5 flex-shrink-0" />
              <div className="flex flex-col">
                <span className="text-slate-700 dark:text-[#e2e8f0] text-[11px] font-bold leading-none">On Track (&ge;85%)</span>
                <span className="text-slate-500 dark:text-[#8b90b8] text-[11px] font-bold mt-1">
                  {charts.funnel.onTrack.count} ({onTrackPercent}%)
                </span>
              </div>
            </div>

            {/* At Risk */}
            <div
              className="flex items-start gap-2.5 transition-all duration-300 cursor-pointer"
              onMouseEnter={() => setHoveredSegment('atrisk')}
              onMouseLeave={() => setHoveredSegment(null)}
              style={{ opacity: hoveredSegment && hoveredSegment !== 'atrisk' ? 0.5 : 1 }}
            >
              <span className="w-3 h-3 rounded bg-[#f79009] mt-0.5 flex-shrink-0" />
              <div className="flex flex-col">
                <span className="text-slate-700 dark:text-[#e2e8f0] text-[11px] font-bold leading-none">At Risk (75% - 84%)</span>
                <span className="text-slate-500 dark:text-[#8b90b8] text-[11px] font-bold mt-1">
                  {charts.funnel.atRisk.count} ({atRiskPercent}%)
                </span>
              </div>
            </div>

            {/* Disqualified */}
            <div
              className="flex items-start gap-2.5 transition-all duration-300 cursor-pointer"
              onMouseEnter={() => setHoveredSegment('disqualified')}
              onMouseLeave={() => setHoveredSegment(null)}
              style={{ opacity: hoveredSegment && hoveredSegment !== 'disqualified' ? 0.5 : 1 }}
            >
              <span className="w-3 h-3 rounded bg-[#f04438] mt-0.5 flex-shrink-0" />
              <div className="flex flex-col">
                <span className="text-slate-700 dark:text-[#e2e8f0] text-[11px] font-bold leading-none">Disqualified (&lt;75%)</span>
                <span className="text-slate-500 dark:text-[#8b90b8] text-[11px] font-bold mt-1">
                  {charts.funnel.disqualified.count} ({disqualifiedPercent}%)
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Chart B: Attendance Integrity Breakdown */}
      <div
        className="w-full rounded-2xl transition-all duration-300 flex flex-col glass-card"
        style={{
          padding: '20px 24px 28px',
          height: '340px',
          gap: '12px',
        }}
      >
        <div className="flex flex-col gap-1.5 w-full select-none">
          {/* Row 1: Title, Info & Score */}
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <span className="text-slate-900 dark:text-white text-[15px] font-bold tracking-tight">
                B. Attendance Integrity Breakdown
              </span>
              <div className="relative group">
                <Info size={14} className="text-slate-400 dark:text-[#5c6080] hover:text-slate-600 dark:hover:text-[#8b90b8] cursor-help transition-colors" />
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-48 bg-white dark:bg-slate-950/95 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white text-[10px] p-2 rounded-lg shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                  Summary of security checks, comparing total check-ins to geofence and client footprint flags.
                </div>
              </div>
            </div>
            {/* Integrity Score */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 dark:text-[#8b90b8] text-[9px] uppercase tracking-wider font-extrabold">Score:</span>
              <span className="text-base font-black text-[#fdb022] drop-shadow-[0_0_4px_rgba(253,176,34,0.3)]">
                {charts.integrityBreakdown.score}%
              </span>
            </div>
          </div>

          {/* Row 2: Subtitle */}
          <span className="text-slate-500 dark:text-[#8b90b8] text-[11px] font-semibold">
            Check-ins vs flagged anomalies
          </span>

          {/* Row 3: Legends (Full Width, Inline, with Top Border) */}
          <div className="flex items-center gap-4 text-[10px] font-bold border-t border-slate-200 dark:border-white/5 pt-1.5 mt-0.5">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded bg-[#f04438] flex-shrink-0" />
              <span className="text-slate-500 dark:text-[#8b90b8]">GPS: <span className="text-slate-900 dark:text-white">{gpsViolations} ({charts.integrityBreakdown.flags.gpsViolations.percentage}%)</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded bg-[#f79009] flex-shrink-0" />
              <span className="text-slate-500 dark:text-[#8b90b8]">Device: <span className="text-slate-900 dark:text-white">{deviceAnomalies} ({charts.integrityBreakdown.flags.deviceAnomalies.percentage}%)</span></span>
            </div>
          </div>
        </div>

        <div className="flex items-end justify-between gap-3 w-full flex-1">
          {/* Ticks */}
          <div className="flex flex-col justify-between h-[170px] text-[#5c6080] text-[9px] font-bold pr-1 select-none mb-5">
            {integrityTicks.map((tick, idx) => (
              <span key={idx}>{tick}</span>
            ))}
          </div>

          {/* Plot Container - Stretches full-width */}
          <div className="flex-1 h-[185px] border-b border-slate-200 dark:border-white/10 flex items-end justify-around relative mb-5">
            {/* Horizontal gridlines */}
            <div className="absolute left-0 right-0 top-[20%] border-t border-slate-200 dark:border-white/[0.03] pointer-events-none" />
            <div className="absolute left-0 right-0 top-[45%] border-t border-slate-200 dark:border-white/[0.03] pointer-events-none" />
            <div className="absolute left-0 right-0 top-[70%] border-t border-slate-200 dark:border-white/[0.03] pointer-events-none" />

            {/* Bar 1: Total Check-ins */}
            <div className="flex flex-col justify-end items-center w-28 h-full relative">
              <div
                className="w-14 rounded-t-md relative flex items-start justify-center group transition-all duration-500"
                style={{
                  height: `${Math.max(1, leftBarHeightPercent)}%`,
                  background: 'linear-gradient(180deg, #12b76a 0%, rgba(18, 183, 106, 0.4) 100%)',
                  boxShadow: '0 0 12px rgba(18, 183, 106, 0.15)',
                }}
              >
                <span className="absolute -top-5 text-slate-900 dark:text-white text-[10px] font-black tracking-tight bg-slate-100 dark:bg-slate-950/40 px-1 rounded shadow-sm">
                  {totalCheckins.toLocaleString()}
                </span>
              </div>
              <span className="absolute top-full mt-2 text-slate-500 dark:text-[#8b90b8] text-[9px] font-bold whitespace-nowrap text-center">
                Total Check-ins
              </span>
            </div>

            {/* Bar 2: Flagged Anomalies */}
            <div className="flex flex-col justify-end items-center w-28 h-full relative">
              <div
                className="w-14 rounded-t-md relative flex flex-col justify-end overflow-hidden shadow-[0_0_8px_rgba(240,68,56,0.2)] transition-all duration-500"
                style={{
                  height: `${Math.max(1, rightBarHeightPercent)}%`,
                }}
              >
                {/* GPS Violations (Red segment at top) */}
                {gpsViolations > 0 && (
                  <div
                    style={{
                      flex: gpsViolations,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'linear-gradient(180deg, #f04438 0%, rgba(240, 68, 56, 0.5) 100%)',
                    }}
                  >
                    {rightBarHeightPercent > 10 && (
                      <span className="text-white text-[10px] font-black drop-shadow-md">
                        {gpsViolations}
                      </span>
                    )}
                  </div>
                )}
                {/* Device Anomalies (Orange segment at bottom) */}
                {deviceAnomalies > 0 && (
                  <div
                    style={{
                      flex: deviceAnomalies,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'linear-gradient(180deg, #f79009 0%, rgba(247, 144, 9, 0.6) 100%)',
                    }}
                  >
                    {rightBarHeightPercent > 10 && (
                      <span className="text-white text-[10px] font-black drop-shadow-md">
                        {deviceAnomalies}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <span className="absolute -top-5 text-slate-900 dark:text-white text-[10px] font-black tracking-tight bg-slate-100 dark:bg-slate-950/40 px-1 rounded shadow-sm">
                {rightTotal.toLocaleString()}
              </span>
              <span className="absolute top-full mt-2 text-slate-500 dark:text-[#8b90b8] text-[9px] font-bold whitespace-nowrap text-center">
                Flagged Anomalies
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Chart C: Weekly Engagement Trends */}
      <div
        className="w-full rounded-2xl transition-all duration-300 flex flex-col glass-card"
        style={{
          padding: '20px 24px 28px',
          height: '340px',
          gap: '12px',
        }}
      >
        <div className="flex flex-col gap-1.5 w-full select-none">
          {/* Row 1: Title & Info */}
          <div className="flex items-center gap-2">
            <span className="text-slate-900 dark:text-white text-[15px] font-bold tracking-tight">
              C. Weekly Engagement Trends
            </span>
            <div className="relative group">
              <Info size={14} className="text-slate-400 dark:text-[#5c6080] hover:text-slate-600 dark:hover:text-[#8b90b8] cursor-help transition-colors" />
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-48 bg-white dark:bg-slate-950/95 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white text-[10px] p-2 rounded-lg shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                Attendance rate percentages monitored over a moving 7-day period.
              </div>
            </div>
          </div>

          {/* Row 2: Subtitle */}
          <span className="text-slate-500 dark:text-[#8b90b8] text-[11px] font-semibold">
            Attendance rate over time
          </span>

          {/* Row 3: Legends (Full Width, Inline, with Top Border) */}
          <div className="flex items-center gap-4 text-[10px] font-bold border-t border-slate-200 dark:border-white/5 pt-1.5 mt-0.5">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded bg-[#12b76a] flex-shrink-0" />
              <span className="text-slate-500 dark:text-[#8b90b8]">Green Zone: <span className="text-slate-900 dark:text-white">&ge;85%</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded bg-[#f79009] flex-shrink-0" />
              <span className="text-slate-500 dark:text-[#8b90b8]">Orange Zone: <span className="text-slate-900 dark:text-white">70%–85%</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded bg-[#f04438] flex-shrink-0" />
              <span className="text-slate-500 dark:text-[#8b90b8]">Red Zone: <span className="text-slate-900 dark:text-white">&lt;70%</span></span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center w-full flex-1">
          {/* Line Chart Plot Area - Stretches full-width */}
          <div className="relative w-full h-[235px] mt-1">
            <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-full">
              {/* Defs for Glow Filter */}
              <defs>
                <filter id="trendLineGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Y Axis Grid Lines & Ticks */}
              {[0, 50, 70, 85, 100].map((tick) => {
                const tickY = getY(tick);
                return (
                  <g key={tick} className="opacity-80">
                    <line
                      x1={padL}
                      y1={tickY}
                      x2={padL + plotW}
                      y2={tickY}
                      className="stroke-slate-200 dark:stroke-white/10"
                      strokeWidth={1}
                    />
                    <text
                      x={padL - 8}
                      y={tickY + 3.5}
                      textAnchor="end"
                      className="fill-slate-500 dark:fill-[#5c6080] text-[9px] font-bold select-none"
                    >
                      {tick}%
                    </text>
                  </g>
                );
              })}

              {/* Background Filled Zones */}
              {/* Green Zone (85% - 100%) */}
              <rect x={padL} y={greenZoneY} width={plotW} height={greenZoneH} fill="rgba(18, 183, 106, 0.04)" />
              {/* Orange Zone (70% - 85%) */}
              <rect x={padL} y={orangeZoneY} width={plotW} height={orangeZoneH} fill="rgba(247, 144, 9, 0.04)" />
              {/* Red Zone (0% - 70%) */}
              <rect x={padL} y={redZoneY} width={plotW} height={redZoneH} fill="rgba(240, 68, 56, 0.04)" />

              {/* Threshold dashed lines */}
              <line x1={padL} y1={getY(85)} x2={padL + plotW} y2={getY(85)} stroke="rgba(247, 144, 9, 0.2)" strokeDasharray="3 3" />
              <line x1={padL} y1={getY(70)} x2={padL + plotW} y2={getY(70)} stroke="rgba(240, 68, 56, 0.2)" strokeDasharray="3 3" />

              {/* Curved Trend Line */}
              {linePath && (
                <path
                  d={linePath}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth={3}
                  filter="url(#trendLineGlow)"
                  className="transition-all duration-300"
                />
              )}

              {/* Sparkle Bullets for Dates */}
              {trendPoints.map((p, idx) => {
                const isRed = p.rate < 70;
                const isOrange = p.rate >= 70 && p.rate < 85;
                const markerColor = isRed ? '#f04438' : isOrange ? '#f79009' : '#12b76a';

                return (
                  <g key={idx}>
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={hoveredTrendIndex === idx ? 7 : 4.5}
                      fill="#ffffff"
                      stroke={markerColor}
                      strokeWidth={2.5}
                      className="cursor-pointer transition-all duration-200"
                      onMouseEnter={() => setHoveredTrendIndex(idx)}
                      onMouseLeave={() => setHoveredTrendIndex(null)}
                      style={{
                        filter: 'drop-shadow(0 0 3px rgba(255,255,255,0.8))',
                      }}
                    />

                    {/* X Axis Label */}
                    <text
                      x={p.x}
                      y={svgH - padB + 12}
                      textAnchor="middle"
                      className="fill-slate-500 dark:fill-[#5c6080] text-[9px] font-extrabold select-none"
                    >
                      {p.day.split(' ')[0]}
                    </text>
                    <text
                      x={p.x}
                      y={svgH - padB + 20}
                      textAnchor="middle"
                      className="fill-slate-500 dark:fill-[#5c6080] text-[8px] font-semibold select-none"
                    >
                      {p.day.split(' ')[1] || ''}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Bullet Rate Floating Tooltip */}
            <AnimatePresence>
              {hoveredTrendIndex !== null && trendPoints[hoveredTrendIndex] && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 10 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bg-white dark:bg-slate-950/95 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white rounded-lg p-2 text-[10px] pointer-events-none shadow-xl flex flex-col gap-0.5 z-40"
                  style={{
                    left: `${(trendPoints[hoveredTrendIndex].x / svgW) * 100}%`,
                    top: `${(trendPoints[hoveredTrendIndex].y / svgH) * 100 - 32}%`,
                    transform: 'translateX(-50%)',
                  }}
                >
                  <span className="font-extrabold">{trendPoints[hoveredTrendIndex].date}</span>
                  <span className="text-slate-500 dark:text-[#8b90b8] font-bold">
                    Rate:{' '}
                    <span
                      className={
                        trendPoints[hoveredTrendIndex].rate < 70
                          ? 'text-[#f97066]'
                          : trendPoints[hoveredTrendIndex].rate < 85
                          ? 'text-[#fdb022]'
                          : 'text-[#32d583]'
                      }
                    >
                      {trendPoints[hoveredTrendIndex].rate}%
                    </span>
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

    </div>
  );
};

export default DashboardCharts;
