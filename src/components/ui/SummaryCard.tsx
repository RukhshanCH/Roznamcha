import {
  Wallet,
  ArrowDownLeft,
  Scale,
  FileText,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface SummaryCardProps {
  label: string;
  value: string;
  icon: 'wallet' | 'arrowDown' | 'scale' | 'fileText';
  variant: 'blue' | 'green' | 'gold' | 'white';
}

const iconMap: Record<string, LucideIcon> = {
  wallet: Wallet,
  arrowDown: ArrowDownLeft,
  scale: Scale,
  fileText: FileText,
};

export default function SummaryCard({ label, value, icon, variant }: SummaryCardProps) {
  const Icon = iconMap[icon] || FileText;

  return (
    <div className={`summary-card ${variant}`}>
      <div className="card-icon-wrapper">
        <Icon />
      </div>
      <div className="card-content">
        <span className="card-label">{label}</span>
        <span className="card-value">{value}</span>
      </div>
    </div>
  );
}
