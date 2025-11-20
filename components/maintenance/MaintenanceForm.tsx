"use client";
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

export default function MaintenanceForm() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/maintenance-unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, redirect }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.redirect) {
          window.location.href = data.redirect;
        } else {
          window.location.href = '/';
        }
      } else {
        const msg = await res.text();
        setError(msg || 'Invalid password');
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0b1020', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
      <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 420, background: '#111827', color: 'white', borderRadius: 12, boxShadow: '0 10px 40px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem 1.25rem' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>CPAAutomation Maintenance</h1>
          <p style={{ color: '#9CA3AF', marginBottom: '1rem' }}>CPAAutomation is currently undergoing maintenance. Please enter the maintenance password to continue.</p>
          <form onSubmit={onSubmit}>
            <label htmlFor="password" style={{ display: 'block', fontSize: 12, color: '#9CA3AF', marginBottom: 6 }}>Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoFocus
              style={{ width: '100%', padding: '0.625rem 0.75rem', borderRadius: 8, border: '1px solid #374151', background: '#111827', color: 'white' }}
            />
            {error && (
              <div style={{ color: '#FCA5A5', fontSize: 12, marginTop: 8 }}>{error}</div>
            )}
            <button
              type="submit"
              disabled={loading}
              style={{ marginTop: 12, width: '100%', background: '#2563EB', color: 'white', padding: '0.625rem 0.75rem', borderRadius: 8, fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.8 : 1 }}
            >
              {loading ? 'Verifying…' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
