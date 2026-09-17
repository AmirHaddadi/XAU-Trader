"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { AppLang } from "@xau-trader/protocol";

// English/Farsi copy ported 1:1 where it has a direct equivalent in
// MQL5/Include/XAUTrader/GUI/Localization.mqh (CLocalization::En/Fa) — same
// wording the client has already seen in the native panel. Keys with no
// native-panel equivalent (journal, settings, connection badges — all new
// in the web platform) get their own reasonable EN/FA pair.
const EN = {
  appTitle: "XAU Trader",
  navDashboard: "Dashboard",
  navJournal: "Journal",
  navSettings: "Settings",
  connBridge: "Bridge",
  connEA: "MT5 EA",
  bid: "Bid",
  ask: "Ask",
  spread: "Spread",
  balance: "Balance",
  equity: "Equity",
  freeMargin: "Free Margin",
  openPositions: "Open Positions",
  noPositions: "No open positions",
  close: "Close",
  ticket: "Ticket",
  type: "Type",
  volume: "Volume",
  sl: "SL",
  tp: "TP",
  profit: "Profit",
  moneyManagement: "Money Management",
  sizingMode: "Sizing Mode",
  riskValue: "Risk Value",
  orderType: "Order Type",
  rr: "R:R",
  riskPctBalance: "% Balance",
  riskPctEquity: "% Equity",
  riskFixedMoney: "Fixed $",
  placementMarket: "Market",
  placementLimit: "Limit",
  placementStop: "Stop",
  buy: "Buy",
  sell: "Sell",
  confirmTrade: "Confirm Trade",
  confirm: "Confirm",
  cancel: "Cancel",
  sending: "Sending…",
  calculating: "Calculating…",
  lots: "Lots",
  risk: "Risk",
  reward: "Reward",
  entry: "Entry",
  journalTitle: "Trade Journal",
  journalSearchPlaceholder: "Search symbol, ticket or comment…",
  journalEmpty: "No closed trades yet",
  colSymbol: "Symbol",
  colDirection: "Direction",
  colVolume: "Volume",
  colOpen: "Open",
  colCloseCol: "Close",
  colProfit: "Profit",
  colClosedAt: "Closed",
  comments: "Comments",
  addComment: "Add a comment…",
  save: "Save",
  delete: "Delete",
  edit: "Edit",
  noComments: "No comments yet",
  settingsTitle: "Settings",
  theme: "Theme",
  themeDark: "Dark",
  themeLight: "Light",
  language: "Language",
  defaultTradeSettings: "Default Trade Settings",
  chartTimeframe: "Chart Timeframe",
  toolTrend: "Trend",
  toolRay: "Ray",
  toolFib: "Fib",
  grid: "Grid",
  connecting: "Connecting…",
  chartSection: "Chart",
} as const;

const FA: Record<keyof typeof EN, string> = {
  appTitle: "طلا تریدر",
  navDashboard: "داشبورد",
  navJournal: "ژورنال معاملات",
  navSettings: "تنظیمات",
  connBridge: "اتصال به سرور",
  connEA: "اکسپرت متاتریدر",
  bid: "بید",
  ask: "اسک",
  spread: "اسپرد",
  balance: "موجودی",
  equity: "اکوییتی",
  freeMargin: "مارجین آزاد",
  openPositions: "پوزیشن‌های باز",
  noPositions: "پوزیشن بازی وجود ندارد",
  close: "بستن",
  ticket: "تیکت",
  type: "نوع",
  volume: "حجم",
  sl: "حد ضرر",
  tp: "حد سود",
  profit: "سود",
  moneyManagement: "مدیریت سرمایه",
  sizingMode: "نوع حجم",
  riskValue: "مقدار ریسک",
  orderType: "نوع سفارش",
  rr: "ریسک به ریوارد",
  riskPctBalance: "٪ موجودی",
  riskPctEquity: "٪ اکوییتی",
  riskFixedMoney: "مبلغ ثابت $",
  placementMarket: "مارکت",
  placementLimit: "لیمیت",
  placementStop: "استاپ",
  buy: "خرید",
  sell: "فروش",
  confirmTrade: "تایید معامله",
  confirm: "تایید نهایی",
  cancel: "انصراف",
  sending: "در حال ارسال...",
  calculating: "در حال محاسبه...",
  lots: "حجم",
  risk: "ریسک",
  reward: "سود احتمالی",
  entry: "ورود",
  journalTitle: "ژورنال معاملات",
  journalSearchPlaceholder: "جستجو در نماد، تیکت یا کامنت...",
  journalEmpty: "هنوز معامله بسته‌شده‌ای وجود ندارد",
  colSymbol: "نماد",
  colDirection: "جهت",
  colVolume: "حجم",
  colOpen: "ورود",
  colCloseCol: "خروج",
  colProfit: "سود",
  colClosedAt: "زمان بستن",
  comments: "کامنت‌ها",
  addComment: "افزودن کامنت...",
  save: "ذخیره",
  delete: "حذف",
  edit: "ویرایش",
  noComments: "هنوز کامنتی ثبت نشده",
  settingsTitle: "تنظیمات",
  theme: "پوسته",
  themeDark: "تیره",
  themeLight: "روشن",
  language: "زبان",
  defaultTradeSettings: "تنظیمات پیش‌فرض معامله",
  chartTimeframe: "تایم‌فریم چارت",
  toolTrend: "خط روند",
  toolRay: "خط افقی",
  toolFib: "فیبوناچی",
  grid: "گرید",
  connecting: "در حال اتصال...",
  chartSection: "چارت",
};

export type TranslationKey = keyof typeof EN;

const DICTS: Record<AppLang, Record<TranslationKey, string>> = { en: EN, fa: FA };

interface I18nContextValue {
  lang: AppLang;
  dir: "ltr" | "rtl";
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue>({ lang: "en", dir: "ltr", t: (k) => EN[k] });

export function I18nProvider({ lang, children }: { lang: AppLang; children: ReactNode }) {
  const value = useMemo<I18nContextValue>(() => {
    const dict = DICTS[lang];
    return { lang, dir: lang === "fa" ? "rtl" : "ltr", t: (key) => dict[key] };
  }, [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
