"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  GitPullRequest,
  Key,
  LayoutDashboard,
  RefreshCw,
  Settings,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    label: "Overview",
    href: "/dashboard",
    icon: <LayoutDashboard className="h-4 w-4" />,
  },
  {
    label: "Repositories",
    href: "/dashboard/repositories",
    icon: <GitPullRequest className="h-4 w-4" />,
  },
  {
    label: "Analytics",
    href: "/dashboard/analytics",
    icon: <BarChart3 className="h-4 w-4" />,
  },
  {
    label: "Migration",
    href: "/dashboard/migration",
    icon: <RefreshCw className="h-4 w-4" />,
  },
  {
    label: "API Keys",
    href: "/dashboard/settings",
    icon: <Key className="h-4 w-4" />,
  },
  {
    label: "Settings",
    href: "/dashboard/settings",
    icon: <Settings className="h-4 w-4" />,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-gray-200 bg-white">
      <div className="flex h-16 items-center gap-2.5 border-b border-gray-200 px-6">
        <Shield className="h-7 w-7 text-indigo-600" />
        <span className="text-lg font-bold text-gray-900">{APP_NAME}</span>
      </div>

      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={`${item.label}-${item.href}`}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-gray-200 p-4">
        <div className="rounded-lg bg-indigo-50 p-3">
          <p className="text-xs font-semibold text-indigo-800">BYOK Mode</p>
          <p className="mt-0.5 text-xs text-indigo-600">
            Your API keys, your data, zero lock-in.
          </p>
        </div>
      </div>
    </aside>
  );
}
