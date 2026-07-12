import { useState } from 'react';
import permLocationImg from '../assets/perm-location.jpg';
import permCameraImg from '../assets/perm-camera.jpg';
import permBiometricImg from '../assets/perm-biometric.jpg';


interface Props {
  locationName: string;
  onAcknowledge: () => void;
  isPrivacyOs: boolean;
}

/* ── Shared SVG icons ─────────────────────────────────────── */
const IcoLock = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);
const IcoShieldCheck = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>
  </svg>
);
const IcoHash = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/>
    <line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>
  </svg>
);
const IcoCheckCircle = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);
const IcoSun = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4"/>
    <path d="M1.05 12H3m18 0h1.95M12 1.05V3m0 18v1.95m-7.07-15.12 1.41 1.41m11.32 11.32 1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
  </svg>
);
const IcoQr = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h2v2h-2zm4 0h3v3h-3zm0 4h3v3h-3zm-4 2h2v3h-2z"/>
  </svg>
);
const IcoAlertTriangle = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);
const IcoInfo = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
  </svg>
);
const IcoChevronDown = ({ flipped }: { flipped: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: flipped ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .2s', flexShrink: 0 }}>
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);
const IcoArrowRight = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M12 5l7 7-7 7"/>
  </svg>
);

/* ── Chrome SVG logo ─────────────────────────────────────── */
const ChromeLogo = () => (
  <svg width="22" height="22" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="50" fill="#fff"/>
    <circle cx="50" cy="50" r="20" fill="#4285F4"/>
    <path d="M50 30h43.3A50 50 0 0 0 6.7 30z" fill="#EA4335"/>
    <path d="M6.7 30A50 50 0 0 0 28.3 93.3L50 50z" fill="#FBBC05"/>
    <path d="M28.3 93.3A50 50 0 0 0 93.3 70L50 50z" fill="#34A853"/>
    <circle cx="50" cy="50" r="16" fill="#fff"/>
    <circle cx="50" cy="50" r="12" fill="#4285F4"/>
  </svg>
);
const SafariLogo = () => (
  <svg width="22" height="22" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="onb-saf-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#1e90ff"/>
        <stop offset="100%" stopColor="#007aff"/>
      </linearGradient>
    </defs>
    <circle cx="50" cy="50" r="50" fill="url(#onb-saf-grad)"/>
    <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="2"/>
    <polygon points="50,20 58,50 50,44 42,50" fill="#FF3B30"/>
    <polygon points="50,80 42,50 50,56 58,50" fill="white"/>
  </svg>
);

/* ── Data ─────────────────────────────────────────────────── */
const FLOW_STEPS = [
  { icon: <IcoQr />,          label: 'Scan QR / Open Link',      desc: 'Your instructor shares a session link or QR code' },
  { icon: <IcoHash />,        label: 'Enter Roll Number',         desc: 'Type your roll number (e.g. 21CS042)' },
  { icon: <IcoShieldCheck />, label: 'Verify Identity',           desc: 'Use biometric / passkey (first time: enroll your device)' },
  { icon: <IcoSun />,         label: 'Capture Selfie & Location', desc: 'Take a photo and confirm your GPS location' },
  { icon: <IcoCheckCircle />, label: 'Attendance Recorded',       desc: 'Done! Your attendance is marked successfully' },
];

const PERMISSIONS = [
  {
    icon: <img src={permLocationImg}  alt="Location"  width={28} height={28} style={{ objectFit: 'contain', display: 'block' }} />,
    label: 'Location',
    reason: 'To confirm you are physically present on campus',
    color: '#4f46e5', bg: '#eef2ff',
  },
  {
    icon: <img src={permCameraImg}    alt="Camera"    width={28} height={28} style={{ objectFit: 'contain', display: 'block' }} />,
    label: 'Camera',
    reason: 'To capture a selfie as proof of attendance',
    color: '#0d9488', bg: '#f0fdfa',
  },
  {
    icon: <img src={permBiometricImg} alt="Biometric"  width={28} height={28} style={{ objectFit: 'contain', display: 'block' }} />,
    label: 'Biometric / Passkey',
    reason: 'To verify your identity securely — no password needed',
    color: '#b45309', bg: '#fffbeb',
  },
];

/* ── Component ───────────────────────────────────────────── */
export default function PermissionOnboarding({ locationName, onAcknowledge, isPrivacyOs }: Props) {
  const [showFlow, setShowFlow] = useState(false);

  return (
    <div className="onboard-page">
      <div className="onboard-card">

        {/* ── Header ── */}
        <div className="onboard-header">
          <div className="onboard-logo">
            <IcoLock />
          </div>
          <div>
            <div className="onboard-title">Before You Begin</div>
            <div className="onboard-subtitle">{locationName}</div>
          </div>
        </div>

        <p className="onboard-intro">
          This attendance system uses your <strong>camera</strong>, <strong>location</strong>, and <strong>biometric</strong> to verify your presence. Please read below before proceeding.
        </p>

        {/* ── Privacy OS Warning ── */}
        {isPrivacyOs && (
          <div className="onboard-privacy-warn">
            <span className="onboard-privacy-icon"><IcoAlertTriangle /></span>
            <div>
              <strong>Privacy-focused OS detected</strong>
              <div className="onboard-privacy-detail">
                GrapheneOS / LineageOS / CalyxOS users: GPS may not work indoors and can take 60–90 seconds to get a fix. Step outside and wait before submitting. If location still fails, contact your instructor.
              </div>
            </div>
          </div>
        )}

        {/* ── Permissions Required ── */}
        <div className="onboard-section-label">Permissions this page needs</div>
        <div className="onboard-perms">
          {PERMISSIONS.map(p => (
            <div
              className="onboard-perm-tile"
              key={p.label}
              style={{ '--perm-color': p.color, '--perm-bg': p.bg } as React.CSSProperties}
            >
              <span className="onboard-perm-svg">{p.icon}</span>
              <div className="onboard-perm-info">
                <div className="onboard-perm-label">{p.label}</div>
                <div className="onboard-perm-reason">{p.reason}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Attendance Flow ── */}
        <button className="onboard-flow-toggle" onClick={() => setShowFlow(v => !v)} type="button">
          <IcoInfo />
          {showFlow ? 'Hide' : 'Show'} how attendance works
          <IcoChevronDown flipped={showFlow} />
        </button>

        {showFlow && (
          <div className="onboard-flow">
            {FLOW_STEPS.map((s, i) => (
              <div className="onboard-flow-step" key={i}>
                <div className="onboard-flow-icon">{s.icon}</div>
                <div className="onboard-flow-text">
                  <div className="onboard-flow-label">{s.label}</div>
                  <div className="onboard-flow-desc">{s.desc}</div>
                </div>
                {i < FLOW_STEPS.length - 1 && <div className="onboard-flow-connector" />}
              </div>
            ))}
          </div>
        )}

        {/* ── Recommended Browsers ── */}
        <div className="onboard-browsers">
          <div className="onboard-section-label" style={{ marginBottom: 10 }}>Recommended browsers</div>
          <div className="onboard-browser-row">
            <div className="onboard-browser-chip">
              <ChromeLogo />
              Chrome
              <span className="onboard-browser-badge">Recommended</span>
            </div>
            <div className="onboard-browser-chip">
              <SafariLogo />
              Safari
              <span className="onboard-browser-badge">Recommended</span>
            </div>
          </div>
          <p className="onboard-browser-note">
            Other browsers (Firefox, Mi Browser, Samsung Internet) may have issues with camera or biometric features. Switch to Chrome or Safari for best results.
          </p>
        </div>

        {/* ── Acknowledge Button ── */}
        <button className="onboard-ack-btn" onClick={onAcknowledge} type="button">
          I Understand — Continue to Attendance
          <IcoArrowRight />
        </button>
        <p className="onboard-consent-note">
          By continuing, you allow this page to access your camera, location, and biometric for attendance verification only.
        </p>

      </div>
    </div>
  );
}
