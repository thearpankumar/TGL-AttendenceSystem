import { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';
import { ShieldAlert } from 'lucide-react';

const Settings = () => {
  const [devBypassEnabled, setDevBypassEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [pendingToggleState, setPendingToggleState] = useState<boolean | null>(null);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/config');
      setDevBypassEnabled(res.data.devBypassEnabled || false);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        toast.error(err.response?.data?.message || 'Failed to fetch settings');
      } else {
        toast.error('Failed to fetch settings');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleToggleClick = () => {
    setPendingToggleState(!devBypassEnabled);
    setShowPasswordModal(true);
  };

  const confirmToggle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      toast.error('Password is required to confirm security changes');
      return;
    }

    try {
      const res = await axios.post('/api/config/dev-bypass', {
        enabled: pendingToggleState,
        password,
      });
      setDevBypassEnabled(res.data.config.devBypassEnabled);
      toast.success(res.data.message);
      setShowPasswordModal(false);
      setPassword('');
      setPendingToggleState(null);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        toast.error(err.response?.data?.message || 'Failed to update settings');
      } else {
        toast.error('Failed to update settings');
      }
      setPassword('');
    }
  };

  return (
    <div className="fade-in" style={{ maxWidth: 800, margin: '0 auto', padding: '32px 16px' }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h2 style={{ fontSize: 32, fontWeight: 700, color: 'var(--text-color)', margin: '0 0 12px 0' }}>System Settings</h2>
        <p style={{ color: 'var(--color-faint)', fontSize: 16, margin: 0 }}>
          Manage global system configurations and security protocols
        </p>
      </div>

      <div className="card" style={{ width: '100%', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
        <div className="card-header" style={{ display: 'flex', alignItems: 'flex-start', gap: 16, borderBottom: '1px solid var(--border-color)', paddingBottom: 20 }}>
          <ShieldAlert size={28} style={{ color: 'var(--color-danger)', flexShrink: 0, marginTop: 4 }} />
          <div>
            <h3 style={{ margin: 0, fontSize: 20, color: 'var(--text-color)', fontWeight: 600 }}>Developer Security Bypass</h3>
            <p style={{ margin: 0, fontSize: 15, color: 'var(--color-faint)', marginTop: 8, lineHeight: 1.6 }}>
              Enable this mode to inject mock testing buttons into the student app and relax hardware constraints. 
              <strong style={{ display: 'block', marginTop: 8, color: 'var(--text-color)' }}>Warning: Bypassed attendance records will be permanently flagged in the database.</strong>
            </p>
          </div>
        </div>
        
        <div className="card-body" style={{ padding: '24px 0 0 0', display: 'flex', flexWrap: 'wrap', gap: 20, justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h4 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-color)' }}>Bypass Mode Status</h4>
            <span style={{ fontSize: 14, color: devBypassEnabled ? 'var(--color-danger)' : 'var(--color-success)', fontWeight: 600, display: 'inline-block', marginTop: 8 }}>
              {devBypassEnabled ? 'Currently Enabled - System is Vulnerable' : 'Currently Disabled - Strict Enforcement'}
            </span>
          </div>
          
          <button 
            className={`attend-btn ${devBypassEnabled ? 'attend-btn-danger' : 'attend-btn'}`}
            style={{ 
              width: '140px', 
              backgroundColor: devBypassEnabled ? 'var(--color-danger)' : 'var(--color-primary)',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 15,
              transition: 'all 0.2s'
            }}
            onClick={handleToggleClick}
            disabled={loading}
          >
            {loading ? 'Loading...' : devBypassEnabled ? 'Disable Mode' : 'Enable Mode'}
          </button>
        </div>
      </div>

      <Modal
        open={showPasswordModal}
        onClose={() => {
          setShowPasswordModal(false);
          setPassword('');
          setPendingToggleState(null);
        }}
        title="Confirm Security Change"
      >
        <form onSubmit={confirmToggle}>
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 14, color: 'var(--color-faint)', marginBottom: 16, lineHeight: 1.5 }}>
              You are about to <strong>{pendingToggleState ? 'ENABLE' : 'DISABLE'}</strong> the Developer Security Bypass. 
              Please enter your administrator password to confirm this action.
            </p>
            <div className="form-group">
              <label>Administrator Password</label>
              <input
                type="password"
                className="form-control"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoFocus
                required
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <Button 
              type="button" 
              variant="secondary" 
              onClick={() => {
                setShowPasswordModal(false);
                setPassword('');
              }}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              variant={pendingToggleState ? 'danger' : 'primary'}
            >
              Confirm
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Settings;
