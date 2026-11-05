'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { navGroups, SidebarNavigation } from '@/components/layout/SidebarNavigation';
import { TopNavbar } from '@/components/layout/TopNavbar';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { Search, X, ArrowRight } from 'lucide-react';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import {
  AdminAuthProvider,
  useAdminAuth,
} from '@/components/auth/AdminAuthProvider';

const navigationItems = navGroups.flatMap((group) =>
  group.items.map((item) => ({
    title: item.label,
    category: group.title,
    href: item.href,
  })),
);

export default function ControlPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminAuthProvider>
      <ControlPanelContent>{children}</ControlPanelContent>
    </AdminAuthProvider>
  );
}

function ControlPanelContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { status, error: sessionError, refreshSession, logout } = useAdminAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSignOutOpen, setIsSignOutOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [router, status]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filteredSearch = searchQuery.trim()
    ? navigationItems.filter(
        (item) =>
          item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.category.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : navigationItems.slice(0, 6);

  const handleSelectSearchItem = (href: string) => {
    setIsSearchOpen(false);
    setSearchQuery('');
    router.push(href);
  };

  async function handleSignOut() {
    setIsSigningOut(true);
    setLogoutError(null);
    try {
      await logout();
      setIsSignOutOpen(false);
      router.replace('/login');
    } catch (cause) {
      setLogoutError(
        cause instanceof Error
          ? cause.message
          : 'We could not end your session. Please try again.',
      );
    } finally {
      setIsSigningOut(false);
    }
  }

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-goswift-grey-light p-8">
        <LoadingSkeleton count={4} />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <main className="min-h-screen bg-goswift-grey-light p-6">
        <div className="mx-auto max-w-lg rounded-xl border border-rose-200 bg-white p-6">
          <h1 className="text-lg font-bold text-goswift-navy">
            Session verification is unavailable
          </h1>
          <p className="mt-2 text-sm text-goswift-grey-subtle">
            {sessionError || 'We could not verify your administrator session.'}
          </p>
          <Link
            href="/login"
            className="mt-4 inline-block text-sm font-semibold text-goswift-primary hover:underline"
          >
            Go to sign in
          </Link>
          <button
            type="button"
            onClick={() => void refreshSession()}
            className="mt-4 rounded-lg bg-goswift-primary px-4 py-2 text-sm font-semibold text-white"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen flex bg-goswift-grey-light font-sans text-goswift-navy">
      {/* Desktop Sidebar (Persistent & Collapsible) */}
      <div className="hidden md:flex shrink-0 sticky top-0 h-screen z-40">
        <Suspense fallback={<div className="w-64 bg-[#0B0F19] h-full" />}>
          <SidebarNavigation
            isCollapsed={isCollapsed}
            onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
          />
        </Suspense>
      </div>

      {/* Mobile Drawer (Responsive Slide-out) */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-goswift-navy/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileOpen(false)}
          />
          <div className="relative z-10 w-72 h-full flex flex-col bg-[#0B0F19] shadow-2xl animate-in slide-in-from-left duration-200">
            <Suspense fallback={<div className="w-72 bg-[#0B0F19] h-full" />}>
              <SidebarNavigation
                isCollapsed={false}
                onToggleCollapse={() => {}}
                onCloseMobile={() => setIsMobileOpen(false)}
              />
            </Suspense>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Suspense fallback={<div className="h-16 bg-white border-b border-goswift-grey-muted" />}>
          <TopNavbar
            onOpenMobileMenu={() => setIsMobileOpen(true)}
            onOpenSearchModal={() => setIsSearchOpen(true)}
            onOpenSignOutDialog={() => setIsSignOutOpen(true)}
          />
        </Suspense>

        {logoutError && (
          <div role="alert" className="mx-4 mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 sm:mx-6">
            {logoutError}
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Suspense fallback={<LoadingSkeleton count={4} />}>
            {children}
          </Suspense>
        </main>
      </div>

      {/* Global Quick Search Modal */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-16">
          <div
            className="fixed inset-0 bg-goswift-navy/50 backdrop-blur-xs transition-opacity"
            onClick={() => setIsSearchOpen(false)}
          />
          <div className="relative z-10 w-full max-w-xl bg-white rounded-2xl border border-goswift-grey-muted shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-goswift-grey-muted flex items-center gap-3">
              <Search className="w-5 h-5 text-goswift-primary shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search navigation..."
                autoFocus
                className="w-full text-base bg-transparent text-goswift-navy placeholder:text-goswift-grey-subtle/70 focus:outline-hidden"
              />
              <button
                type="button"
                onClick={() => setIsSearchOpen(false)}
                className="p-1 rounded-lg text-goswift-grey-subtle hover:text-goswift-navy hover:bg-goswift-grey-light transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-2 max-h-80 overflow-y-auto divide-y divide-slate-100">
              <div className="px-3 py-1.5 text-[11px] font-bold text-goswift-grey-subtle uppercase tracking-wider">
                {searchQuery ? 'Navigation matches' : 'Go to a section'}
              </div>

              {filteredSearch.length === 0 ? (
                <div className="p-8 text-center text-sm text-goswift-grey-subtle">
                  No navigation sections match &quot;{searchQuery}&quot;.
                </div>
              ) : (
                filteredSearch.map((item) => (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => handleSelectSearchItem(item.href)}
                    className="w-full text-left px-3.5 py-2.5 rounded-xl flex items-center justify-between hover:bg-[#EEF0FF]/60 group transition-colors"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-goswift-grey-light text-goswift-grey-subtle group-hover:bg-white group-hover:text-goswift-primary transition-colors">
                        {item.category}
                      </span>
                      <span className="text-sm font-medium text-goswift-navy group-hover:text-goswift-primary transition-colors truncate">
                        {item.title}
                      </span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-goswift-grey-subtle group-hover:text-goswift-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))
              )}
            </div>

            <div className="px-4 py-2.5 bg-goswift-grey-light/60 border-t border-goswift-grey-muted text-xs text-goswift-grey-subtle flex items-center justify-between">
              <span>Navigation search only</span>
              <kbd className="px-1.5 py-0.5 font-mono text-[10px] bg-white border border-goswift-grey-muted rounded shadow-2xs">
                ESC to close
              </kbd>
            </div>
          </div>
        </div>
      )}

      {/* Sign Out Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={isSignOutOpen}
        onClose={() => setIsSignOutOpen(false)}
        onConfirm={() => void handleSignOut()}
        title="Sign Out of GoSwiftHR Intelligence"
        description="This will revoke your administrator session on the server and return you to sign in."
        confirmLabel="Sign Out"
        cancelLabel="Stay Signed In"
        variant="primary"
        isLoading={isSigningOut}
      />
    </div>
  );
}
