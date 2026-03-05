
"use client"

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { TrendingUp, TrendingDown, RefreshCw, Activity, Zap, Bot, Target, Hash, ArrowUpDown, Clock, MessageSquare, RotateCcw, Wifi, WifiOff, Settings, AlertCircle, Play, Square, Database, Globe, History } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Textarea } from "@/components/ui/textarea";
import { SignalManager, Signal } from '@/lib/signal-manager';
import { derivWs, Tick } from '@/lib/deriv-websocket';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { dispatchSignalToTelegram } from '@/ai/flows/dispatch-signal';

const VOLATILITY_INDICES = [
  { value: 'ALL_MARKETS', label: 'All Volatility Indices (Scanner)' },
  { value: 'R_10', label: 'Volatility 10 Index' },
  { value: 'R_15', label: 'Volatility 15 (1s) Index' },
  { value: 'R_25', label: 'Volatility 25 Index' },
  { value: 'R_30', label: 'Volatility 30 (1s) Index' },
  { value: 'R_50', label: 'Volatility 50 Index' },
  { value: 'R_75', label: 'Volatility 75 Index' },
  { value: 'R_90', label: 'Volatility 90 (1s) Index' },
  { value: 'R_100', label: 'Volatility 100 Index' },
  { value: '1HZ10V', label: 'Volatility 10 (1s) Index' },
  { value: '1HZ25V', label: 'Volatility 25 (1s) Index' },
  { value: '1HZ50V', label: 'Volatility 50 (1s) Index' },
  { value: '1HZ75V', label: 'Volatility 75 (1s) Index' },
  { value: '1HZ100V', label: 'Volatility 100 (1s) Index' },
];

const STRATEGIES = [
  { value: 'OVER_UNDER', label: 'Over / Under (2/7)', icon: Target },
  { value: 'RISE_FALL', label: 'Rise / Fall', icon: ArrowUpDown },
  { value: 'EVEN_ODD', label: 'Even / Odd', icon: Hash },
  { value: 'MATCHES_DIFFERS', label: 'Matches / Differs', icon: Zap },
];

const TIMEFRAMES = [
  { value: '5m', label: '5 Minutes' },
  { value: '10m', label: '10 Minutes' },
  { value: '15m', label: '15 Minutes' },
  { value: '20m', label: '20 Minutes' },
  { value: '30m', label: '30 Minutes' },
  { value: '1h', label: '1 Hour' },
];

const DEFAULT_TEMPLATE = `🚨 <b>FROSTYTRADERS – DERIV SIGNAL</b>

📊 <b>Market:</b> {market}
🤖 <b>Bot / Strategy:</b> {strategy}
🎯 <b>Signal :</b> {signal}
📲 <b>Entry Point:</b> {entry}
⏱ <b>Signal Duration:</b> {timeframe}
🔁 <b>Number of Runs:</b> {runs}
🔄 <b>Recovery:</b> {recovery}
💪 <b>Confidence Level:</b> {confidence}

🚫 <b>Contact:</b> {contact}

📝 <b>Additional Notes:</b>
{notes}

🔗 <a href="https://deriv.com/signup?sidc=808C8BC1-CA13-4AE4-83EE-0A6513B55687&utm_campaign=dynamicworks&utm_medium=affiliate&utm_source=CU31372"><b>Create a Deriv Trading Account</b></a>`;

export default function SignalPulseDashboard() {
  const [symbol, setSymbol] = useState('ALL_MARKETS');
  const [strategy, setStrategy] = useState('OVER_UNDER');
  const [timeframe, setTimeframe] = useState('5m');
  const [isEngineActive, setIsEngineActive] = useState(false);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [liveTick, setLiveTick] = useState<Tick | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [mounted, setMounted] = useState(false);
  
  // Settings
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [showSettings, setShowSettings] = useState(false);

  const prevPricesRef = useRef<Record<string, number | null>>({});
  const { toast } = useToast();

  useEffect(() => {
    setMounted(true);
    setSignals(SignalManager.getSignals());
    
    if (typeof window !== 'undefined') {
      setBotToken(localStorage.getItem('tg_bot_token') || '');
      setChatId(localStorage.getItem('tg_chat_id') || '');
      setTemplate(localStorage.getItem('tg_template') || DEFAULT_TEMPLATE);
      setIsOnline(navigator.onLine);

      const handleOnline = () => {
        setIsOnline(true);
        handleSync();
      };
      const handleOffline = () => setIsOnline(false);

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      const syncInterval = setInterval(handleSync, 15000);

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        clearInterval(syncInterval);
      };
    }
  }, []);

  const lastDigit = useMemo(() => {
    if (!liveTick || !liveTick.rawQuote) return null;
    const str = liveTick.rawQuote;
    return str.substring(str.length - 1);
  }, [liveTick]);

  useEffect(() => {
    if (!symbol || !mounted || !isEngineActive) {
      setLiveTick(null);
      return;
    }

    const isScannerMode = symbol === 'ALL_MARKETS';
    const targets = isScannerMode
      ? VOLATILITY_INDICES.filter(i => i.value !== 'ALL_MARKETS').map(i => i.value)
      : [symbol];

    const unsubscribers: (() => void)[] = [];

    targets.forEach(s => {
      const unsubscribe = derivWs.subscribe(s, (tick) => {
        if (!isScannerMode || s === targets[0]) {
           setLiveTick(tick);
        }
        
        const currentLastDigit = tick.rawQuote.substring(tick.rawQuote.length - 1);
        
        const newSignal = SignalManager.processSignalsFromData(
          s, 
          tick.quote, 
          currentLastDigit, 
          prevPricesRef.current[s] || null, 
          strategy,
          tick.rawQuote,
          timeframe,
          isScannerMode
        );

        if (newSignal) {
          setSignals(SignalManager.getSignals());
          handleAutoDispatch(newSignal);
        }

        prevPricesRef.current[s] = tick.quote;
      });
      unsubscribers.push(unsubscribe);
    });

    return () => {
      unsubscribers.forEach(u => u());
    };
  }, [symbol, strategy, timeframe, mounted, isEngineActive]);

  const handleAutoDispatch = async (signal: Signal) => {
    if (!botToken || !chatId) return;
    if (!navigator.onLine) return;

    const currentSymbolLabel = VOLATILITY_INDICES.find(i => i.value === signal.symbol)?.label || signal.symbol;
    const currentStrategyLabel = STRATEGIES.find(s => s.value === signal.strategy)?.label || signal.strategy;
    
    try {
      const result = await dispatchSignalToTelegram({
        botToken: botToken.trim(),
        chatId: chatId.trim(),
        symbol: currentSymbolLabel,
        strategy: currentStrategyLabel,
        type: signal.type,
        price: signal.lastDigit || "0",
        runs: signal.runs || 1,
        template,
        time: format(new Date(), 'HH:mm:ss')
      });

      if (result.success) {
        SignalManager.markAsSynced(signal.id);
        setSignals(SignalManager.getSignals());
      }
    } catch (e) {
      console.error("Auto-dispatch failed", e);
    }
  };

  const handleSync = async () => {
    if (!navigator.onLine || isSyncing) return;
    const currentSignals = SignalManager.getSignals();
    const unsynced = currentSignals.filter(s => !s.synced);
    if (unsynced.length === 0) return;

    setIsSyncing(true);
    try {
      for (const signal of unsynced) {
        await handleAutoDispatch(signal);
      }
      setSignals(SignalManager.getSignals());
    } finally {
      setIsSyncing(false);
    }
  };

  const handleTestBot = async () => {
    if (!botToken || !chatId) {
      toast({
        variant: "destructive",
        title: "Configuration Missing",
        description: "Please enter your Bot Token and Chat ID first.",
      });
      return;
    }

    setIsTesting(true);
    try {
      const result = await dispatchSignalToTelegram({
        botToken: botToken.trim(),
        chatId: chatId.trim(),
        symbol: "TEST MARKET (VOL 100)",
        strategy: "CONNECTION TEST",
        type: "SUCCESS",
        price: lastDigit || "5",
        runs: 1,
        template,
        time: format(new Date(), 'HH:mm:ss')
      });

      if (result.success) {
        toast({
          title: "Test Successful",
          description: "Check your Telegram chat for the confirmation message.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Test Failed",
          description: result.error || "Could not reach Telegram API.",
        });
      }
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Server Action Error",
        description: "The connection to the server was interrupted.",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveSettings = () => {
    localStorage.setItem('tg_bot_token', botToken);
    localStorage.setItem('tg_chat_id', chatId);
    localStorage.setItem('tg_template', template);
    setShowSettings(false);
    toast({
      title: "Settings Saved",
      description: "FrostyTraders bot configuration updated.",
    });
  };

  const toggleEngine = () => {
    setIsEngineActive(!isEngineActive);
    toast({
      title: !isEngineActive ? "Engine Started" : "Engine Stopped",
      description: !isEngineActive 
        ? (symbol === 'ALL_MARKETS' ? "Multi-Market Engine scanning for 1 signal per interval." : "Monitoring selected market 24/7.")
        : "Automated polling paused.",
    });
  };

  const unsyncedCount = signals.filter(s => !s.synced).length;

  const previewContent = useMemo(() => {
    let content = template;
    content = content.replace(/{market}/g, "Volatility 100 Index");
    content = content.replace(/{strategy}/g, "Over / Under (2/7)");
    content = content.replace(/{signal}/g, "OVER 2");
    content = content.replace(/{entry}/g, lastDigit || "5");
    content = content.replace(/{time}/g, format(new Date(), 'HH:mm:ss'));
    content = content.replace(/{timeframe}/g, timeframe);
    content = content.replace(/{runs}/g, "1");
    content = content.replace(/{recovery}/g, "Martingale");
    content = content.replace(/{confidence}/g, "98%");
    content = content.replace(/{contact}/g, "@FrostyTradersSupport");
    content = content.replace(/{notes}/g, "Bullish streak detected on last 3 digits.");
    
    return content.replace(/<[^>]*>?/gm, '');
  }, [template, lastDigit, timeframe]);

  if (!mounted) return null;

  return (
    <div className="min-h-screen p-4 md:p-8 space-y-6 bg-[#f4f7fa] max-w-7xl mx-auto font-body">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary flex items-center gap-2">
            <Bot className="h-8 w-8 text-accent" />
            SignalPulse <span className="text-accent uppercase">FrostyTraders</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm font-medium">GOD FATHER 24/7 Multi-Market Scanning Engine</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSettings(!showSettings)} className="gap-2 text-xs font-bold bg-white border-accent/20 shadow-sm">
            <Settings className="h-4 w-4 text-accent" />
            MESSAGE FORMAT
          </Button>
          <Badge variant="outline" className={cn("px-3 py-1 bg-white flex gap-2 items-center shadow-sm text-[10px] font-bold", isOnline ? "text-emerald-600" : "text-rose-600 border-rose-200")}>
            {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {isOnline ? 'ONLINE' : 'OFFLINE BUFFER'}
          </Badge>
        </div>
      </header>

      {showSettings && (
        <Card className="border-accent/20 bg-white shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300">
          <CardHeader className="pb-2 border-b">
            <CardTitle className="text-lg flex items-center gap-2 uppercase tracking-tighter">
              <MessageSquare className="h-5 w-5 text-accent" />
              Signal Message Format
            </CardTitle>
            <CardDescription className="text-xs">Customize your professional 24/7 signal template (supports HTML)</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Bot Token</label>
                    <Input type="password" placeholder="123456:ABC..." value={botToken} onChange={(e) => setBotToken(e.target.value)} className="bg-slate-50 border-none shadow-sm h-10 text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Chat ID</label>
                    <Input placeholder="-100..." value={chatId} onChange={(e) => setChatId(e.target.value)} className="bg-slate-50 border-none shadow-sm h-10 text-xs" />
                  </div>
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Message Template (HTML)</label>
                  <Textarea 
                    value={template} 
                    onChange={(e) => setTemplate(e.target.value)}
                    className="bg-slate-50 font-mono text-xs h-[250px] border-none shadow-inner p-4 focus-visible:ring-accent resize-none rounded-xl"
                  />
                </div>

                <div className="p-4 bg-accent/5 rounded-xl border border-accent/10">
                  <p className="text-[10px] font-bold text-accent uppercase mb-2">Available Placeholders:</p>
                  <div className="flex flex-wrap gap-2">
                    {['{market}', '{strategy}', '{signal}', '{entry}', '{time}', '{timeframe}', '{runs}', '{recovery}', '{confidence}', '{notes}'].map(tag => (
                      <Badge key={tag} variant="secondary" className="text-[9px] font-mono py-0">{tag}</Badge>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Telegram High-Fidelity Preview</label>
                <div className="bg-[#1c2431] p-6 rounded-[2rem] shadow-2xl h-full border border-white/5 relative">
                  <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-emerald-400">
                    {previewContent}
                  </pre>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-8 pt-6 border-t gap-4">
              <Button variant="ghost" size="sm" onClick={() => setTemplate(DEFAULT_TEMPLATE)} className="text-[10px] font-bold uppercase">
                <RotateCcw className="h-3 w-3 mr-2" />
                Reset Template
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleTestBot} disabled={isTesting} className="text-[10px] font-bold uppercase">
                  {isTesting ? <RefreshCw className="h-3 w-3 animate-spin mr-2" /> : <MessageSquare className="h-3 w-3 mr-2" />}
                  Test Bot Connection
                </Button>
                <Button onClick={handleSaveSettings} className="bg-accent hover:bg-accent/90 h-10 px-8 text-[10px] font-bold uppercase shadow-lg shadow-accent/20">Save Settings</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <section className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card className={cn("shadow-2xl border-none transition-all duration-500", isEngineActive ? "ring-2 ring-accent bg-white" : "bg-white opacity-90")}>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-primary/80">Engine Control</CardTitle>
              {isEngineActive && <Activity className="h-4 w-4 text-accent animate-pulse" />}
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                onClick={toggleEngine} 
                className={cn(
                  "w-full h-12 text-xs font-black uppercase tracking-widest shadow-lg transition-all active:scale-95",
                  isEngineActive ? "bg-rose-600 hover:bg-rose-700 shadow-rose-200" : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200"
                )}
              >
                {isEngineActive ? (
                  <><Square className="h-4 w-4 mr-2 fill-current" /> STOP 24/7 ENGINE</>
                ) : (
                  <><Play className="h-4 w-4 mr-2 fill-current" /> START 24/7 ENGINE</>
                )}
              </Button>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-slate-50 rounded-xl border border-border/50 text-center">
                  <p className="text-[9px] font-bold text-muted-foreground uppercase mb-1">Queue</p>
                  <div className="flex items-center justify-center gap-1">
                    <Database className="h-3 w-3 text-primary opacity-50" />
                    <span className="text-sm font-black font-mono">{unsyncedCount}</span>
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-border/50 text-center">
                  <p className="text-[9px] font-bold text-muted-foreground uppercase mb-1">Status</p>
                  <div className="flex items-center justify-center gap-1">
                    <div className={cn("w-2 h-2 rounded-full", isEngineActive ? "bg-emerald-500 animate-pulse" : "bg-slate-300")} />
                    <span className="text-[10px] font-black uppercase">{isEngineActive ? "SCANNING" : "IDLE"}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 pt-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Target Market</label>
                <Select value={symbol} onValueChange={setSymbol} disabled={isEngineActive}>
                  <SelectTrigger className="h-10 text-xs font-medium bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VOLATILITY_INDICES.map(i => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Strategy</label>
                <Select value={strategy} onValueChange={setStrategy} disabled={isEngineActive}>
                  <SelectTrigger className="h-10 text-xs font-medium bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STRATEGIES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase text-accent">Frequency (1 Signal Per)</label>
                <Select value={timeframe} onValueChange={setTimeframe} disabled={isEngineActive}>
                  <SelectTrigger className="h-10 text-xs font-bold border-accent/20 text-accent bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEFRAMES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-none bg-primary text-primary-foreground overflow-hidden">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center justify-center text-center space-y-2">
                <p className="text-[10px] font-bold uppercase opacity-70 tracking-[0.2em]">Live Pulse Node</p>
                <div className="text-4xl font-mono font-bold tracking-tighter tabular-nums">
                  {liveTick ? liveTick.rawQuote : '---.---'}
                </div>
                <div className="mt-4 w-full pt-4 border-t border-white/10 flex justify-between items-center">
                  <span className="text-[10px] font-bold opacity-60 uppercase">Entry Digit:</span>
                  <span className="text-4xl font-bold text-accent font-mono underline underline-offset-4 decoration-accent/30">
                    {lastDigit || '-'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="lg:col-span-3 shadow-sm border-none ring-1 ring-border/50 bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-4 border-b">
            <div>
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                {symbol === 'ALL_MARKETS' ? 'GOD FATHER Multi-Market Scanner' : VOLATILITY_INDICES.find(i => i.value === symbol)?.label}
                <Badge variant="secondary" className="text-[9px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700">T{timeframe}</Badge>
              </CardTitle>
              <CardDescription className="text-xs uppercase font-bold text-muted-foreground/60 tracking-widest">
                Dispatched Strategy Feed (24/7 Channel History)
              </CardDescription>
            </div>
            <div className="text-right">
              <div className="text-2xl font-mono font-bold text-primary tabular-nums">
                {liveTick?.rawQuote || '---'}
              </div>
              <div className="text-[10px] font-bold text-emerald-600 uppercase flex items-center justify-end gap-1">
                <Wifi className="h-3 w-3" /> STREAM ACTIVE
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
             <div className="h-[460px] overflow-y-auto pr-2 custom-scrollbar space-y-3">
              {signals.length > 0 ? (
                signals.map((signal) => (
                  <div key={signal.id} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-border/50 hover:bg-white transition-colors group">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "p-3 rounded-xl shadow-sm",
                        signal.type.includes('OVER') || signal.type.includes('RISE') || signal.type.includes('EVEN') ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                      )}>
                        {signal.type.includes('OVER') || signal.type.includes('RISE') ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                      </div>
                      <div>
                        <div className="font-black text-sm flex items-center gap-2 text-primary">
                          {signal.type} @ {VOLATILITY_INDICES.find(v => v.value === signal.symbol)?.label || signal.symbol}
                          <Badge className="text-[8px] h-4 bg-primary/10 text-primary border-none uppercase">DISPATCHED</Badge>
                        </div>
                        <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mt-0.5">
                          {format(new Date(signal.timestamp), 'HH:mm:ss')} | Entry: {signal.lastDigit} | Rationale: {signal.rationale}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-black text-lg text-primary">{signal.lastDigit}</div>
                      <div className={cn("text-[9px] font-bold uppercase tracking-widest flex items-center justify-end gap-1", signal.synced ? "text-emerald-600" : "text-amber-600")}>
                        {signal.synced ? <Zap className="h-2 w-2" /> : <Clock className="h-2 w-2" />}
                        {signal.synced ? 'SENT TO TELEGRAM' : 'QUEUED'}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-3xl bg-slate-50 gap-3 opacity-60">
                  <Activity className="h-12 w-12 text-accent animate-pulse" />
                  <div className="text-center">
                    <p className="text-[12px] font-black uppercase tracking-widest text-primary">
                      GOD FATHER Scanner Initializing...
                    </p>
                    <p className="text-[10px] font-medium">
                      Waiting for the first perfect signal in {timeframe} timeframe.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-8">
        <Card className="shadow-sm border-none ring-1 ring-border/50 bg-white">
          <CardHeader>
            <CardTitle className="text-lg">Network Intelligence</CardTitle>
            <CardDescription className="text-xs font-bold uppercase tracking-widest opacity-60">24/7 Automated Guard Metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-border/50">
                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Session Total</p>
                <p className="text-3xl font-mono font-bold text-primary">{signals.length}</p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 border border-border/50">
                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Buffer Persistence</p>
                <div className="text-lg font-bold flex items-center gap-2">
                  <div className={cn("w-2 h-2 rounded-full", isOnline ? "bg-emerald-500" : "bg-rose-500")} />
                  {isOnline ? 'HEALTHY SYNC' : 'OFFLINE MODE'}
                </div>
                <p className="text-[9px] text-muted-foreground mt-1 font-bold uppercase">{unsyncedCount} signals in local storage</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-none ring-1 ring-border/50 bg-accent text-accent-foreground overflow-hidden relative">
          <Activity className="absolute h-48 w-48 text-white/5 -right-8 -bottom-8" />
          <CardContent className="pt-8 text-center h-full flex flex-col justify-center">
            <p className="text-[10px] font-bold uppercase opacity-70 tracking-widest">System Reliability</p>
            <div className="text-5xl font-mono font-bold tracking-tighter my-2">100%</div>
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">FrostyTraders Automated Engine Active</p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
