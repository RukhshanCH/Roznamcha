import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

type BarChartProps = {
  data: React.ComponentProps<typeof Bar>["data"];
  options: React.ComponentProps<typeof Bar>["options"];
};

export default function BarChart({ data, options }: BarChartProps) {
  return <Bar data={data} options={options} />;
}
