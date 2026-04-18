import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

const TIPS = [
  'Loading your business data...',
  'Syncing with the cloud...',
  'Almost there...',
  'Setting things up...',
];

const LoadingView: React.FC = () => {
  const [tip, setTip] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTip(p => (p + 1) % TIPS.length), 1800);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center"
      style={{background:'linear-gradient(160deg, #0a0f2e 0%, #0f0a28 50%, #070d1a 100%)'}}>
      {/* Aurora */}
      <div className="absolute top-[-10%] left-[-5%] w-[70vw] h-[70vw] rounded-full opacity-20"
        style={{background:'radial-gradient(circle,rgba(99,102,241,0.8),transparent 65%)'}} />
      <div className="absolute bottom-[5%] right-[-10%] w-[50vw] h-[50vw] rounded-full opacity-15"
        style={{background:'radial-gradient(circle,rgba(245,158,11,0.6),transparent 65%)'}} />

      <div className="relative flex flex-col items-center">
        {/* Logo */}
        <div className="relative mb-8">
          <div className="absolute -inset-4 rounded-full opacity-40"
            style={{background:'radial-gradient(circle,rgba(245,158,11,0.8),transparent)'}} />
          <div className="relative w-[80px] h-[80px] rounded-[28px] flex items-center justify-center font-black text-white"
            style={{
              background:'linear-gradient(145deg,#f59e0b,#ef4444)',
              boxShadow:'0 16px 40px rgba(245,158,11,0.4), inset 0 1px 0 rgba(255,255,255,0.25)',
              fontSize:36,
            }}>
            S
          </div>
        </div>

        {/* Spinner */}
        <div className="mb-4">
          <Loader2 size={32} className="animate-spin" style={{color:'rgba(245,158,11,0.7)'}} />
        </div>

        {/* Tip text */}
        <p className="text-sm font-medium" style={{color:'rgba(255,255,255,0.4)', transition:'opacity 0.3s'}}>
          {TIPS[tip]}
        </p>

        {/* Progress dots */}
        <div className="flex gap-2 mt-6">
          {[0,1,2].map(i => (
            <div key={i} className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{
                background:'rgba(245,158,11,0.5)',
                animationDelay:`${i * 300}ms`,
              }} />
          ))}
        </div>
      </div>
    </div>
  );
};
export default LoadingView;








