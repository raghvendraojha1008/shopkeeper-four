import React, { useState, useEffect } from 'react';
import { Lock, Delete, Fingerprint } from 'lucide-react';
import { User } from 'firebase/auth';

interface LockScreenProps {
  user?: User | null;
  settings?: any;
}

const LockScreen: React.FC<LockScreenProps> = ({ settings }) => {
  const [isLocked, setIsLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [successAnim, setSuccessAnim] = useState(false);

  const rawSecurity = settings?.security || {};
  const isEnabled = rawSecurity?.enabled ?? rawSecurity?.app_lock_enabled ?? rawSecurity?.appLockEnabled ?? false;
  const savedPin = typeof rawSecurity?.pin === 'string' ? rawSecurity.pin : '';
  const hasValidPin = savedPin.length === 4;

  useEffect(() => {
    if (isEnabled && hasValidPin) {
      const hasUnlocked = sessionStorage.getItem('app_unlocked');
      if (!hasUnlocked) setIsLocked(true);
    }
  }, []);

  useEffect(() => {
    const handleLockEvent = () => { if (isEnabled && hasValidPin) setIsLocked(true); };
    window.addEventListener('lockapp', handleLockEvent);
    return () => window.removeEventListener('lockapp', handleLockEvent);
  }, [isEnabled, hasValidPin]);

  useEffect(() => {
    if (!isEnabled) { setIsLocked(false); setPin(''); setError(false); setShaking(false); sessionStorage.removeItem('app_unlocked'); }
  }, [isEnabled]);

  const vibrate = () => { if (navigator.vibrate) navigator.vibrate(50); };

  const handlePress = (num: string) => {
    if (pin.length < 4) {
      vibrate();
      const newPin = pin + num;
      setPin(newPin);
      setError(false);
      if (newPin.length === 4) checkPin(newPin);
    }
  };

  const handleBackspace = () => { vibrate(); setPin(prev => prev.slice(0, -1)); setError(false); };

  const checkPin = (inputPin: string) => {
    if (inputPin === savedPin) {
      setSuccessAnim(true);
      setTimeout(() => {
        setIsLocked(false);
        sessionStorage.setItem('app_unlocked', 'true');
        setPin('');
        setSuccessAnim(false);
      }, 400);
    } else {
      setTimeout(() => {
        vibrate(); if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        setShaking(true); setError(true);
        setTimeout(() => { setShaking(false); setPin(''); }, 500);
      }, 200);
    }
  };

  if (!isLocked || !isEnabled || !hasValidPin) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-6"
      style={{
        background: 'linear-gradient(160deg, #0a0f2e 0%, #0f0a28 50%, #070d1a 100%)',
      }}>
      {/* Aurora blobs */}
      <div className="absolute top-[-10%] left-[-5%] w-[80vw] h-[80vw] rounded-full opacity-20"
        style={{background:'radial-gradient(circle, rgba(99,102,241,0.8), transparent 65%)'}} />
      <div className="absolute bottom-[10%] right-[-10%] w-[60vw] h-[60vw] rounded-full opacity-15"
        style={{background:'radial-gradient(circle, rgba(245,158,11,0.6), transparent 65%)'}} />

      <div className="relative flex flex-col items-center w-full max-w-[320px]">
        {/* Icon */}
        <div className="mb-6 relative">
          <div className="absolute -inset-4 rounded-full opacity-40"
            style={{background:'radial-gradient(circle, rgba(245,158,11,0.8), transparent)'}} />
          <div className="relative w-20 h-20 rounded-[28px] flex items-center justify-center"
            style={{
              background: successAnim ? 'linear-gradient(145deg,#10b981,#059669)' : 'linear-gradient(145deg,#f59e0b,#ef4444)',
              boxShadow: '0 16px 40px rgba(245,158,11,0.4), inset 0 1px 0 rgba(255,255,255,0.25)',
              transition: 'background 0.3s ease',
            }}>
            <Lock size={36} className="text-white" strokeWidth={2} />
          </div>
        </div>

        <h2 className="text-[28px] font-black text-white mb-1" style={{letterSpacing:'-0.04em'}}>Locked</h2>
        <p className="text-sm mb-10" style={{color:'rgba(255,255,255,0.35)', fontWeight:500}}>Enter your 4-digit PIN</p>

        {/* PIN Dots */}
        <div className={`flex gap-5 mb-10 ${shaking ? 'animate-[shake_0.3s_ease-in-out]' : ''}`}>
          {[0,1,2,3].map(i => (
            <div key={i}
              className="w-4 h-4 rounded-full transition-all duration-200"
              style={{
                background: i < pin.length
                  ? (error ? '#ef4444' : successAnim ? '#10b981' : '#f59e0b')
                  : 'rgba(255,255,255,0.15)',
                transform: i < pin.length ? 'scale(1.2)' : 'scale(1)',
                boxShadow: i < pin.length && !error ? '0 0 12px rgba(245,158,11,0.6)' : 'none',
              }} />
          ))}
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-4 w-full mb-4">
          {[1,2,3,4,5,6,7,8,9].map(num => (
            <button key={num} onClick={() => handlePress(num.toString())}
              className="aspect-square rounded-[22px] font-black text-white text-2xl flex items-center justify-center active:scale-90 transition-all"
              style={{
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
                backdropFilter: 'blur(8px)',
              }}>
              {num}
            </button>
          ))}
          <div />
          <button onClick={() => handlePress('0')}
            className="aspect-square rounded-[22px] font-black text-white text-2xl flex items-center justify-center active:scale-90 transition-all"
            style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.1)',
              backdropFilter: 'blur(8px)',
            }}>
            0
          </button>
          <button onClick={handleBackspace}
            className="aspect-square rounded-[22px] flex items-center justify-center active:scale-90 transition-all"
            style={{background:'transparent'}}>
            <Delete size={26} style={{color:'rgba(255,255,255,0.4)'}} />
          </button>
        </div>

        <div className="h-8 flex items-center justify-center">
          {error && (
            <p className="text-[12px] font-black uppercase tracking-[0.15em] animate-pulse"
              style={{color:'#ef4444'}}>
              Incorrect PIN
            </p>
          )}
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          20%{transform:translateX(-8px)}
          40%{transform:translateX(8px)}
          60%{transform:translateX(-6px)}
          80%{transform:translateX(6px)}
        }
      `}</style>
    </div>
  );
};
export default LockScreen;








