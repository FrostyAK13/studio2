"use client"

import React, { useState, useEffect } from 'react';
import { format, subMonths } from 'date-fns';
import { Search, Calendar as CalendarIcon, TrendingUp, TrendingDown, RefreshCw, Activity, Layers } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Area, AreaChart, Tooltip } from 'recharts';
import { fetchHistoricalData, StockDataPoint } from '@/lib/stock-service';
import { SignalManager, Signal } from '@/lib/signal-manager';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export default function SignalPulseDashboard() {
  const [symbol, setSymbol] = useState('AAPL');
  const [fromDate, setFromDate] = useState<Date>(subMonths(new Date(), 1));
  const [toDate, setToDate] = useState<Date>(new Date());
  const [data, setData] = useState<StockDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setSignals(SignalManager.getSignals());
    handleSearch();
  }, []);

  const handleSearch = async () => {
    if (!symbol) return;
    setLoading(true);
    try {
      const result = await fetchHistoricalData(
        symbol.toUpperCase(),
        format(fromDate, 'yyyy-MM-dd'),
        format(toDate, 'yyyy-MM-dd')
      );
      setData(result);
      
      const newSignal = SignalManager.processSignalsFromData(symbol.toUpperCase(), result);
      if (newSignal) {
        setSignals(SignalManager.getSignals());
        toast({
          title: "New Signal Generated",
          description: `A ${newSignal.type} signal was generated for ${newSignal.symbol}.`,
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error fetching data",
        description: "Failed to retrieve historical stock prices."
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const count = await SignalManager.syncSignals();
      setSignals(SignalManager.getSignals());
      if (count > 0) {
        toast({
          title: "Synchronization Complete",
          description: `Successfully synced ${count} signal(s) with the server.`,
        });
      } else {
        toast({
          title: "Already Synced",
          description: "All signals are already up to date.",
        });
      }
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 space-y-8 bg-background max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold text-primary flex items-center gap-2">
            <Activity className="h-8 w-8 text-accent" />
            SignalPulse
          </h1>
          <p className="text-muted-foreground mt-1">Professional Financial Analysis & Signal Intelligence</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="px-3 py-1 bg-white flex gap-2 items-center">
            <div className={cn("w-2 h-2 rounded-full animate-pulse", signals.some(s => !s.synced) ? "bg-amber-500" : "bg-emerald-500")} />
            {signals.some(s => !s.synced) ? 'Offline Queue Active' : 'All Signals Synced'}
          </Badge>
          <Button variant="ghost" size="icon" onClick={handleSync} disabled={isSyncing}>
            <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
          </Button>
        </div>
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-1 shadow-md border-none ring-1 ring-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Search className="h-4 w-4 text-primary" />
              Analysis Params
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Stock Symbol</label>
              <Input 
                placeholder="e.g. AAPL, BTC-USD" 
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                className="uppercase"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Date Range</label>
              <div className="grid gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal text-xs">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(fromDate, "LLL dd, y")} - {format(toDate, "LLL dd, y")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="range"
                      selected={{ from: fromDate, to: toDate }}
                      onSelect={(range) => {
                        if (range?.from) setFromDate(range.from);
                        if (range?.to) setToDate(range.to);
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <Button className="w-full bg-primary hover:bg-primary/90" onClick={handleSearch} disabled={loading}>
              {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : 'Run Analysis'}
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 shadow-md border-none ring-1 ring-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-xl">{symbol} Historical Performance</CardTitle>
              <CardDescription>Visualizing price trends and volume intensity</CardDescription>
            </div>
            {data.length > 0 && (
              <div className="text-right">
                <div className="text-2xl font-bold text-primary">${data[data.length-1]?.price}</div>
                <div className={cn("text-xs font-medium", data[data.length-1]?.price > data[0]?.price ? "text-emerald-600" : "text-rose-600")}>
                  {((data[data.length-1]?.price - data[0]?.price) / data[0]?.price * 100).toFixed(2)}% Over period
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <div className="h-[350px] w-full mt-4">
              {data.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data}>
                    <defs>
                      <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorAccent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" />
                    <XAxis 
                      dataKey="date" 
                      tick={{fontSize: 12}} 
                      tickFormatter={(val) => format(parseISO(val), 'MMM d')}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <YAxis 
                      domain={['auto', 'auto']} 
                      tick={{fontSize: 12}}
                      tickFormatter={(val) => `$${val}`}
                      stroke="hsl(var(--muted-foreground))"
                      orientation="right"
                    />
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-white p-3 rounded-lg shadow-lg border border-border">
                              <p className="text-xs font-bold text-muted-foreground mb-1">{format(parseISO(payload[0].payload.date), 'MMMM dd, yyyy')}</p>
                              <p className="text-sm font-bold text-primary">Price: ${payload[0].value}</p>
                              <p className="text-xs text-accent">Volume: {payload[0].payload.volume.toLocaleString()}</p>
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
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground border-2 border-dashed border-muted rounded-xl">
                  {loading ? 'Fetching market data...' : 'Search a symbol to begin analysis'}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-md border-none ring-1 ring-border/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Layers className="h-5 w-5 text-accent" />
                Signal Intelligence Queue
              </CardTitle>
              <Button size="sm" variant="outline" onClick={handleSync} className="text-xs h-8">
                Force Sync
              </Button>
            </div>
            <CardDescription>Processed signals waiting for transmission</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
              {signals.length > 0 ? (
                signals.map((signal) => (
                  <div key={signal.id} className="flex items-center justify-between p-3 rounded-lg bg-white border border-border/50 group hover:border-primary/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-2 rounded-full",
                        signal.type === 'BUY' ? "bg-emerald-100 text-emerald-600" : 
                        signal.type === 'SELL' ? "bg-rose-100 text-rose-600" : "bg-blue-100 text-blue-600"
                      )}>
                        {signal.type === 'BUY' ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      </div>
                      <div>
                        <div className="font-bold flex items-center gap-2">
                          {signal.symbol}
                          <Badge variant={signal.type === 'BUY' ? 'default' : 'destructive'} className="text-[10px] h-4 uppercase px-1">
                            {signal.type}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">{format(new Date(signal.timestamp), 'MMM d, h:mm a')}</div>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end gap-1">
                      <div className="font-medium text-sm">${signal.price.toFixed(2)}</div>
                      <Badge variant="secondary" className={cn("text-[10px] px-1 h-4", signal.synced ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
                        {signal.synced ? 'Synced' : 'In Queue'}
                      </Badge>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-muted-foreground bg-muted/30 rounded-lg">
                  No signals generated yet. Try analyzing a different stock.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-md border-none ring-1 ring-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Signal Distribution</CardTitle>
            <CardDescription>Categorized historical signal output</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {signals.length > 0 ? (
              <div className="grid grid-cols-2 gap-4 h-full">
                <div className="flex flex-col justify-center space-y-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Buy Pressure</p>
                    <p className="text-3xl font-bold text-emerald-600">{signals.filter(s => s.type === 'BUY').length}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Sell Resistance</p>
                    <p className="text-3xl font-bold text-rose-600">{signals.filter(s => s.type === 'SELL').length}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Sync Ratio</p>
                    <p className="text-3xl font-bold text-primary">
                      {Math.round((signals.filter(s => s.synced).length / signals.length) * 100)}%
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-center p-4 bg-accent/5 rounded-2xl relative overflow-hidden">
                  <Activity className="absolute h-48 w-48 text-accent/10 -right-12 -bottom-12" />
                  <div className="z-10 text-center">
                    <p className="text-xs font-bold text-accent uppercase mb-2">Algorithm Health</p>
                    <div className="text-5xl font-bold text-primary">98.4</div>
                    <p className="text-[10px] text-muted-foreground mt-2">Active Signals: {signals.length}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                Distribution data available after signal generation
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

const parseISO = (dateString: string) => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};