import { useAtom } from 'jotai';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen, ReceiptText, LayoutDashboard, Users, MinusCircle,
  CloudUpload, CalendarDays, Wallet, Trash, Settings,
} from 'lucide-react';
import { sidebarCollapsedAtom } from '@/store/atoms';
import { useEffect, useMemo, useRef } from 'react';

const menuItems = [
  { icon: LayoutDashboard, label: 'ڈیش بورڈ', path: '/dashboard' },
  { icon: ReceiptText, label: 'انوائس', path: '/invoice' },
  { icon: BookOpen, label: 'روزنامچہ رجسٹر', path: '/roznamcha' },
  { icon: MinusCircle, label: 'اخراجات', path: '/expenses' },
  { icon: Wallet, label: 'بقیہ جات', path: '/remainings' },
  { icon: Users, label: 'گاہک (کسٹمرز)', path: '/customers' },
  { icon: Trash, label: 'ری سائیکل بن', path: '/recycle' },
  { icon: CloudUpload, label: 'بیک اپ', path: '/backup' },
  { icon: Settings, label: 'ترتیبات', path: '/settings' },
];

const urduDays = ['اتوار', 'پیر', 'منگل', 'بدھ', 'جمعرات', 'جمعہ', 'ہفتہ'];
const urduMonths = [
  'جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون',
  'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر',
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useAtom(sidebarCollapsedAtom);
  const location = useLocation();
  const navigate = useNavigate();
  const sidebarRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = sidebarRef.current;
    if (!el) return;

    if (collapsed) {
      el.setAttribute("inert", "true");
    } else {
      el.removeAttribute("inert");
    }
  }, [collapsed]);

  /* ── Desktop resize handling (unchanged logic, cleaned up) ── */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const el = sidebarRef.current;
    if (!el) return;

    const onResize = () => {
      if (window.innerWidth > 768) {
        el.classList.remove('closed', 'open');
        el.removeAttribute('inert');
      }
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const todayFormatted = useMemo(() => {
    const today = new Date();
    return {
      dayName: urduDays[today.getDay()],
      dateStr: `${today.getDate()} ${urduMonths[today.getMonth()]} ${today.getFullYear()}`,
    };
  }, []);

  /* ── Single handler: navigate + close on mobile ── */
  const handleNav = (path: string) => {
    navigate(path);
    if (window.innerWidth <= 768) {
      const el = sidebarRef.current;
      if (el) {
        setCollapsed(true);
      }
    }
  };

  return (
    <aside ref={sidebarRef} className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
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
                className={`menu-item ${isActive ? 'active' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  handleNav(item.path);
                }}
                href={item.path}
              >
                <Icon className="menu-item-icon" />
                <span className="menu-item-label">{item.label}</span>
                <span className="tooltip">{item.label}</span>
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