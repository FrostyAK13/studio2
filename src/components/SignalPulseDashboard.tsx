
"use client"

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { TrendingUp, TrendingDown, RefreshCw, Activity, Zap, Bot, Target, Hash, ArrowUpDown, Clock, MessageSquare, RotateCcw, Wifi, WifiOff, Settings, AlertCircle, Play, Square, Database } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Textarea } from "@/components/ui/textarea";
import { StockDataPoint } from '@/lib/stock-service';
import { SignalManager, Signal } from '@/lib/signal-manager';
import { derivWs, Tick } from '@/lib/deriv-websocket';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { dispatchSignalToTelegram } from '@/ai/flows/dispatch-signal';

const VOLATILITY_INDICES = [
  { value: 'R_10', label: 'Volatility 10 Index' },
  { value: 'R_15', label: 'Volatility 15 (1s) Index' },
  { value: 'R_25', label: 'Volatility 25 Index' },
  { value: 'R_30', label: 'Volatility 30 (1s) Index' },
  { value: 'R_50', label: 'Volatility 50 Index' },
  { value: 'R_75', label: 'Volatility 75 Index' },
  { value: 'R_90', label: 'Volatility 90 (1s) Index' },
  { value: 'R_100', label: 'Volatility 100 Index' },
  { value: '1HZ10V', label: 'Volatility 10 (1s) Index' },
  { value: '1HZ15V', label: 'Volatility 15 (1s) Index' },
  { value: '1HZ25V', label: 'Volatility 25 (1s) Index' },
  { value: '1HZ30V', label: 'Volatility 30 (1s) Index' },
  { value: '1HZ50V', label: 'Volatility 50 (1s) Index' },
  { value: '1HZ75V', label: 'Volatility 75 (1s) Index' },
  { value: '1HZ90V', label: 'Volatility 90 (1s) Index' },
  { value: '1HZ100V', label: 'Volatility 100 (1s) Index' },
];

const STRATEGIES = [
  { value: 'RISE_FALL', label: 'Rise / Fall', icon: ArrowUpDown },
  { value: 'EVEN_ODD', label: 'Even / Odd', icon: Hash },
  { value: 'OVER_UNDER', label: 'Over / Under (2/7)', icon: Target },
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
⏱ <b>Signal Duration:</b> {time}
🔁 <b>Number of Runs:</b> {runs}
🔄 <b>Recovery:</b> {recovery}
💪 <b>Confidence Level:</b> {confidence}

🚫 <b>Contact:</b> {contact}

📝 <b>Additional Notes:</b>
{notes}

🔗 <a href="https://deriv.com/signup?sidc=808C8BC1-CA13-4AE4-83EE-0A6513B55687&utm_campaign=dynamicworks&utm_medium=affiliate&utm_source=CU31372"><b>Create a Deriv Trading Account</b></a>`;

export default function SignalPulseDashboard() {
  const [symbol, setSymbol] = useState('R_100');
  const [strategy, setStrategy] = useState('RISE_FALL');
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

  const prevPriceRef = useRef<number | null>(null);
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

      // 24/7 Sync Loop: Every 15 seconds try to clear the offline queue
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

    const unsubscribe = derivWs.subscribe(symbol, (tick) => {
      setLiveTick(tick);
      
      const currentLastDigit = tick.rawQuote.substring(tick.rawQuote.length - 1);
      const newSignal = SignalManager.processSignalsFromData(
        symbol, 
        tick.quote, 
        currentLastDigit, 
        prevPriceRef.current, 
        strategy,
        tick.rawQuote,
        timeframe
      );

      if (newSignal) {
        setSignals(SignalManager.getSignals());
        handleAutoDispatch(newSignal);
      }

      prevPriceRef.current = tick.quote;
    });

    return () => unsubscribe();
  }, [symbol, strategy, timeframe, mounted, isEngineActive]);

  const handleAutoDispatch = async (signal: Signal) => {
    if (!botToken || !chatId) return;
    
    // If offline, it stays in the queue (localStorage) via SignalManager.saveSignal
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
        price: signal.rawPrice || signal.price.toString(),
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
        price: "1234.56",
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
        const isPermissionError = result.error?.includes('need administrator rights');
        toast({
          variant: "destructive",
          title: "Test Failed",
          description: isPermissionError 
            ? "Your bot needs 'Administrator' rights with 'Post Messages' enabled in this channel."
            : result.error || "Could not reach Telegram API.",
        });
      }
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Server Action Error",
        description: "The connection to the server was interrupted. Please try again.",
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
        ? "GOD FATHER analysis is now active 24/7." 
        : "Automated polling has been paused.",
    });
  };

  const unsyncedCount = signals.filter(s => !s.synced).length;

  const previewContent = useMemo(() => {
    let content = template;
    content = content.replace(/{market}/g, "Volatility 100 Index");
    content = content.replace(/{strategy}/g, "Rise / Fall");
    content = content.replace(/{signal}/g, "RISE");
    content = content.replace(/{entry}/g, liveTick?.rawQuote || "9583.00");
    content = content.replace(/{time}/g, format(new Date(), 'HH:mm:ss'));
    content = content.replace(/{runs}/g, "1");
    content = content.replace(/{recovery}/g, "Martingale");
    content = content.replace(/{confidence}/g, "95%");
    content = content.replace(/{contact}/g, "@FrostyTradersSupport");
    content = content.replace(/{notes}/g, "Follow strict risk management.");
    
    return content.replace(/<[^>]*>?/gm, '');
  }, [template, liveTick]);

  if (!mounted) return null;

  return (
    <div className="min-h-screen p-4 md:p-8 space-y-6 bg-[#f4f7fa] max-w-7xl mx-auto font-body">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary flex items-center gap-2">
            <Bot className="h-8 w-8 text-accent" />
            SignalPulse <span className="text-accent uppercase">FrostyTraders</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm font-medium">Professional 24/7 Automated Signal Engine</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSettings(!showSettings)} className="gap-2 text-xs font-bold bg-white border-accent/20">
            <Settings className="h-4 w-4 text-accent" />
            CONFIG TEMPLATE
          </Button>
          <Badge variant="outline" className={cn("px-3 py-1 bg-white flex gap-2 items-center shadow-sm text-[10px] font-bold", isOnline ? "text-emerald-600" : "text-rose-600 border-rose-200")}>
            {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {isOnline ? 'ONLINE' : 'OFFLINE MODE'}
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
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Message Template Editor (HTML)</label>
                  <Textarea 
                    value={template} 
                    onChange={(e) => setTemplate(e.target.value)}
                    className="bg-slate-50 font-mono text-xs h-[250px] border-none shadow-inner p-4 focus-visible:ring-accent resize-none rounded-xl"
                  />
                </div>

                <div className="p-4 bg-accent/5 rounded-xl border border-accent/10">
                  <p className="text-[10px] font-bold text-accent uppercase mb-2">Dynamic Tags:</p>
                  <div className="flex flex-wrap gap-2">
                    {['{market}', '{strategy}', '{signal}', '{entry}', '{time}', '{runs}', '{recovery}', '{confidence}'].map(tag => (
                      <Badge key={tag} variant="secondary" className="text-[9px] font-mono py-0">{tag}</Badge>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Telegram Live Preview (Text Only)</label>
                  {chatId.startsWith('-100') && (
                    <Badge variant="outline" className="text-[8px] border-amber-200 text-amber-600 bg-amber-50 gap-1 uppercase">
                      <AlertCircle className="h-2 w-2" /> Channel Mode Detected
                    </Badge>
                  )}
                </div>
                <div className="bg-[#1c2431] p-6 rounded-[2rem] shadow-2xl h-full border border-white/5 relative">
                  <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-emerald-400">
                    {previewContent}
                  </pre>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-8 pt-6 border-t gap-4">
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setTemplate(DEFAULT_TEMPLATE)} className="text-[10px] font-bold uppercase">
                  <RotateCcw className="h-3 w-3 mr-2" />
                  Reset Template
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleTestBot} 
                  disabled={isTesting}
                  className="text-[10px] font-bold uppercase border-accent/40 text-accent hover:bg-accent/5"
                >
                  {isTesting ? <RefreshCw className="h-3 w-3 animate-spin mr-2" /> : <MessageSquare className="h-3 w-3 mr-2" />}
                  Test Bot Connection
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowSettings(false)} className="text-[10px] font-bold uppercase">Cancel</Button>
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
              <div className="space-y-4">
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
                      <span className="text-[10px] font-black uppercase">{isEngineActive ? "ACTIVE" : "IDLE"}</span>
                    </div>
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
                <label className="text-[10px] font-bold text-muted-foreground uppercase text-accent">Frequency (Interval)</label>
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

          <Card className="shadow-lg border-none bg-primary text-primary-foreground overflow-hidden relative">
            <div className="absolute top-0 right-0 p-2 opacity-10">
              <Zap className="h-16 w-16" />
            </div>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center justify-center text-center space-y-2">
                <p className="text-[10px] font-bold uppercase opacity-70 tracking-[0.2em]">Live Pulse Node</p>
                <div className="text-4xl font-mono font-bold tracking-tighter tabular-nums">
                  {liveTick ? liveTick.rawQuote : '---.---'}
                </div>
                <div className="mt-4 w-full pt-4 border-t border-white/10 flex justify-between items-center">
                  <span className="text-[10px] font-bold opacity-60 uppercase">Last Digit:</span>
                  <span className="text-4xl font-bold text-accent font-mono underline underline-offset-4 decoration-accent/30">
                    {lastDigit || '-'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="lg:col-span-3 shadow-sm border-none ring-1 ring-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-4 border-b">
            <div>
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                {VOLATILITY_INDICES.find(i => i.value === symbol)?.label}
                <Badge variant="secondary" className="text-[9px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700">T{timeframe}</Badge>
              </CardTitle>
              <CardDescription className="text-xs uppercase font-bold text-muted-foreground/60 tracking-widest">
                Real-Time Node Telemetry
              </CardDescription>
            </div>
            <div className="text-right">
              <div className="text-2xl font-mono font-bold text-primary tabular-nums">
                {liveTick?.rawQuote || '---'}
              </div>
              <p className="text-[10px] font-bold text-emerald-600 uppercase">Connection Active</p>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
             <div className="h-[320px] w-full">
              {isEngineActive && liveTick ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-2xl bg-slate-50 gap-2">
                  <Activity className="h-12 w-12 text-accent opacity-20 animate-pulse" />
                  <div className="text-center">
                    <p className="text-[12px] font-black uppercase tracking-widest text-primary">Engine Running</p>
                    <p className="text-[10px] font-medium opacity-60">Processing Live Ticks 24/7</p>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-2xl bg-slate-50 gap-2">
                  <Play className="h-6 w-6 opacity-20" />
                  <p className="text-[10px] font-bold uppercase tracking-widest">Start Engine to View Live Stream</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-sm border-none ring-1 ring-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <div>
              <CardTitle className="text-lg font-bold">Strategy Feed</CardTitle>
              <CardDescription className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">Persistent Signal Log</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-8 text-[10px] font-bold uppercase border-accent/20" onClick={handleSync} disabled={isSyncing || !isOnline}>
                {isSyncing ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : 'Force Sync'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {signals.length > 0 ? (
                signals.map((signal) => (
                  <div key={signal.id} className="flex items-center justify-between p-3 rounded-xl bg-white border border-border shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-2 rounded-lg",
                        signal.type.includes('RISE') || signal.type.includes('EVEN') || signal.type.includes('OVER') ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                      )}>
                        {signal.type.includes('RISE') || signal.type.includes('EVEN') || signal.type.includes('OVER') ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      </div>
                      <div>
                        <div className="font-bold flex items-center gap-2 text-sm">
                          {signal.type}
                          <Badge className="text-[8px] h-4 bg-primary/10 text-primary border-none uppercase">T{signal.interval || 'OFF'}</Badge>
                        </div>
                        <div className="text-[10px] text-muted-foreground font-medium">{format(new Date(signal.timestamp), 'HH:mm:ss')} | Digit: {signal.lastDigit}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-sm tracking-tighter">{signal.rawPrice}</div>
                      <div className={cn("text-[9px] font-bold uppercase tracking-widest flex items-center justify-end gap-1", signal.synced ? "text-emerald-600" : "text-amber-600")}>
                        {signal.synced ? <Zap className="h-2 w-2" /> : <Clock className="h-2 w-2" />}
                        {signal.synced ? 'Dispatched' : 'Queued (Offline)'}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center text-muted-foreground bg-slate-50 rounded-2xl border border-dashed font-bold text-[10px] uppercase tracking-widest">
                  Ready for 24/7 Strategy Analysis...
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-none ring-1 ring-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Network Intelligence</CardTitle>
            <CardDescription className="text-xs font-bold uppercase tracking-widest opacity-60">Sync & Latency Metrics</CardDescription>
          </CardHeader>
          <CardContent className="h-[400px] flex items-center justify-center">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-white border shadow-sm">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Total Signals (Session)</p>
                  <p className="text-3xl font-mono font-bold text-primary">{signals.length}</p>
                </div>
                <div className="p-4 rounded-2xl bg-white border shadow-sm">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Queue Persistence</p>
                  <div className="text-lg font-bold flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full", isOnline ? "bg-emerald-500" : "bg-rose-500")} />
                    {isOnline ? 'HEALTHY SYNC' : 'OFFLINE BUFFERING'}
                  </div>
                  <p className="text-[9px] text-muted-foreground mt-1 font-bold uppercase">{unsyncedCount} signals waiting to sync</p>
                </div>
              </div>
              <div className="flex flex-col items-center justify-center p-8 bg-accent/5 rounded-[2.5rem] border border-accent/10 relative overflow-hidden group">
                <Activity className="absolute h-48 w-48 text-accent/5 -right-8 -bottom-8 group-hover:scale-110 transition-transform duration-500" />
                <div className="z-10 text-center">
                  <p className="text-[10px] font-bold text-accent uppercase mb-2">24/7 Reliability</p>
                  <div className="text-5xl font-mono font-bold text-accent tracking-tighter">100%</div>
                  <p className="text-[10px] text-muted-foreground mt-3 font-bold uppercase tracking-widest">Automated Guard ON</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
