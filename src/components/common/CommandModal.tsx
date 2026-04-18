import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { User } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { 
  X, ArrowRight, Image as ImageIcon, Loader2, AlertTriangle, 
  CheckCircle2, Trash2, Edit2, Package, Sparkles, MessageCircle,
  Send, WifiOff, RefreshCw, Mic, MicOff
} from 'lucide-react';
import { GeminiService } from '../../services/gemini';
import { ApiService } from '../../services/api';
import { useUI } from '../../context/UIContext';
import { useData } from '../../context/DataContext';
import { AppSettings } from '../../types';
import { haptic } from '../../utils/haptics';
import { OfflineQueueService } from '../../services/offlineQueue';
import { SyncQueueService } from '../../services/syncQueue';
import { getIDForEntry } from '../../utils/idGenerator';
import ManualEntryModal from '../modals/ManualEntryModal';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  data?: any[];
  timestamp: Date;
}

interface CommandModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onSuccess?: () => void;
  appSettings?: AppSettings;
}

const CommandModal: React.FC<CommandModalProps> = ({ isOpen, onClose, user, onSuccess, appSettings }) => {
  const { showToast } = useUI();
  const { useParties, useInventory, invalidateAll } = useData();
  
  // Use cached data from DataContext
  const { data: parties } = useParties(user.uid);
  const { data: inventory } = useInventory(user.uid);
  
  // Chat State
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Processing State
  const [loading, setLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  
  // Edit State
  const [editData, setEditData] = useState<any>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // Voice recognition
  // Web Speech API is unavailable inside Android/iOS WebView — only show mic on web.
  const voiceSupported = useMemo(
    () => !Capacitor.isNativePlatform() && !!(
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    ),
    []
  );
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  const pendingVoiceRef = useRef<string>('');

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast('Speech recognition not supported in this browser', 'error');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = true;
    recognition.continuous = false;

    let finalTranscript = '';

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interim += transcript;
        }
      }
      setInput(finalTranscript + interim);
    };

    recognition.onend = () => {
      setIsRecording(false);
      recognitionRef.current = null;
      // Auto-send directly with the captured transcript (avoids stale state from DOM click)
      if (finalTranscript.trim()) {
        pendingVoiceRef.current = finalTranscript.trim();
        setTimeout(() => {
          if (pendingVoiceRef.current) {
            handleSendWithText(pendingVoiceRef.current);
            pendingVoiceRef.current = '';
          }
        }, 100);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech error:', event.error);
      setIsRecording(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    haptic.medium();
  }, [showToast]);

  const toggleRecording = useCallback(() => {
    if (isRecording) stopRecording();
    else startRecording();
  }, [isRecording, stopRecording, startRecording]);

  // Reset on open; stop recording on close
  useEffect(() => {
    if (isOpen) {
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: 'Hi! I can help you add sales, purchases, payments, and more. Just describe what you need.',
        timestamp: new Date()
      }]);
      setInput('');
      setFile(null);
      setPendingCount(OfflineQueueService.getPendingCount());
    } else {
      // Always stop microphone when modal closes
      stopRecording();
    }
  }, [isOpen]);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Online status listener
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      processOfflineQueue();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Build context for AI
  const buildContext = () => ({
    customers: parties.filter(p => p.role === 'customer').map(p => p.name),
    suppliers: parties.filter(p => p.role === 'supplier').map(p => p.name),
    items: inventory.map(i => i.name),
    expenseTypes: appSettings?.custom_lists?.expense_types || []
  });

  // Enrich entry with DB data
  const enrichEntry = (entry: any) => {
    const enriched = { ...entry };

    // Party Details
    if (enriched.party_name) {
      const match = parties.find(p => (p.name || '').toLowerCase() === enriched.party_name.toLowerCase());
      if (match) {
        enriched.party_name = match.name;
        enriched.gstin = match.gstin;
        enriched.address = match.address;
      }
    }

    // Inventory Details
    if (enriched.items && Array.isArray(enriched.items)) {
      enriched.items = enriched.items.map((item: any) => {
        const match = inventory.find(i => (i.name || '').toLowerCase() === (item.item_name || '').toLowerCase());
        if (match) {
          const isSell = enriched.type === 'sell';
          const dbRate = isSell ? match.sale_rate : match.purchase_rate;
          
          const newItem = {
            ...item,
            item_name: match.name,
            hsn_code: match.hsn_code || '',
            gst_percent: match.gst_percent || '',
            unit: match.unit || 'Pcs',
            price_type: match.price_type || 'exclusive',
            rate: Number(item.rate) || Number(dbRate) || 0
          };

          const qty = Number(newItem.quantity) || 0;
          const rate = Number(newItem.rate) || 0;
          const gst = Number(newItem.gst_percent) || 0;
          
          if (newItem.price_type === 'inclusive') {
            newItem.total = qty * rate;
          } else {
            newItem.total = (qty * rate) * (1 + gst / 100);
          }
          return newItem;
        }
        return item;
      });

      if (enriched.items.length > 0) {
        enriched.total_amount = enriched.items.reduce((sum: number, i: any) => sum + (Number(i.total) || 0), 0);
      }
    }

    return enriched;
  };

  const processOfflineQueue = async () => {
    if (!isOnline) return;
    
    await OfflineQueueService.processQueue(
      async (text, file) => GeminiService.processInput(text, file, buildContext()),
      async (commands) => {
        for (const cmd of commands) {
          const { collection, ...data } = enrichEntry(cmd);
          if (collection) {
            await ApiService.add(user.uid, collection, { ...data, created_at: new Date().toISOString() });
          }
        }
        invalidateAll(user.uid);
      }
    );
    setPendingCount(OfflineQueueService.getPendingCount());
  };

  // Shared send logic that accepts an explicit text (for voice) or uses state input
  const handleSendWithText = async (text: string, fileArg?: File | null) => {
    const currentInput = text;
    const currentFile = fileArg ?? null;
    if (!currentInput.trim() && !currentFile) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: currentFile ? `📎 ${currentFile.name}
${currentInput}` : currentInput,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setFile(null);
    setLoading(true);
    haptic.medium();

    if (!isOnline) {
      await OfflineQueueService.enqueue(currentInput, currentFile || undefined);
      setPendingCount(OfflineQueueService.getPendingCount());
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: "📴 You're offline. I've saved your command and will process it when you're back online.",
        timestamp: new Date()
      }]);
      setLoading(false);
      return;
    }

    try {
      const commands = await GeminiService.processInput(currentInput, currentFile, buildContext());
      if (!commands || commands.length === 0) {
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: `I couldn't understand that. Could you rephrase? For example: "Sold 50 cement bags to Rahul for 18000" or "Received 5000 from Suresh"`,
          timestamp: new Date()
        }]);
      } else {
        const enrichedCommands = commands.map((cmd: any) => enrichEntry(cmd));
        const summary = enrichedCommands.map((cmd: any) => {
          const type = cmd.collection?.replace('_', ' ') || 'entry';
          const name = cmd.party_name || cmd.name || cmd.category || 'New';
          const amount = cmd.total_amount || cmd.amount || '';
          return `• ${type}: ${name}${amount ? ` (₹${amount})` : ''}`;
        }).join('\n');               // ← use explicit newline
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: `I found ${enrichedCommands.length} entries:\n${summary}\nWould you like me to save these?`,
          data: enrichedCommands,
          timestamp: new Date()
        }]);
      }
      haptic.success();
    } catch (e: any) {
      console.error(e);
      haptic.error();
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: `❌ Error: ${e.message || 'Processing failed'}. Please try again.`,
        timestamp: new Date()
      }]);
    } finally {
      setLoading(false);
    }
  };

  // handleSend delegates to handleSendWithText using current state values
  const handleSend = async () => {
    await handleSendWithText(input, file);
  };

  const handleSaveAll = async (data: any[]) => {
    setLoading(true);
    const offline = !navigator.onLine;
    try {
      let count = 0;
      for (const cmd of data) {
        const { collection, _linkedPayments, ...rest } = cmd;
        if (collection) {
          const payload = { ...rest, created_at: new Date().toISOString() };
          if (offline) {
            SyncQueueService.addToQueue(user.uid, 'create', collection, payload);
          } else {
            await ApiService.add(user.uid, collection, payload);
          }
          count++;

          // Save any linked payments that were added during manual editing
          if (_linkedPayments && _linkedPayments.length > 0) {
            const isSale = collection === 'ledger_entries' && rest.type === 'sell';
            const txType = isSale ? 'received' : 'paid';
            for (const pay of _linkedPayments) {
              const transPayload = {
                date: pay.date,
                amount: Number(pay.amount) || 0,
                payment_mode: pay.payment_mode || 'Cash',
                payment_purpose: pay.payment_purpose || '',
                party_name: pay.party_name || rest.party_name || '',
                bill_no: pay.bill_no || rest.invoice_no || rest.bill_no || '',
                notes: pay.notes || '',
                type: txType,
                transaction_id: getIDForEntry(txType),
                created_at: new Date().toISOString()
              };
              if (offline) {
                SyncQueueService.addToQueue(user.uid, 'create', 'transactions', transPayload);
              } else {
                await ApiService.add(user.uid, 'transactions', transPayload);
              }
              count++;
            }
          }
        }
      }
      
      invalidateAll(user.uid);
      
      const savedMsg = offline
        ? `📴 Saved ${count} entries offline — will sync when online`
        : `✅ Saved ${count} entries successfully! Need anything else?`;

      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: savedMsg,
        timestamp: new Date()
      }]);
      
      haptic.success();
      if (onSuccess) onSuccess();
    } catch (e) {
      console.error(e);
      showToast("Save failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleEditItem = (item: any) => {
    setEditData(item);
    setShowEditModal(true);
  };

  const getModalType = (item: any) => {
    if (!item) return 'sales';
    if (item.collection === 'ledger_entries') return item.type === 'sell' ? 'sales' : 'purchases';
    if (item.collection === 'transactions') return 'transactions';
    if (item.collection === 'inventory') return 'inventory';
    if (item.collection === 'expenses') return 'expenses';
    if (item.collection === 'vehicles') return 'vehicles';
    if (item.collection === 'parties') return 'parties';
    return 'sales';
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/80 z-50 flex items-end justify-center backdrop-blur-sm animate-in fade-in duration-200" style={{paddingBottom: 'env(safe-area-inset-bottom, 0px)'}}>
        <div className="w-full max-w-2xl rounded-t-3xl overflow-hidden shadow-2xl border border-white/10 border-b-0 flex flex-col" style={{height: '90dvh', maxHeight: '90dvh'}}>
          
          {/* Header */}
          <div className="p-4 border-b border-white/08 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-[rgba(139,92,246,0.18)] text-violet-400">
                <Sparkles size={18} />
              </div>
              <div>
                <h2 className="font-bold text-lg ">AI Assistant</h2>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="text-xs text-slate-500">
                    {isOnline ? 'Online' : 'Offline'}
                    {pendingCount > 0 && ` • ${pendingCount} queued`}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {pendingCount > 0 && isOnline && (
                <button 
                  onClick={processOfflineQueue}
                  className="p-2 bg-[rgba(59,130,246,0.15)] text-blue-400 rounded-lg"
                >
                  <RefreshCw size={18} />
                </button>
              )}
              <button onClick={onClose} className="p-2 hover:bg-slate-200 hover:bg-[rgba(255,255,255,0.08)] rounded-full text-[rgba(240,244,255,0.95)]">
                <X size={20}/>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[85%] p-3 rounded-2xl ${
                  msg.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-br-sm' 
                    : 'border border-white/12 rounded-bl-sm'
                }`}>
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  
                  {/* Action buttons for data */}
                  {msg.data && msg.data.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {msg.data.map((item: any, idx: number) => (
                        <div 
                          key={idx} 
                          className="bg-[rgba(255,255,255,0.08)] p-2 rounded-lg flex items-center justify-between"
                        >
                          <span className="text-xs font-medium truncate flex-1 text-[rgba(203,213,225,0.8)]">
                            {item.party_name || item.name || item.category || 'Entry'}
                          </span>
                          <button 
                            onClick={() => handleEditItem(item)}
                            className="p-1.5 text-violet-400 hover:bg-[rgba(139,92,246,0.15)] rounded"
                          >
                            <Edit2 size={14} />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => handleSaveAll(msg.data!)}
                        disabled={loading}
                        className="w-full mt-2 bg-green-600 text-white py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                      >
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                        Save All
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="p-3 rounded-2xl rounded-bl-sm border border-white/12">
                  <Loader2 size={20} className="animate-spin text-slate-400" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-white/08 shrink-0" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
            {!isOnline && (
              <div className="mb-2 flex items-center gap-2 text-orange-600 text-xs font-medium">
                <WifiOff size={14} />
                Commands will be queued and processed when online
              </div>
            )}
            
            {file && (
              <div className="mb-2 flex items-center gap-2 bg-[rgba(59,130,246,0.08)] p-2 rounded-lg">
                <ImageIcon size={14} className="text-blue-600" />
                <span className="text-xs text-[#93c5fd] flex-1 truncate">{file.name}</span>
                <button onClick={() => setFile(null)} className="text-red-500">
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Input row — image | text | send + optional floating mic (web only) */}
            <div className={`relative ${voiceSupported ? 'pt-10' : ''}`}>
              {/* Floating mic button — only shown on web where Speech API is available */}
              {voiceSupported && (
                <button
                  onClick={toggleRecording}
                  title={isRecording ? "Stop recording" : "Voice input"}
                  className={`absolute top-0 right-0 w-9 h-9 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-90 ${
                    isRecording
                      ? 'bg-red-500 text-white animate-pulse'
                      : 'text-white'
                  }`}
                  style={isRecording ? { boxShadow: '0 4px 12px rgba(239,68,68,0.5)' } : {
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.9), rgba(139,92,246,0.9))',
                    boxShadow: '0 4px 14px rgba(99,102,241,0.45)',
                  }}
                >
                  {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
                </button>
              )}

              <div className="flex gap-2 items-center">
                <label className="p-3 rounded-xl cursor-pointer hover:bg-[rgba(255,255,255,0.12)] transition-colors glass-icon-btn flex-shrink-0">
                  <input 
                    type="file" 
                    className="hidden" 
                    accept="image/*,audio/*" 
                    onChange={e => setFile(e.target.files?.[0] || null)} 
                  />
                  <ImageIcon size={20} style={{color:"rgba(148,163,184,0.5)"}} />
                </label>
                
                <input 
                  type="text"
                  className="flex-1 min-w-0 border border-white/12 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 text-[rgba(240,244,255,0.95)]"
                  placeholder={isRecording ? "Listening…" : "Describe your transaction…"}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                />

                <button 
                  id="cmd-send-btn"
                  onClick={handleSend}
                  disabled={loading || (!input.trim() && !file)}
                  className="p-3 bg-blue-600 text-white rounded-xl disabled:opacity-50 hover:bg-blue-700 transition-colors flex-shrink-0"
                >
                  <Send size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showEditModal && editData && (
        <ManualEntryModal 
          isOpen={true}
          onClose={() => setShowEditModal(false)}
          type={getModalType(editData) as any}
          user={user}
          initialData={editData}
          appSettings={appSettings || {} as any}
          onLocalSave={(updated) => {
            // Update the message data
            setMessages(prev => prev.map(msg => {
              if (msg.data) {
                const newData = msg.data.map(d => 
                  d === editData ? { ...updated, collection: editData.collection } : d
                );
                return { ...msg, data: newData };
              }
              return msg;
            }));
            setShowEditModal(false);
            setEditData(null);
          }}
        />
      )}
    </>
  );
};

export default CommandModal;







