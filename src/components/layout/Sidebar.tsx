import { useAtom } from 'jotai';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  LayoutDashboard,
  Users,
  MinusCircle,
  Building2,
  CloudUpload,
  CalendarDays,
  Wallet,
} from 'lucide-react';
import { sidebarCollapsedAtom } from '@/store/atoms';
import { useMemo } from 'react';

const menuItems = [
  { icon: LayoutDashboard, label: 'ڈیش بورڈ', path: '/dashboard' },
  // { icon: PenLine, label: 'روزانہ اندراج', path: '/daily-entry' },
  { icon: BookOpen, label: 'روزنامچہ رجسٹر', path: '/roznamcha' },
  { icon: Users, label: 'گاہک (کسٹمرز)', path: '/customers' },
  { icon: MinusCircle, label: 'اخراجات', path: '/expenses' },
  { icon: Building2, label: 'ادائیگیاں', path: '/payments' },
  { icon: Wallet, label: 'بقیہ جات', path: '/remainings' },
  // { icon: UserCircle, label: 'صارفین', path: '/users' },
  { icon: CloudUpload, label: 'بیک اپ', path: '/backup' },
];

const urduDays = ['اتوار', 'پیر', 'منگل', 'بدھ', 'جمعرات', 'جمعہ', 'ہفتہ'];
const urduMonths = [
  'جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون',
  'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر',
];

export default function Sidebar() {
  const [collapsed] = useAtom(sidebarCollapsedAtom);
  const location = useLocation();
  const navigate = useNavigate();

  const todayFormatted = useMemo(() => {
    const today = new Date();
    const dayName = urduDays[today.getDay()];
    const dateNum = today.getDate();
    const monthName = urduMonths[today.getMonth()];
    const year = today.getFullYear();
    return { dayName, dateStr: `${dateNum} ${monthName} ${year}` };
  }, []);

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-logo">
        <BookOpen className="sidebar-logo-icon" />
        <div className="sidebar-logo-text">
          <div className="sidebar-logo-title">روزنامچہ</div>
          <div className="sidebar-logo-subtitle">حساب کتاب سسٹم</div>
        </div>
      </div>

      <ul className="sidebar-menu">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <li key={item.path}>
              <a
                style={{position: "relative"}}
                className={`menu-item ${isActive ? 'active' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(item.path);
                }}
                href={item.path}
              >
                <Icon className="menu-item-icon" />
                <span className="menu-item-label">{item.label}</span>
                <span className="tooltip">
                  {item.label}
                </span>
              </a>
            </li>
          );
        })}
      </ul>

      <div className="sidebar-date-widget">
        <CalendarDays className="date-widget-icon" />
        <div className="date-widget-label">آج کی تاریخ</div>
        <div className="date-widget-date">{todayFormatted.dateStr}</div>
        <div className="date-widget-day">{todayFormatted.dayName}</div>
      </div>
    </aside>
  );
}
