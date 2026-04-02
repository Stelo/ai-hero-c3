import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { QuizMetrics } from "~/services/analyticsService";

interface Props {
  data: QuizMetrics[];
}

export function QuizPassRateChart({ data }: Props) {
  const chartData = data.map((q) => ({
    name: q.quizTitle,
    "Best Attempt": Math.round(q.bestAttemptPassRate * 100),
    "Latest Attempt": Math.round(q.latestAttemptPassRate * 100),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 12 }} />
        <Tooltip formatter={(value) => `${value}%`} />
        <Legend />
        <Bar dataKey="Best Attempt" fill="#6366f1" />
        <Bar dataKey="Latest Attempt" fill="#a5b4fc" />
      </BarChart>
    </ResponsiveContainer>
  );
}
