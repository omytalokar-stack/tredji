import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface HistoricalPnlChartProps {
  data: { date: string; profit: number; loss: number }[];
}

const money = (value: number) => `$${value.toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

export const HistoricalPnlChart: React.FC<HistoricalPnlChartProps> = ({ data }) => (
  <ResponsiveContainer width="100%" height={280}>
    <BarChart data={data}>
      <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
      <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
      <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(value: number) => `$${value}`} />
      <Tooltip
        formatter={(value) => money(Number(value))}
        contentStyle={{ background: '#020617', border: '1px solid #334155', borderRadius: 12 }}
      />
      <Bar dataKey="profit" name="Profit" fill="#34d399" radius={[4, 4, 0, 0]} />
      <Bar dataKey="loss" name="Loss" fill="#fb7185" radius={[4, 4, 0, 0]} />
    </BarChart>
  </ResponsiveContainer>
);
