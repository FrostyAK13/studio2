"use client"

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { format, subMonths, parseISO } from 'date-fns';
import { Search, TrendingUp, TrendingDown, RefreshCw, Activity, Layers, Zap, Send, Settings, Bot, Target, Hash, ArrowUpDown, Clock, Info, MessageSquare, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { fetchHistoricalData, StockDataPoint } from '@/lib/stock-service';
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

const DEFAULT_TEMPLATE = `🚨 FROSTYTRADERS - DERIV SIGNAL

📊 Market: {market}
🤖 Bot / Strategy: {strategy}
🎯 Signal Direction: {signal}
📲 Entry Point: {entry}
⏱ Signal Duration: {time}
🔁 Number of Runs: {runs}
🔄 Recovery: {recovery}
💪 Confidence Level: {confidence}

🚫 Contact: {contact}

📝 Additional Notes (Optional):
{notes}

🔗 Create a Deriv Developer Account:
https://deriv.com/signup?sidc=808C8BC1-CA13-4AE4-83EE-0A6513B55687&utm_campaign=dynamicworks&utm_medium=affiliate&utm_source=CU31372`;

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
  
  // Bot & Template Settings
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
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
      setTemplate(localStorage.getItem('tg_template') || DEFAULT_TEMPLATE);
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
        strategy,
        tick.rawQuote
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
    const currentStrategyLabel = STRATEGIES.find(s => s.value === signal.strategy)?.label || signal.strategy;
    
    const result = await dispatchSignalToTelegram({
      botToken,
      chatId,
      symbol: currentSymbolLabel,
      strategy: currentStrategyLabel,
      type: signal.type,
      price: signal.rawPrice || signal.price.toString(),
      runs: signal.runs || 1,
      template,
      time: format(new Date(), 'HH:mm:ss')
    });

    if (result.success) {
      toast({
        title: "FROSTYTRADERS Dispatch",
        description: `${signal.type} Signal sent to Telegram`,
      });
      SignalManager.markAsSynced(signal.id);
      setSignals(SignalManager.getSignals());
    }
  };

  const handleSaveSettings = () => {
    localStorage.setItem('tg_bot_token', botToken);
    localStorage.setItem('tg_chat_id', chatId);
    localStorage.setItem('tg_template', template);
    setShowSettings(false);
    toast({
      title: "Configuration Saved",
      description: "FrostyTraders bot and template updated.",
    });
  };

  const handleResetTemplate = () => {
    setTemplate(DEFAULT_TEMPLATE);
    toast({
      description: "Template reset to default format.",
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

  const previewContent = useMemo(() => {
    let content = template;
    content = content.replace(/{market}/g, "Volatility 75");
    content = content.replace(/{strategy}/g, "Even/Odd Dominance");
    content = content.replace(/{signal}/g, "ODD");
    content = content.replace(/{entry}/g, "{entry}");
    content = content.replace(/{time}/g, format(new Date(), 'HH:mm:ss a'));
    content = content.replace(/{runs}/g, "{runs}");
    content = content.replace(/{recovery}/g, "{recovery}");
    content = content.replace(/{confidence}/g, "82%");
    content = content.replace(/{contact}/g, "No Direct Messages");
    content = content.replace(/{notes}/g, "{notes}");
    return content;
  }, [template]);

  if (!mounted) return null;

  return (
    <div className="min-h-screen p-4 md:p-8 space-y-6 bg-[#f8f9fc] max-w-7xl mx-auto font-body">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold text-primary flex items-center gap-2">
            <Bot className="h-8 w-8 text-accent" />
            SignalPulse <span className="text-accent">FROSTYTRADERS</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm font-medium">Professional Deriv Signal Intelligence</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSettings(!showSettings)} className="gap-2 text-xs font-bold border-accent/20">
            <Settings className="h-4 w-4 text-accent" />
            SIGNAL MESSAGE FORMAT
          </Button>
          <Badge variant="outline" className="px-3 py-1 bg-white flex gap-2 items-center shadow-sm text-[10px] font-bold">
            <div className={cn("w-2 h-2 rounded-full", liveTick ? "bg-emerald-500 animate-pulse" : "bg-muted")} />
            {liveTick ? 'LIVE FEED CONNECTED' : 'OFFLINE'}
          </Badge>
        </div>
      </header>

      {showSettings && (
        <Card className="border-accent/10 bg-[#f0f2f9] overflow-hidden shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300">
          <CardHeader className="pb-2 border-b border-border/10">
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-accent" />
              Signal Message Format
            </CardTitle>
            <CardDescription className="text-xs">Customize the signal message template sent to Telegram</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left Column: Editor */}
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Bot Configuration</label>
                    <div className="grid grid-cols-2 gap-4">
                      <Input 
                        type="password" 
                        placeholder="Telegram Bot Token" 
                        value={botToken} 
                        onChange={(e) => setBotToken(e.target.value)}
                        className="bg-white h-10 text-xs border-none shadow-sm focus-visible:ring-accent"
                      />
                      <Input 
                        placeholder="Telegram Chat ID" 
                        value={chatId} 
                        onChange={(e) => setChatId(e.target.value)}
                        className="bg-white h-10 text-xs border-none shadow-sm focus-visible:ring-accent"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Message Template</label>
                    <Textarea 
                      value={template} 
                      onChange={(e) => setTemplate(e.target.value)}
                      className="bg-[#c2cbd8] text-primary font-mono text-xs h-[250px] border-none shadow-inner p-4 focus-visible:ring-accent resize-none rounded-xl"
                    />
                  </div>
                </div>

                <div className="p-4 bg-[#c2cbd8]/50 rounded-xl space-y-2">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Available Placeholders:</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] font-medium text-muted-foreground">
                    <p><span className="text-accent">{'{market}'}</span> - Market name</p>
                    <p><span className="text-accent">{'{strategy}'}</span> - Strategy name</p>
                    <p><span className="text-accent">{'{signal}'}</span> - Signal direction</p>
                    <p><span className="text-accent">{'{confidence}'}</span> - Confidence %</p>
                    <p><span className="text-accent">{'{time}'}</span> - Local time</p>
                    <p><span className="text-accent">{'{symbol}'}</span> - Market symbol</p>
                  </div>
                </div>
              </div>

              {/* Right Column: Preview */}
              <div className="space-y-4">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Preview</label>
                <div className="bg-[#1a1e2c] p-6 rounded-[2rem] shadow-2xl h-full border border-white/5 relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-accent/20 to-transparent"></div>
                  <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-emerald-400">
                    {previewContent}
                  </pre>
                </div>
              </div>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-between mt-8 pt-6 border-t border-border/10 gap-4">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleResetTemplate}
                className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-white/50"
              >
                <RotateCcw className="h-3 w-3 mr-2" />
                Reset to Default Format
              </Button>
              <div className="flex gap-4">
                <Button variant="ghost" size="sm" onClick={() => setShowSettings(false)} className="text-[10px] font-bold uppercase tracking-widest">Cancel</Button>
                <Button onClick={handleSaveSettings} className="bg-accent hover:bg-accent/90 h-11 px-10 text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-accent/20 rounded-lg">Save Settings</Button>
              </div>
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
              <CardTitle className="text-xl flex items-center gap-2 font-headline">
                {VOLATILITY_INDICES.find(i => i.value === symbol)?.label || symbol}
                {liveTick && <Badge variant="secondary" className="animate-pulse bg-emerald-50 text-emerald-700 border-emerald-100 text-[10px] font-bold">LIVE FEED</Badge>}
              </CardTitle>
              <CardDescription className="text-xs uppercase font-bold text-muted-foreground/70 tracking-widest mt-1">
                {STRATEGIES.find(s => s.value === strategy)?.label} Processing Engine
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
                <div className="h-full flex items-center justify-center text-muted-foreground border-2 border-dashed border-muted rounded-2xl bg-muted/5 font-bold uppercase text-[10px] tracking-widest">
                  Initializing FrostyTraders Pulse...
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
                Live Strategy Feed
              </CardTitle>
              <CardDescription className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
                FROSTYTRADERS Node Detections
              </CardDescription>
            </div>
            <Button size="sm" variant="outline" className="h-8 text-[10px] uppercase font-bold border-accent/20" onClick={handleSync} disabled={isSyncing}>
              {isSyncing ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : 'RE-SYNC SIGNALS'}
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
                      <div className="font-mono font-bold text-sm tracking-tighter">{signal.rawPrice || signal.price.toFixed(5)}</div>
                      <div className={cn("text-[9px] font-bold uppercase tracking-widest flex items-center justify-end gap-1", signal.synced ? "text-emerald-600" : "text-amber-600")}>
                        {signal.synced ? <Zap className="h-3 w-3" /> : <RefreshCw className="h-3 w-3 animate-spin" />}
                        {signal.synced ? 'Dispatched' : 'Queued'}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center text-muted-foreground bg-muted/10 rounded-2xl border border-dashed border-muted/50 font-bold text-[10px] tracking-widest uppercase">
                  Listening for {STRATEGIES.find(s => s.value === strategy)?.label.toUpperCase()} Strategy Matches...
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-none ring-1 ring-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Frosty Intelligence Stats</CardTitle>
            <CardDescription className="text-xs uppercase font-bold tracking-widest opacity-60">Success Probability Metrics</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {signals.length > 0 ? (
              <div className="grid grid-cols-2 gap-6 h-full items-center">
                <div className="space-y-6">
                  <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100 shadow-sm">
                    <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest mb-1">Signals Found</p>
                    <p className="text-4xl font-mono font-bold text-emerald-600">{signals.length}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 shadow-sm">
                    <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Bot Successes</p>
                    <p className="text-4xl font-mono font-bold text-primary">{signals.filter(s => s.synced).length}</p>
                  </div>
                </div>
                <div className="flex flex-col items-center justify-center p-8 bg-accent/5 rounded-3xl relative overflow-hidden h-full border border-accent/10">
                  <Activity className="absolute h-64 w-64 text-accent/5 -right-16 -bottom-16" />
                  <div className="z-10 text-center">
                    <p className="text-[10px] font-bold text-accent uppercase mb-2 tracking-widest">Precision Rating</p>
                    <div className="text-6xl font-mono font-bold text-accent tracking-tighter">99.9</div>
                    <p className="text-[10px] text-muted-foreground mt-3 font-bold uppercase tracking-widest">Optimal Node Sync</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-3">
                <RefreshCw className="h-8 w-8 animate-spin opacity-10" />
                <p className="text-[10px] font-bold uppercase tracking-[0.2em]">Synchronizing Intelligence...</p>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
