import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import QRCode from 'qrcode';

// Must match backend QR_WINDOW_MS / 1000 and totpWindowSeconds default
const QR_WINDOW_SECONDS = 5;
const TOTP_WINDOW_SECONDS = 15;

const QRDisplay = () => {
  const { id: sessionId } = useParams();
  const navigate = useNavigate();

  const [session, setSession]           = useState(null);
  const [totpCode, setTotpCode]         = useState('');
  const [shortLink, setShortLink]       = useState('');
  const [loading, setLoading]           = useState(true);
  const [qrDataUrl, setQrDataUrl]       = useState('');
  const [error, setError]               = useState('');
  const [paused, setPaused]             = useState(false);

  // Independent countdowns — each lives on its own rhythm
  const [totpCountdown, setTotpCountdown] = useState(TOTP_WINDOW_SECONDS);
  const [qrCountdown, setQrCountdown]     = useState(QR_WINDOW_SECONDS);

  // Refs so interval callbacks always see the latest values without recreating
  const pausedRef    = useRef(false);
  const sessionIdRef = useRef(sessionId);

  useEffect(() => { pausedRef.current    = paused;     }, [paused]);
  useEffect(() => { sessionIdRef.current = sessionId;  }, [sessionId]);

  // ─── QR canvas generation ──────────────────────────────────────────────
  const generateQR = useCallback(async (text) => {
    try {
      const dataUrl = await QRCode.toDataURL(text, {
        width: 400, margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
      setQrDataUrl(dataUrl);
    } catch (err) {
      console.error('QR generation error:', err);
    }
  }, []);

  // ─── TOTP fetch — fires every 15 s ────────────────────────────────────
  const fetchTotp = useCallback(async () => {
    if (pausedRef.current) return;
    try {
      const res = await axios.get(`/api/admin/sessions/${sessionIdRef.current}/totp`);
      setTotpCode(res.data.totpCode);
      setShortLink(res.data.shortLink || '');
      setTotpCountdown(TOTP_WINDOW_SECONDS);   // reset bar to full on each real fetch
    } catch (err) {
      console.error('TOTP fetch error:', err);
    }
  }, []);

  // ─── QR fetch — fires every 5 s ───────────────────────────────────────
  const fetchQR = useCallback(async () => {
    if (pausedRef.current) return;
    try {
      const res = await axios.get(`/api/admin/sessions/${sessionIdRef.current}/totp`);
      const { qrToken, shortLink: link } = res.data;
      if (link) {
        const url = qrToken
          ? `${window.location.origin}/s/${link}?qrt=${encodeURIComponent(qrToken)}`
          : `${window.location.origin}/s/${link}`;
        await generateQR(url);
      }
      setQrCountdown(QR_WINDOW_SECONDS);        // reset bar to full on each real fetch
    } catch (err) {
      console.error('QR fetch error:', err);
    }
  }, [generateQR]);

  // ─── Mount: load session then kick off both timers' first fetch ────────
  useEffect(() => {
    const bootstrap = async () => {
      try {
        const res = await axios.get(`/api/admin/sessions/${sessionId}`);
        setSession(res.data);
        if (!res.data.totpEnabled) {
          setError('TOTP is not enabled for this session. Enable it by attaching a short link.');
          setLoading(false);
          return;
        }
        await Promise.all([fetchTotp(), fetchQR()]);
        setLoading(false);
      } catch {
        setError('Failed to load session');
        setLoading(false);
      }
    };
    bootstrap();
  }, [sessionId, fetchTotp, fetchQR]);

  // ─── TOTP interval: fires every 15 s ──────────────────────────────────
  useEffect(() => {
    if (paused) return;
    const id = setInterval(fetchTotp, TOTP_WINDOW_SECONDS * 1000);
    return () => clearInterval(id);
  }, [fetchTotp, paused]);

  // ─── QR interval: fires every 5 s ─────────────────────────────────────
  useEffect(() => {
    if (paused) return;
    const id = setInterval(fetchQR, QR_WINDOW_SECONDS * 1000);
    return () => clearInterval(id);
  }, [fetchQR, paused]);

  // ─── TOTP countdown tick: 1 s, independent of QR ──────────────────────
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      setTotpCountdown((prev) => (prev <= 1 ? TOTP_WINDOW_SECONDS : prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [paused]);

  // ─── QR countdown tick: 1 s, independent of TOTP ─────────────────────
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      setQrCountdown((prev) => (prev <= 1 ? QR_WINDOW_SECONDS : prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [paused]);

  // ─── Derived values ────────────────────────────────────────────────────
  const totpBarWidth = ((TOTP_WINDOW_SECONDS - totpCountdown) / TOTP_WINDOW_SECONDS) * 100;
  const qrBarWidth   = ((QR_WINDOW_SECONDS   - qrCountdown)   / QR_WINDOW_SECONDS)   * 100;
  const baseUrl      = shortLink ? `${window.location.origin}/s/${shortLink}` : '';
  const isExpired    = session && new Date(session.expiresAt) < new Date();
  const formatTime   = (d) => new Date(d).toLocaleTimeString();

  // ─── Loading ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
        <div style={{ width: 50, height: 50, border: '4px solid #f3f3f3', borderTop: '4px solid #667eea', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <p style={{ marginTop: 20, color: '#666' }}>Loading QR code...</p>
        <style>{`@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // ─── Error ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
        <div style={{ background: '#f8d7da', color: '#721c24', padding: 30, borderRadius: 12, textAlign: 'center', maxWidth: 500 }}>
          <h2 style={{ marginBottom: 15 }}>⚠️ {error}</h2>
          <p style={{ marginBottom: 20 }}>Go to <strong>Short Links</strong> and attach one to this session.</p>
          <button className="btn btn-primary" onClick={() => navigate('/shortlinks')}>Go to Short Links</button>
        </div>
      </div>
    );
  }

  // ─── Main render ──────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: paused ? '#f0f0f0' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <button className="btn btn-secondary" onClick={() => navigate(`/sessions/${sessionId}`)} style={{ background: 'white', color: '#333' }}>
          ← Back to Session
        </button>
        <button className="btn" onClick={() => setPaused(!paused)} style={{ background: paused ? '#27ae60' : '#e74c3c', color: 'white' }}>
          {paused ? '▶ Resume' : '⏸ Pause'}
        </button>
      </div>

      {isExpired && (
        <div style={{ background: '#f8d7da', color: '#721c24', padding: 15, borderRadius: 8, textAlign: 'center', marginBottom: 20 }}>
          <strong>⚠️ Session has expired</strong>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: 600, margin: '0 auto' }}>

        {/* ── TOTP Code + 15 s bar ── */}
        <div style={{ background: 'rgba(255,255,255,0.1)', padding: '15px 30px', borderRadius: 8, marginBottom: 20, textAlign: 'center', width: '100%' }}>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, marginBottom: 5 }}>Students enter this code on the form</div>
          <div style={{ fontSize: 48, fontWeight: 600, letterSpacing: 8, color: 'white', fontFamily: 'Courier New, monospace' }}>
            {totpCode || '------'}
          </div>

          {/* TOTP timer bar — resets every 15 s */}
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>
              <span>Code changes in</span>
              <span style={{ fontWeight: 'bold', color: totpCountdown <= 3 ? '#ff6b6b' : 'rgba(255,255,255,0.9)' }}>
                {totpCountdown}s
              </span>
            </div>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${100 - totpBarWidth}%`,
                background: totpCountdown <= 3 ? '#ff6b6b' : 'rgba(255,255,255,0.8)',
                transition: 'width 0.9s linear',
              }} />
            </div>
          </div>
        </div>

        {/* ── QR Code + 5 s bar ── */}
        <div style={{ background: 'white', padding: 30, borderRadius: 16, boxShadow: '0 10px 40px rgba(0,0,0,0.3)', marginBottom: 12, opacity: paused ? 0.5 : 1 }}>
          {qrDataUrl && <img src={qrDataUrl} alt="QR Code" style={{ width: 350, height: 350, display: 'block' }} />}

          {/* QR timer bar — resets every 5 s */}
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13, color: '#555' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>🔄 <strong>QR expires in</strong></span>
              <span style={{ fontWeight: 'bold', color: qrCountdown <= 1 ? '#e74c3c' : '#667eea', fontSize: 15 }}>
                {qrCountdown}s
              </span>
            </div>
            <div style={{ height: 8, background: '#eee', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${100 - qrBarWidth}%`,
                background: qrCountdown <= 1 ? '#e74c3c' : '#667eea',
                transition: 'width 0.9s linear',
              }} />
            </div>
            <div style={{ fontSize: 11, color: '#999', marginTop: 5, textAlign: 'center' }}>
              Anti-sharing: QR rotates every {QR_WINDOW_SECONDS}s — screenshots won't work
            </div>
          </div>
        </div>



        {/* Session info */}
        <div style={{ color: 'rgba(255,255,255,0.8)', textAlign: 'center', fontSize: 14 }}>
          <p>Session: {session?.description || 'Attendance Session'}</p>
          <p>Expires: {session?.expiresAt ? formatTime(session.expiresAt) : 'N/A'}</p>
        </div>
      </div>

      <style>{`@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

export default QRDisplay;
