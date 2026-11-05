'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Menu,
  Bell,
  Search,
  ChevronDown,
  User,
  Shield,
  History,
  LogOut,
  ExternalLink,
} from 'lucide-react';
import { navGroups } from './SidebarNavigation';
import { useAdminAuth } from '@/components/auth/AdminAuthProvider';

export interface TopNavbarProps {
  onOpenMobileMenu: () => void;
  onOpenSearchModal: () => void;
  onOpenSignOutDialog: () => void;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({
  onOpenMobileMenu,
  onOpenSearchModal,
  onOpenSignOutDialog,
}) => {
  const pathname = usePathname();
  const { admin } = useAdminAuth();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Find active label for breadcrumb
  let activeLabel = 'Dashboard';
  for (const group of navGroups) {
    for (const item of group.items) {
      if (item.href === pathname) {
        activeLabel = item.label;
        break;
      }
    }
  }

  return (
    <header className="sticky top-0 z-30 h-16 bg-white border-b border-goswift-grey-muted px-4 sm:px-6 flex items-center justify-between">
      {/* Left: Mobile Toggle & Breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="md:hidden p-2 rounded-lg text-goswift-grey-subtle hover:text-goswift-navy hover:bg-goswift-grey-light transition-colors"
          aria-label="Open Navigation Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="hidden sm:flex items-center gap-2 text-sm text-goswift-grey-subtle">
          <Link href="/control-panel" className="hover:text-goswift-primary transition-colors font-medium">
            Control Panel
          </Link>
          <span className="text-goswift-grey-muted">/</span>
          <span className="font-semibold text-goswift-navy">{activeLabel}</span>
        </div>
      </div>

      {/* Center: Global Search Trigger Button */}
      <div className="flex-1 max-w-md mx-4">
        <button
          type="button"
          onClick={onOpenSearchModal}
          className="w-full flex items-center justify-between px-3.5 py-1.5 text-sm bg-goswift-grey-light border border-goswift-grey-muted rounded-lg text-goswift-grey-subtle hover:text-goswift-navy hover:border-slate-300 transition-all shadow-2xs"
        >
          <div className="flex items-center gap-2 truncate">
            <Search className="w-4 h-4 text-goswift-primary shrink-0" />
            <span className="truncate">Search navigation...</span>
          </div>
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono font-medium text-goswift-grey-subtle bg-white border border-goswift-grey-muted rounded shadow-2xs">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right: Quick actions, Notifications, Profile */}
      <div className="flex items-center gap-2.5">
        {/* Public Site Link */}
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#5157FB] hover:text-[#4243DA] bg-[#EEF0FF] border border-[#5157FB]/20 rounded-lg hover:bg-[#E0E4FF] transition-colors"
          title="Open Public Assessment Platform"
        >
          <span>Live Site</span>
          <ExternalLink className="w-3 h-3" />
        </a>

        {/* Notifications Dropdown */}
        <div ref={notifRef} className="relative">
          <button
            type="button"
            onClick={() => setIsNotifOpen(!isNotifOpen)}
            className="relative p-2 rounded-lg text-goswift-grey-subtle hover:text-goswift-navy hover:bg-goswift-grey-light transition-colors"
            title="Notifications are not available yet"
            aria-label="Notifications (not available yet)"
          >
            <Bell className="w-5 h-5" />
          </button>

          {isNotifOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white border border-goswift-grey-muted shadow-xl ring-1 ring-black/5 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="px-4 py-3 bg-goswift-grey-light/60 border-b border-goswift-grey-muted flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-goswift-navy">Notifications</h4>
                </div>
              </div>

              <div className="p-6 text-center text-xs leading-5 text-goswift-grey-subtle">
                Live administrator notifications are not available yet. No notification feed is connected.
              </div>

            </div>
          )}
        </div>

        {/* User Profile Menu */}
        <div ref={profileRef} className="relative">
          <button
            type="button"
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-goswift-grey-light border border-transparent hover:border-goswift-grey-muted transition-all"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#5157FB] to-[#6878FF] text-white font-bold text-xs flex items-center justify-center ring-2 ring-[#5157FB]/20">
              {admin
                ? `${admin.firstName.charAt(0)}${admin.lastName.charAt(0)}`
                : 'AD'}
            </div>
            <div className="hidden sm:block text-left text-xs">
              <p className="font-bold text-goswift-navy leading-tight">
                {admin ? `${admin.firstName} ${admin.lastName}` : 'Administrator'}
              </p>
              <p className="text-[10px] text-goswift-grey-subtle">
                {admin?.role.replace(/_/g, ' ') || 'Admin'}
              </p>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-goswift-grey-subtle ml-0.5" />
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white border border-goswift-grey-muted shadow-xl ring-1 ring-black/5 z-50 py-1.5 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-4 py-3 border-b border-goswift-grey-muted/60">
                <p className="text-sm font-bold text-goswift-navy">
                  {admin ? `${admin.firstName} ${admin.lastName}` : 'Administrator'}
                </p>
                <p className="text-xs text-goswift-grey-subtle truncate">
                  {admin?.email}
                </p>
                <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {admin?.role.replace(/_/g, ' ') || 'Signed in'}
                </span>
              </div>

              <div className="py-1">
                <Link
                  href="/control-panel/system/admins"
                  onClick={() => setIsProfileOpen(false)}
                  className="w-full text-left px-4 py-2 text-xs text-goswift-navy hover:bg-goswift-grey-light flex items-center gap-2.5 transition-colors"
                >
                  <User className="w-3.5 h-3.5 text-goswift-grey-subtle" />
                  <span>Administrators</span>
                </Link>
                <Link
                  href="/control-panel/system/roles"
                  onClick={() => setIsProfileOpen(false)}
                  className="w-full text-left px-4 py-2 text-xs text-goswift-navy hover:bg-goswift-grey-light flex items-center gap-2.5 transition-colors"
                >
                  <Shield className="w-3.5 h-3.5 text-goswift-grey-subtle" />
                  <span>Roles & Permissions</span>
                </Link>
                <Link
                  href="/control-panel/system/audit-logs"
                  onClick={() => setIsProfileOpen(false)}
                  className="w-full text-left px-4 py-2 text-xs text-goswift-navy hover:bg-goswift-grey-light flex items-center gap-2.5 transition-colors"
                >
                  <History className="w-3.5 h-3.5 text-goswift-grey-subtle" />
                  <span>Audit Logs</span>
                </Link>
              </div>

              <div className="pt-1 border-t border-goswift-grey-muted/60">
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileOpen(false);
                    onOpenSignOutDialog();
                  }}
                  className="w-full text-left px-4 py-2 text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2.5 transition-colors font-semibold"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
