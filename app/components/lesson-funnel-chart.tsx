import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { LessonFunnelEntry } from "~/services/analyticsService";

interface Props {
  data: LessonFunnelEntry[];
}

export function LessonFunnelChart({ data }: Props) {
  const chartData = data.map((l) => ({
    name: l.lessonTitle,
    Students: l.studentCount,
  }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 40)}>
      <BarChart data={chartData} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
        <YAxis dataKey="name" type="category" width={160} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey="Students" fill="#6366f1" />
      </BarChart>
    </ResponsiveContainer>
  );
}
