'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  PhoneCall,
  Calendar,
  Building2,
  ClipboardList,
  PlayCircle,
  CheckCircle2,
  XCircle,
  DollarSign,
  ShieldCheck,
  Clock,
  Activity,
  Sliders,
  Lightbulb,
  FileText,
  BarChart3,
  Globe2,
  Filter,
  Megaphone,
  Shield,
  KeyRound,
  Layers,
  History,
  Settings,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  badgeColor?: string;
}

export interface NavGroup {
  id: string;
  title: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    id: 'overview',
    title: 'Overview',
    items: [
      { label: 'Dashboard', href: '/control-panel', icon: LayoutDashboard },
    ],
  },
  {
    id: 'lead-management',
    title: 'Lead Management',
    items: [
      { label: 'All Leads', href: '/control-panel/leads', icon: Users },
      { label: 'Qualified Leads', href: '/control-panel/leads/qualified', icon: UserCheck },
      { label: 'Follow-ups', href: '/control-panel/leads/follow-ups', icon: PhoneCall },
      { label: 'Walkthrough Requests', href: '/control-panel/leads/walkthroughs', icon: Calendar },
      { label: 'Companies', href: '/control-panel/companies', icon: Building2 },
    ],
  },
  {
    id: 'assessment-management',
    title: 'Assessment Management',
    items: [
      { label: 'All Assessments', href: '/control-panel/assessments', icon: ClipboardList },
      { label: 'Active Assessments', href: '/control-panel/assessments/active', icon: PlayCircle },
      { label: 'Completed Assessments', href: '/control-panel/assessments/completed', icon: CheckCircle2 },
      { label: 'Abandoned Assessments', href: '/control-panel/assessments/abandoned', icon: XCircle },
    ],
  },
  {
    id: 'calculators',
    title: 'Calculators',
    items: [
      { label: 'Payroll Cost', href: '/control-panel/calculators/payroll-cost', icon: DollarSign },
      { label: 'Payroll Compliance', href: '/control-panel/calculators/payroll-compliance', icon: ShieldCheck },
      { label: 'HR Administration Cost', href: '/control-panel/calculators/hr-admin-cost', icon: Clock },
      { label: 'SME HR Health Check', href: '/control-panel/calculators/sme-health-check', icon: Activity },
    ],
  },
  {
    id: 'intelligence',
    title: 'Intelligence',
    items: [
      { label: 'Scoring Rules', href: '/control-panel/intelligence/scoring-rules', icon: Sliders },
      { label: 'Recommendations', href: '/control-panel/intelligence/recommendations', icon: Lightbulb },
      { label: 'Recommendation Templates', href: '/control-panel/intelligence/templates', icon: FileText },
    ],
  },
  {
    id: 'analytics',
    title: 'Analytics',
    items: [
      { label: 'Overview', href: '/control-panel/analytics/overview', icon: BarChart3 },
      { label: 'Geographic Analytics', href: '/control-panel/analytics/geography', icon: Globe2 },
      { label: 'Conversion Funnel', href: '/control-panel/analytics/funnel', icon: Filter },
      { label: 'Campaign Performance', href: '/control-panel/analytics/campaigns', icon: Megaphone },
    ],
  },
  {
    id: 'system',
    title: 'System',
    items: [
      { label: 'Administrators', href: '/control-panel/system/admins', icon: Shield },
      { label: 'Roles & Permissions', href: '/control-panel/system/roles', icon: KeyRound },
      { label: 'Integrations', href: '/control-panel/system/integrations', icon: Layers },
      { label: 'Audit Logs', href: '/control-panel/system/audit-logs', icon: History },
      { label: 'Settings', href: '/control-panel/system/settings', icon: Settings },
    ],
  },
];

export interface SidebarNavigationProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onCloseMobile?: () => void;
  className?: string;
}

export const SidebarNavigation: React.FC<SidebarNavigationProps> = ({
  isCollapsed,
  onToggleCollapse,
  onCloseMobile,
  className = '',
}) => {
  const pathname = usePathname();
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  return (
    <aside
      className={`h-full flex flex-col bg-[#0B0F19] text-white border-r border-[#1E2438] transition-all duration-300 select-none ${
        isCollapsed ? 'w-20' : 'w-64'
      } ${className}`}
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-[#1E2438] shrink-0">
        <Link
          href="/control-panel"
          onClick={onCloseMobile}
          className="flex items-center gap-3 overflow-hidden group"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#5157FB] to-[#6878FF] flex items-center justify-center shrink-0 shadow-[0_2px_10px_rgba(81,87,251,0.4)] group-hover:scale-105 transition-transform">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col truncate">
              <span className="text-base font-extrabold tracking-tight text-white leading-tight">
                GoSwift<span className="text-[#6878FF] font-black">HR</span>
              </span>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                Intelligence OS
              </span>
            </div>
          )}
        </Link>

        {/* Desktop Collapse Toggle */}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="hidden md:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          aria-label={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {isCollapsed ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Navigation Scrollable Body */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-6 scrollbar-thin scrollbar-thumb-slate-800">
        {navGroups.map((group) => {
          const isGroupCollapsed = collapsedGroups[group.id] && !isCollapsed;

          return (
            <div key={group.id} className="space-y-1">
              {/* Group Title (When Expanded) */}
              {!isCollapsed ? (
                <div
                  onClick={() => toggleGroup(group.id)}
                  className="flex items-center justify-between px-3 py-1 text-[11px] font-semibold tracking-wider uppercase text-slate-400 hover:text-slate-200 cursor-pointer transition-colors"
                >
                  <span>{group.title}</span>
                  <span className="text-slate-500">
                    {isGroupCollapsed ? (
                      <ChevronRight className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </span>
                </div>
              ) : (
                <div className="w-full h-px bg-white/10 my-2" />
              )}

              {/* Group Items */}
              {!isGroupCollapsed && (
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const isActive =
                      item.href === '/control-panel'
                        ? pathname === '/control-panel'
                        : pathname === item.href || pathname.startsWith(item.href + '/');

                    const Icon = item.icon;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onCloseMobile}
                        title={isCollapsed ? item.label : undefined}
                        className={`group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                          isActive
                            ? 'bg-[#5157FB] text-white font-semibold shadow-[0_2px_10px_rgba(81,87,251,0.35)]'
                            : 'text-slate-300 hover:text-white hover:bg-white/5'
                        } ${isCollapsed ? 'justify-center px-0' : ''}`}
                      >
                        <Icon
                          className={`w-4 h-4 shrink-0 transition-transform ${
                            isActive
                              ? 'text-white'
                              : 'text-slate-400 group-hover:text-white group-hover:scale-110'
                          }`}
                        />

                        {!isCollapsed && (
                          <>
                            <span className="truncate flex-1">{item.label}</span>
                            {item.badge && (
                              <span
                                className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                                  isActive
                                    ? 'bg-white/20 text-white'
                                    : item.badgeColor || 'bg-white/10 text-slate-300'
                                }`}
                              >
                                {item.badge}
                              </span>
                            )}
                          </>
                        )}

                        {/* Collapsed Active Indicator */}
                        {isCollapsed && isActive && (
                          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[#5157FB] rounded-l" />
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Sidebar Footer User Info / System Pill */}
      <div className="p-3 border-t border-[#1E2438] bg-[#070913] shrink-0">
        <div
          className={`flex items-center gap-3 ${
            isCollapsed ? 'justify-center' : 'px-2'
          }`}
        >
          <div className="relative">
            <div className="w-8 h-8 rounded-full bg-[#5157FB]/20 text-[#899EFF] font-bold text-xs flex items-center justify-center ring-1 ring-[#5157FB]/40">
              SA
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#070913]" />
          </div>

          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate leading-tight">
                System Admin
              </p>
              <p className="text-[10px] text-slate-400 truncate">
                admin@goswifthr.com
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
