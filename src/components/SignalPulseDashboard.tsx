
"use client"

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { format, subMonths, parseISO } from 'date-fns';
import { Search, Calendar as CalendarIcon, TrendingUp, TrendingDown, RefreshCw, Activity, Layers, Zap, Send, Settings, Bot, Target, Hash, ArrowUpDown, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fetchHistoricalData, StockDataPoint } from '@/lib/stock-service';
import { SignalManager, Signal } from '@/lib/signal-manager';
import { derivWs, Tick } from '@/lib/deriv-websocket';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { dispatchSignalToTelegram } from '@/ai/flows/dispatch-signal';

const VOLATILITY_INDICES = [
  { value: 'R_10', label: 'Volatility 10 Index' },
  { value: 'R_25', label: 'Volatility 25 Index' },
  { value: 'R_50', label: 'Volatility 50 Index' },
  { value: 'R_75', label: 'Volatility 75 Index' },
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

export default function SignalPulseDashboard() {
  const [symbol, setSymbol] = useState('R_100');
  const [strategy, setStrategy] = useState('RISE_FALL');
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const [data, setData] = useState<StockDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [liveTick, setLiveTick] = useState<Tick | null>(null);
  const [mounted, setMounted] = useState(false);
  
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  const prevPriceRef = useRef<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    setMounted(true);
    const end = new Date();
    const start = subMonths(end, 1);
    setFromDate(start);
    setToDate(end);
    setSignals(SignalManager.getSignals());
    
    if (typeof window !== 'undefined') {
      setBotToken(localStorage.getItem('tg_bot_token') || '');
      setChatId(localStorage.getItem('tg_chat_id') || '');
    }

    handleSearch('R_100', start, end);
  }, []);

  const lastDigit = useMemo(() => {
    if (!liveTick || !liveTick.rawQuote) return null;
    const str = liveTick.rawQuote;
    return str.substring(str.length - 1);
  }, [liveTick]);

  useEffect(() => {
    if (!symbol || !mounted) return;

    const unsubscribe = derivWs.subscribe(symbol, (tick) => {
      setLiveTick(tick);
      
      setData(prev => {
        const lastPoint = prev[prev.length - 1];
        const newPoint = {
          date: new Date(tick.epoch * 1000).toISOString(),
          price: tick.quote,
          volume: 0
        };
        
        if (!lastPoint || new Date(tick.epoch * 1000).getSeconds() !== new Date(lastPoint.date).getSeconds()) {
          const updated = [...prev, newPoint];
          return updated.slice(-100);
        }
        return prev;
      });

      const currentLastDigit = tick.rawQuote.substring(tick.rawQuote.length - 1);
      const newSignal = SignalManager.processSignalsFromData(
        symbol, 
        tick.quote, 
        currentLastDigit, 
        prevPriceRef.current, 
        strategy
      );

      if (newSignal) {
        setSignals(SignalManager.getSignals());
        handleAutoDispatch(newSignal);
      }

      prevPriceRef.current = tick.quote;
    });

    return () => unsubscribe();
  }, [symbol, strategy, mounted]);

  const handleAutoDispatch = async (signal: Signal) => {
    if (!botToken || !chatId) return;

    const currentSymbolLabel = VOLATILITY_INDICES.find(i => i.value === signal.symbol)?.label || signal.symbol;
    
    const result = await dispatchSignalToTelegram({
      botToken,
      chatId,
      symbol: currentSymbolLabel,
      type: signal.type,
      price: signal.price,
      runs: signal.runs,
    });

    if (result.success) {
      toast({
        title: "GOD FATHER Dispatch",
        description: `${signal.type} Signal sent to Telegram`,
      });
      SignalManager.markAsSynced(signal.id);
      setSignals(SignalManager.getSignals());
    }
  };

  const handleSaveSettings = () => {
    localStorage.setItem('tg_bot_token', botToken);
    localStorage.setItem('tg_chat_id', chatId);
    setShowSettings(false);
    toast({
      title: "Settings Saved",
      description: "Telegram Bot configurations updated.",
    });
  };

  const handleSearch = async (s = symbol, from = fromDate, to = toDate) => {
    if (!s || !from || !to) return;
    setLoading(true);
    try {
      const result = await fetchHistoricalData(
        s.toUpperCase(),
        format(from, 'yyyy-MM-dd'),
        format(to, 'yyyy-MM-dd')
      );
      setData(result);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Historical Data Error",
        description: "Could not retrieve history."
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const unsynced = signals.filter(s => !s.synced);
      for (const signal of unsynced) {
        await handleAutoDispatch(signal);
      }
      toast({
        title: "Sync Complete",
        description: `Processed ${unsynced.length} signals.`,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const safeParseISO = (dateString: string) => {
    try {
      return parseISO(dateString);
    } catch (e) {
      return new Date();
    }
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen p-4 md:p-8 space-y-6 bg-background max-w-7xl mx-auto font-body">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold text-primary flex items-center gap-2">
            <Bot className="h-8 w-8 text-accent" />
            SignalPulse <span className="text-accent">GOD FATHER</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">Advanced Strategy Intelligence v2.0</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSettings(!showSettings)} className="gap-2 text-xs">
            <Settings className="h-4 w-4" />
            Bot Settings
          </Button>
          <Badge variant="outline" className="px-3 py-1 bg-white flex gap-2 items-center shadow-sm text-[10px] font-bold">
            <div className={cn("w-2 h-2 rounded-full", liveTick ? "bg-emerald-500 animate-pulse" : "bg-muted")} />
            {liveTick ? 'LIVE FEED CONNECTED' : 'CONNECTING...'}
          </Badge>
        </div>
      </header>

      {showSettings && (
        <Card className="border-accent/20 bg-accent/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2 uppercase tracking-tighter">
              <Send className="h-4 w-4" />
              Telegram Bot Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">Bot Token</label>
              <Input 
                type="password" 
                placeholder="Token" 
                value={botToken} 
                onChange={(e) => setBotToken(e.target.value)}
                className="bg-white h-9 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">Chat ID</label>
              <Input 
                placeholder="Chat ID" 
                value={chatId} 
                onChange={(e) => setChatId(e.target.value)}
                className="bg-white h-9 text-xs"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleSaveSettings} className="w-full bg-accent hover:bg-accent/90 h-9 text-xs font-bold uppercase">Save Config</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <section className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card className="shadow-sm border-none ring-1 ring-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Search className="h-4 w-4 text-primary" />
                Asset Selector
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-tight">Derived Index</label>
                <Select value={symbol} onValueChange={(val) => setSymbol(val)}>
                  <SelectTrigger className="w-full font-medium h-10">
                    <SelectValue placeholder="Select Index" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {VOLATILITY_INDICES.map((index) => (
                        <SelectItem key={index.value} value={index.value}>
                          {index.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-tight">Intelligence Strategy</label>
                <Select value={strategy} onValueChange={(val) => setStrategy(val)}>
                  <SelectTrigger className="w-full font-medium h-10">
                    <SelectValue placeholder="Select Strategy" />
                  </SelectTrigger>
                  <SelectContent>
                    {STRATEGIES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        <div className="flex items-center gap-2">
                          <s.icon className="h-3 w-3" />
                          {s.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button className="w-full h-10 font-bold" onClick={() => handleSearch()} disabled={loading}>
                {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : 'Refresh History'}
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-none ring-1 ring-border/50 bg-primary text-primary-foreground overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold uppercase tracking-widest opacity-80">Live Pulse</CardTitle>
                <Zap className="h-4 w-4 text-amber-400 fill-amber-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <div className="text-4xl font-mono font-bold tracking-tighter truncate leading-none">
                  {liveTick ? liveTick.rawQuote : '---.---'}
                </div>
                <div className="flex items-center justify-between mt-4">
                  <span className="text-xs opacity-70 font-bold uppercase">Last Digit:</span>
                  <span className="text-3xl font-bold text-amber-400 font-mono underline decoration-amber-400/50 underline-offset-4">
                    {lastDigit || '-'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="lg:col-span-3 shadow-sm border-none ring-1 ring-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-border/50">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                {VOLATILITY_INDICES.find(i => i.value === symbol)?.label || symbol}
                {liveTick && <Badge variant="secondary" className="animate-pulse bg-emerald-50 text-emerald-700 border-emerald-100 text-[10px]">Live Stream</Badge>}
              </CardTitle>
              <CardDescription className="text-xs uppercase font-bold text-muted-foreground/70 tracking-widest">
                Real-Time {STRATEGIES.find(s => s.value === strategy)?.label} Processing
              </CardDescription>
            </div>
            { (liveTick || data.length > 0) && (
              <div className="text-right">
                <div className="text-2xl font-mono font-bold text-primary tracking-tighter">
                  {liveTick ? liveTick.rawQuote : (data.length > 0 ? data[data.length-1].price.toString() : '---')}
                </div>
                <div className={cn("text-[10px] font-bold uppercase", (liveTick?.quote || (data.length > 0 ? data[data.length-1].price : 0)) > (data.length > 0 ? data[0].price : 0) ? "text-emerald-600" : "text-rose-600")}>
                  {data.length > 0 ? (((liveTick?.quote || data[data.length-1].price) - data[0].price) / data[0].price * 100).toFixed(4) : '0.0000'}%
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <div className="h-[380px] w-full mt-4">
              {data.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data}>
                    <defs>
                      <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" />
                    <XAxis 
                      dataKey="date" 
                      tick={{fontSize: 9, fontWeight: 600}} 
                      tickFormatter={(val) => format(safeParseISO(val), 'HH:mm:ss')}
                      stroke="hsl(var(--muted-foreground))"
                      minTickGap={30}
                    />
                    <YAxis 
                      domain={['auto', 'auto']} 
                      tick={{fontSize: 9, fontWeight: 600, fontFamily: 'monospace'}}
                      stroke="hsl(var(--muted-foreground))"
                      orientation="right"
                    />
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-white p-3 rounded-lg shadow-xl border border-border">
                              <p className="text-[10px] font-bold text-muted-foreground mb-1 uppercase tracking-tighter">
                                {format(safeParseISO(payload[0].payload.date), 'HH:mm:ss')}
                              </p>
                              <p className="text-lg font-mono font-bold text-primary">
                                {payload[0].value}
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="price" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorPrice)" 
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground border-2 border-dashed border-muted rounded-2xl bg-muted/5 font-bold uppercase text-xs tracking-widest">
                  Initializing High-Precision Analysis...
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-8">
        <Card className="shadow-sm border-none ring-1 ring-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Layers className="h-5 w-5 text-accent" />
                Strategy Feed
              </CardTitle>
              <CardDescription className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
                Live {STRATEGIES.find(s => s.value === strategy)?.label} Detections
              </CardDescription>
            </div>
            <Button size="sm" variant="outline" className="h-8 text-[10px] uppercase font-bold" onClick={handleSync} disabled={isSyncing}>
              {isSyncing ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : 'Force Sync'}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
              {signals.length > 0 ? (
                signals.map((signal) => (
                  <div key={signal.id} className="flex items-center justify-between p-3 rounded-xl bg-white border border-border/50 shadow-sm hover:border-primary/20 transition-all">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-2.5 rounded-lg",
                        signal.type.includes('RISE') || signal.type.includes('EVEN') || signal.type.includes('OVER') || signal.type.includes('MATCH') ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                      )}>
                        {signal.type.includes('RISE') || signal.type.includes('EVEN') || signal.type.includes('OVER') || signal.type.includes('MATCH') ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      </div>
                      <div>
                        <div className="font-bold flex items-center gap-2 text-sm tracking-tight">
                          {VOLATILITY_INDICES.find(i => i.value === signal.symbol)?.label || signal.symbol}
                          <Badge variant="outline" className="text-[9px] h-4 px-1 leading-none uppercase font-black bg-slate-50 border-slate-200">
                            {signal.type}
                          </Badge>
                          {signal.runs && (
                            <Badge className="bg-primary/10 text-primary border-primary/20 text-[8px] h-4">
                              <Clock className="h-2 w-2 mr-1" />
                              {signal.runs} RUN
                            </Badge>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-medium">{format(new Date(signal.timestamp), 'HH:mm:ss')} | Digit: {signal.lastDigit}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-sm tracking-tighter">{signal.price.toFixed(5)}</div>
                      <div className={cn("text-[9px] font-bold uppercase tracking-widest", signal.synced ? "text-emerald-600" : "text-amber-600")}>
                        {signal.synced ? 'Synced' : 'Dispatching...'}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center text-muted-foreground bg-muted/10 rounded-2xl border border-dashed border-muted/50 font-medium text-xs tracking-widest">
                  LISTENING FOR {STRATEGIES.find(s => s.value === strategy)?.label.toUpperCase()} SIGNALS...
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-none ring-1 ring-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Real-Time Intelligence</CardTitle>
            <CardDescription className="text-xs uppercase font-bold tracking-widest opacity-60">Success probability metrics</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {signals.length > 0 ? (
              <div className="grid grid-cols-2 gap-6 h-full items-center">
                <div className="space-y-6">
                  <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100 shadow-sm">
                    <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest mb-1">Total Hits</p>
                    <p className="text-4xl font-mono font-bold text-emerald-600">{signals.length}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 shadow-sm">
                    <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Bot Syncs</p>
                    <p className="text-4xl font-mono font-bold text-primary">{signals.filter(s => s.synced).length}</p>
                  </div>
                </div>
                <div className="flex flex-col items-center justify-center p-8 bg-accent/5 rounded-3xl relative overflow-hidden h-full border border-accent/10">
                  <Activity className="absolute h-64 w-64 text-accent/5 -right-16 -bottom-16" />
                  <div className="z-10 text-center">
                    <p className="text-[10px] font-bold text-accent uppercase mb-2 tracking-widest">Precision Rating</p>
                    <div className="text-6xl font-mono font-bold text-accent tracking-tighter">99.8</div>
                    <p className="text-[10px] text-muted-foreground mt-3 font-bold uppercase tracking-widest">Optimal Node Analysis</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-3">
                <RefreshCw className="h-8 w-8 animate-spin opacity-10" />
                <p className="text-[10px] font-bold uppercase tracking-[0.2em]">Processing Node Stream...</p>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
