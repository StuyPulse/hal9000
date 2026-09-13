"use client";

import Link from "next/link";
import { BarChart3, CalendarDays, Camera, ChevronLeft, ChevronRight, ClipboardCheck, ClipboardList, Globe2, LayoutDashboard, ListOrdered, Map, MoreHorizontal, Radio, Settings, ShieldCheck, Users, X, type LucideIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandLogo } from "./brand-logo";
import { SignOutButton } from "./sign-out-button";

type Props = { active: string; canManage: boolean; eventHref: string };
type NavItem = [string, string, LucideIcon];
type NavSection = [string, NavItem[]];

function NavLink({ item, active, compact = false, onNavigate }: { item: NavItem; active: string; compact?: boolean; onNavigate?: () => void }) {
  const [name, href, Icon] = item;
  const pathname = usePathname();
  const current = name === active || pathname === href || (href === "/scout/match" && pathname.startsWith("/scout/match"));
  return <Link title={compact ? name : undefined} aria-label={name} className={`nav-item ${current ? "active" : ""}`} href={href} onClick={onNavigate}><Icon size={17}/><span>{name}</span></Link>;
}

export function Sidebar({ active, canManage, eventHref }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const workspace: NavItem[] = [["Assignments", "/dashboard", LayoutDashboard], ["Teams", `${eventHref}/teams`, Users], ["Summary", `${eventHref}/summary`, BarChart3], ["Match schedule", `${eventHref}/matches`, ClipboardList]];
  const scoutingForms: NavItem[] = [["Match scouting", "/scout/match", ClipboardList], ["Pit scouting", "/scout/pit", Camera], ["Global scouting", "/scout/global", Globe2], ["Pre scouting", "/scout/pre-scout", ClipboardCheck]];
  const scoutRecords: NavItem[] = [["Submissions", "/submissions", BarChart3]];
  const strategy: NavItem[] = [["Match strategy", `${eventHref}/strategy`, Map], ["Picklist", `${eventHref}/picklist`, ListOrdered]];
  const admin: NavItem[] = [["Events", "/events", CalendarDays], ["Assignments", "/admin/assignments", Radio], ["Users & roles", "/admin/users", ShieldCheck], ["Form builder", "/admin/forms", Settings]];
  const navigation: NavSection[] = [["Workspace", workspace], ["Scouting forms", scoutingForms], ["Scout records", scoutRecords], ["Strategy", strategy]];
  if (canManage) navigation.push(["Admin", admin]);
  const mobilePrimary = [...workspace, scoutingForms[0]];
  const mobileMore = [...scoutingForms.slice(1), ...scoutRecords, ...strategy, ...(canManage ? admin : [])];
  return <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
    <div className="sidebar-top"><Link href="/scout/match" className="brand"><BrandLogo/><span className="brand-copy">HAL9000<small>STUYPULSE · 694</small></span></Link><button className="sidebar-toggle" type="button" onClick={() => setCollapsed((current) => !current)} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}>{collapsed ? <ChevronRight size={17}/> : <ChevronLeft size={17}/>}</button></div>
    <nav className="nav-links desktop-nav" aria-label="Primary navigation">{navigation.map(([label, items]) => <div className="nav-section" key={label}><div className="nav-label">{label}</div>{items.map((item) => <NavLink item={item} active={active} compact={collapsed} key={item[0]}/>)}</div>)}</nav>
    <div className="desktop-signout"><SignOutButton /></div>
    <nav className="mobile-nav" aria-label="Mobile navigation">{mobilePrimary.map((item) => <NavLink item={item} active={active} onNavigate={() => setMoreOpen(false)} key={item[0]}/>) }<button className={`nav-item mobile-more-trigger ${mobileMore.some(([name]) => name === active) ? "active" : ""}`} type="button" aria-expanded={moreOpen} aria-label={moreOpen ? "Close more navigation" : "Open more navigation"} onClick={() => setMoreOpen((current) => !current)}>{moreOpen ? <X size={18}/> : <MoreHorizontal size={18}/>}<span>More</span></button></nav>
    {moreOpen && <div className="mobile-more" role="dialog" aria-label="More navigation"><div className="mobile-more-head"><span>More</span><button type="button" onClick={() => setMoreOpen(false)} aria-label="Close more navigation"><X size={18}/></button></div>{mobileMore.map((item) => <NavLink item={item} active={active} onNavigate={() => setMoreOpen(false)} key={item[0]}/>)}<SignOutButton /></div>}
  </aside>;
}
