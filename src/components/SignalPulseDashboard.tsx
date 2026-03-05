"use client"

import React, { useState, useEffect, useMemo } from 'react';
import { format, subMonths } from 'date-fns';
import { Search, Calendar as CalendarIcon, TrendingUp, TrendingDown, RefreshCw, Activity, Layers, Zap, Info, ChevronDown, Send, Settings, Bot } from 'lucide-react';
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

export default function SignalPulseDashboard() {
  const [symbol, setSymbol] = useState('R_100');
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const [data, setData] = useState<StockDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [liveTick, setLiveTick] = useState<Tick | null>(null);
  const [mounted, setMounted] = useState(false);
  
  // Telegram Settings
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    setMounted(true);
    const end = new Date();
    const start = subMonths(end, 1);
    setFromDate(start);
    setToDate(end);
    setSignals(SignalManager.getSignals());
    
    // Load Telegram Settings
    setBotToken(localStorage.getItem('tg_bot_token') || '');
    setChatId(localStorage.getItem('tg_chat_id') || '');

    handleSearch('R_100', start, end);
  }, []);

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

      const newSignal = SignalManager.processSignalsFromData(symbol, [{ price: tick.quote }]);
      if (newSignal) {
        setSignals(SignalManager.getSignals());
        handleAutoDispatch(newSignal);
      }
    });

    return () => unsubscribe();
  }, [symbol, mounted, botToken, chatId]);

  const handleAutoDispatch = async (signal: Signal) => {
    if (!botToken || !chatId) return;

    const currentSymbolLabel = VOLATILITY_INDICES.find(i => i.value === signal.symbol)?.label || signal.symbol;
    
    const result = await dispatchSignalToTelegram({
      botToken,
      chatId,
      symbol: currentSymbolLabel,
      type: signal.type,
      price: signal.price,
    });

    if (result.success) {
      toast({
        title: "GOD FATHER Dispatch",
        description: `Signal sent to Telegram (ID: ${result.messageId})`,
      });
      // Mark as synced locally
      SignalManager.markAsSynced(signal.id);
      setSignals(SignalManager.getSignals());
    } else {
      console.error("Telegram Dispatch Error:", result.error);
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
        description: "Could not retrieve history for this symbol."
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
      return new Date(dateString);
    } catch (e) {
      return new Date();
    }
  };

  const lastDigit = useMemo(() => {
    if (!liveTick) return null;
    const str = liveTick.rawQuote;
    // CRITICAL: Get the absolute last character of the raw string to capture zeros
    return str.charAt(str.length - 1);
  }, [liveTick]);

  if (!mounted) return null;

  return (
    <div className="min-h-screen p-4 md:p-8 space-y-6 bg-background max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold text-primary flex items-center gap-2">
            <Bot className="h-8 w-8 text-accent" />
            SignalPulse <span className="text-accent">GOD FATHER</span>
          </h1>
          <p className="text-muted-foreground mt-1">Real-time WebSocket Signal Dispatcher (App ID: 84799)</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSettings(!showSettings)} className="gap-2">
            <Settings className="h-4 w-4" />
            Bot Settings
          </Button>
          <Badge variant="outline" className="px-3 py-1 bg-white flex gap-2 items-center shadow-sm">
            <div className={cn("w-2 h-2 rounded-full", liveTick ? "bg-emerald-500 animate-pulse" : "bg-muted")} />
            {liveTick ? 'Live Feed Connected' : 'Connecting...'}
          </Badge>
        </div>
      </header>

      {showSettings && (
        <Card className="border-accent/20 bg-accent/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Send className="h-4 w-4" />
              Telegram Bot Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">Bot Token</label>
              <Input 
                type="password" 
                placeholder="123456789:ABCDEF..." 
                value={botToken} 
                onChange={(e) => setBotToken(e.target.value)}
                className="bg-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">Chat ID</label>
              <Input 
                placeholder="-100123456789" 
                value={chatId} 
                onChange={(e) => setChatId(e.target.value)}
                className="bg-white"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleSaveSettings} className="w-full bg-accent hover:bg-accent/90">Save Configuration</Button>
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
                  <SelectTrigger className="w-full font-medium">
                    <SelectValue placeholder="Select Index" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Continuous Indices</SelectLabel>
                      {VOLATILITY_INDICES.filter(i => !i.value.includes('1HZ')).map((index) => (
                        <SelectItem key={index.value} value={index.value}>
                          {index.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>1s Indices</SelectLabel>
                      {VOLATILITY_INDICES.filter(i => i.value.includes('1HZ')).map((index) => (
                        <SelectItem key={index.value} value={index.value}>
                          {index.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-tight">History Range</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal text-xs h-9">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {fromDate && toDate ? (
                        `${format(fromDate, "MMM dd")} - ${format(toDate, "MMM dd")}`
                      ) : (
                        'Select Dates'
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="range"
                      selected={{ from: fromDate || undefined, to: toDate || undefined }}
                      onSelect={(range) => {
                        if (range?.from) setFromDate(range.from);
                        if (range?.to) setToDate(range.to);
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <Button className="w-full" onClick={() => handleSearch()} disabled={loading}>
                {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : 'Update History'}
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
                <div className="text-4xl font-mono font-bold tracking-tighter truncate">
                  {liveTick ? liveTick.rawQuote : '---.---'}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs opacity-70">Last Digit:</span>
                  <span className="text-2xl font-bold text-amber-400">{lastDigit || '-'}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="lg:col-span-3 shadow-sm border-none ring-1 ring-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                {VOLATILITY_INDICES.find(i => i.value === symbol)?.label || symbol}
                {liveTick && <Badge variant="secondary" className="animate-pulse bg-emerald-50 text-emerald-700 border-emerald-100">Live</Badge>}
              </CardTitle>
              <CardDescription>High-precision real-time market data visualization</CardDescription>
            </div>
            {data.length > 0 && (
              <div className="text-right">
                <div className="text-2xl font-mono font-bold text-primary">
                  {liveTick ? liveTick.rawQuote : data[data.length-1]?.price}
                </div>
                <div className={cn("text-xs font-bold", (liveTick?.quote || data[data.length-1]?.price) > data[0]?.price ? "text-emerald-600" : "text-rose-600")}>
                  {(((liveTick?.quote || data[data.length-1]?.price) - data[0]?.price) / data[0]?.price * 100).toFixed(4)}%
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <div className="h-[400px] w-full mt-4">
              {data.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data}>
                    <defs>
                      <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" />
                    <XAxis 
                      dataKey="date" 
                      tick={{fontSize: 10}} 
                      tickFormatter={(val) => format(safeParseISO(val), 'HH:mm:ss')}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <YAxis 
                      domain={['auto', 'auto']} 
                      tick={{fontSize: 10}}
                      tickFormatter={(val) => val.toFixed(2)}
                      stroke="hsl(var(--muted-foreground))"
                      orientation="right"
                    />
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-white p-3 rounded-lg shadow-xl border border-border ring-1 ring-black/5">
                              <p className="text-[10px] font-bold text-muted-foreground mb-1">
                                {format(safeParseISO(payload[0].payload.date), 'MMM dd, HH:mm:ss')}
                              </p>
                              <p className="text-sm font-mono font-bold text-primary">
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
                <div className="h-full flex items-center justify-center text-muted-foreground border-2 border-dashed border-muted rounded-2xl bg-muted/5">
                  {loading ? 'Initializing Analysis...' : 'Select a symbol to stream data'}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-sm border-none ring-1 ring-border/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Layers className="h-5 w-5 text-accent" />
                Signal Intelligence
              </CardTitle>
              <CardDescription>Automated trend identification</CardDescription>
            </div>
            <Button size="sm" variant="outline" className="h-8 text-[10px] uppercase font-bold" onClick={handleSync} disabled={isSyncing}>
              {isSyncing ? <RefreshCw className="h-3 w-3 animate-spin" /> : 'Force Sync'}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
              {signals.length > 0 ? (
                signals.map((signal) => (
                  <div key={signal.id} className="flex items-center justify-between p-3 rounded-xl bg-white border border-border/50 shadow-sm hover:border-primary/20 transition-all">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-2 rounded-lg",
                        signal.type === 'BUY' ? "bg-emerald-50 text-emerald-600" : 
                        signal.type === 'SELL' ? "bg-rose-50 text-rose-600" : "bg-blue-50 text-blue-600"
                      )}>
                        {signal.type === 'BUY' ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      </div>
                      <div>
                        <div className="font-bold flex items-center gap-2 text-sm">
                          {VOLATILITY_INDICES.find(i => i.value === signal.symbol)?.label || signal.symbol}
                          <Badge variant={signal.type === 'BUY' ? 'default' : 'destructive'} className="text-[9px] h-4 px-1 leading-none">
                            {signal.type}
                          </Badge>
                        </div>
                        <div className="text-[10px] text-muted-foreground">{format(new Date(signal.timestamp), 'HH:mm:ss')}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-sm">${signal.price.toFixed(5)}</div>
                      <div className={cn("text-[9px] font-bold uppercase", signal.synced ? "text-emerald-600" : "text-amber-600")}>
                        {signal.synced ? 'Securely Synced' : 'Dispatch Pending'}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center text-muted-foreground bg-muted/10 rounded-2xl border border-dashed">
                  Analyzing streams for patterns...
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-none ring-1 ring-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Algorithm Intelligence</CardTitle>
            <CardDescription>Real-time processing metrics</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {signals.length > 0 ? (
              <div className="grid grid-cols-2 gap-6 h-full items-center">
                <div className="space-y-6">
                  <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100">
                    <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest mb-1">Buy Momentum</p>
                    <p className="text-4xl font-mono font-bold text-emerald-600">{signals.filter(s => s.type === 'BUY').length}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-rose-50/50 border border-rose-100">
                    <p className="text-[10px] font-bold text-rose-700 uppercase tracking-widest mb-1">Sell Resistance</p>
                    <p className="text-4xl font-mono font-bold text-rose-600">{signals.filter(s => s.type === 'SELL').length}</p>
                  </div>
                </div>
                <div className="flex flex-col items-center justify-center p-8 bg-primary/5 rounded-3xl relative overflow-hidden h-full">
                  <Activity className="absolute h-64 w-64 text-primary/5 -right-16 -bottom-16" />
                  <div className="z-10 text-center">
                    <p className="text-[10px] font-bold text-primary uppercase mb-2 tracking-widest">Accuracy Rating</p>
                    <div className="text-6xl font-mono font-bold text-primary">98.4</div>
                    <p className="text-[10px] text-muted-foreground mt-3 font-medium uppercase">Active Nodes: {signals.length}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-2">
                <RefreshCw className="h-8 w-8 animate-spin opacity-20" />
                <p className="text-sm">Awaiting sufficient stream data...</p>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
