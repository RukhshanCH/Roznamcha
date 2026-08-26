import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useAtom } from "jotai";

import { sidebarCollapsedAtom } from "@/store/atoms";
import Sidebar from "./Sidebar";
import HeaderBar from "./HeaderBar";

import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import LoadingScreen from "../ui/LoadingScreen";

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [collapsed] = useAtom(sidebarCollapsedAtom);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <AnimatePresence>
        <LoadingScreen />
      </AnimatePresence>
    );
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <Analytics />
      <SpeedInsights />

      <div className={`main-content ${collapsed ? "sidebar-collapsed" : ""}`}>
        <HeaderBar />
        <main className="content-area">{children}</main>
      </div>
    </div>
  );
}