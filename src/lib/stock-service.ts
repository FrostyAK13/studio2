import { addDays, format, isAfter, isBefore, parseISO } from 'date-fns';

export interface StockDataPoint {
  date: string;
  price: number;
  volume: number;
}

export const fetchHistoricalData = async (
  symbol: string,
  from: string,
  to: string
): Promise<StockDataPoint[]> => {
  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 800));

  const startDate = parseISO(from);
  const endDate = parseISO(to);
  const data: StockDataPoint[] = [];

  let currentDate = startDate;
  let currentPrice = 100 + Math.random() * 400;

  while (isBefore(currentDate, endDate) || format(currentDate, 'yyyy-MM-dd') === format(endDate, 'yyyy-MM-dd')) {
    // Generate random daily volatility (Brownian motion style)
    const volatility = currentPrice * 0.02;
    const change = (Math.random() - 0.48) * volatility; // Slight upward bias
    currentPrice += change;
    
    data.push({
      date: format(currentDate, 'yyyy-MM-dd'),
      price: parseFloat(currentPrice.toFixed(2)),
      volume: Math.floor(Math.random() * 1000000) + 500000,
    });

    currentDate = addDays(currentDate, 1);
  }

  return data;
};