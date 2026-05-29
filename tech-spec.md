# Tech Spec — Roznamcha (Shop Daily Journal)

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| react | ^18.3.0 | UI framework |
| react-dom | ^18.3.0 | DOM renderer |
| react-router-dom | ^6.26.0 | Client-side routing (page navigation) |
| jotai | ^2.9.0 | Lightweight state management |
| lucide-react | ^0.400.0 | Icons (sidebar, header, cards, table) |
| date-fns | ^3.6.0 | Date formatting (Urdu locale) |

## Component Inventory

### Layout Components

| Component | Source | Notes |
|-----------|--------|-------|
| Sidebar | Custom | Collapsible nav, 240px/64px width, dark navy theme. Contains: LogoArea, NavMenu, DateWidget. |
| HeaderBar | Custom | Top bar: hamburger, search, notifications bell (badge), user profile. |
| AppLayout | Custom | Wraps Sidebar + main content area. Manages collapse state via Jotai atom. |

### Page Components (Routes)

| Component | Route | Description |
|-----------|-------|-------------|
| DashboardPage | `/dashboard` | Overview with charts (placeholder for now). |
| DailyEntryPage | `/daily-entry` | Daily transaction entry form. |
| RoznamchaPage | `/roznamcha` | **Main page** — journal register with summary cards + transaction table. |
| CustomersPage | `/customers` | Customer list placeholder. |
| ExpensesPage | `/expenses` | Expense tracking placeholder. |
| ReportsPage | `/reports` | Financial reports placeholder. |
| PaymentsPage | `/payments` | Payment records placeholder. |
| SettingsPage | `/settings` | System settings placeholder. |
| UsersPage | `/users` | User management placeholder. |
| BackupPage | `/backup` | Data backup/restore placeholder. |

### Reusable Components

| Component | Source | Used By | Notes |
|-----------|--------|---------|-------|
| SummaryCard | Custom | RoznamchaPage | 4 variants (blue, green, gold, white) with icon + label + value. |
| TransactionTable | Custom | RoznamchaPage | Full table: header + body rows + footer totals. |
| EntryFormModal | Custom | RoznamchaPage, DailyEntryPage | Modal form for add/edit journal entries. |
| DatePickerButton | Custom | RoznamchaPage | Styled button showing selected date + calendar icon. |
| NavMenuItem | Custom | Sidebar | Single nav item with icon, label, active state, link. |

## Animation Implementation Plan

| Animation | Library | Implementation Approach | Complexity |
|-----------|---------|------------------------|------------|
| Sidebar collapse/expand | CSS transition | `transition: width 300ms ease` on sidebar container; `opacity 0` on labels when collapsed. Jotai atom drives collapsed state. | Low |
| Card hover lift | CSS transition | `transition: transform 200ms ease, box-shadow 200ms ease`; `translateY(-2px)` + enhanced shadow on hover. | Low |
| Table row hover | CSS transition | `transition: background-color 150ms`; change to `#FAFAFA` on hover. | Low |
| Menu item hover | CSS transition | `transition: background-color 150ms`; `rgba(255,255,255,0.08)` on hover. | Low |
| Modal open/close | CSS transition | `opacity` + `transform: scale(0.95)` transitions. Conditional rendering with 200ms fade. | Low |

No complex animations (no scroll-triggered effects, no page transitions, no 3D). All animations are simple CSS transitions on hover/state change.

## State & Logic Plan

### Data Flow Architecture

```
Jotai Atoms (Global State)
├── sidebarCollapsedAtom: boolean
├── entriesAtom: JournalEntry[]
├── selectedDateAtom: Date
└── activeMenuAtom: string

IndexedDB (Persistent Storage)
├── "roznamcha" store
│   └── JournalEntry objects with auto-increment IDs
│
└── Operations: add, update, delete, getAll, getByDate
```

### IndexedDB Schema

```typescript
interface JournalEntry {
  id?: number;              // auto-increment
  serialNo: number;         // display serial number
  name: string;             // customer name (Urdu)
  mobileNumber: string;     // phone number
  cashAmount: number;       // نقد رقم
  payment: number;          // ادائیگی (outgoing)
  receipt: number;          // وصولی (incoming)
  balance: number;          // باقیہ
  remainingAmount: number;  // بقیہ رقم
  previousBalance: number;  // جمع اچهلی رقم
  note: string;             // نوٹ
  date: string;             // ISO date string (YYYY-MM-DD)
  createdAt: number;        // timestamp
}
```

### Key Logic Patterns

**1. IndexedDB Layer (`src/db/indexedDB.ts`)**
- Open DB with version 1, create "roznamcha" object store with auto-increment key
- Promise-based API wrapper around IndexedDB
- Methods: `initDB()`, `addEntry()`, `updateEntry()`, `deleteEntry()`, `getAllEntries()`, `getEntriesByDate()`
- DB name: `RoznamchaDB`, Store name: `entries`

**2. State Management**
- `entriesAtom`: holds all entries for selected date
- `selectedDateAtom`: current filter date (default: today)
- On date change → fetch entries for that date from IndexedDB → update entriesAtom
- On entry CRUD → update IndexedDB → refetch entries → update entriesAtom

**3. Summary Calculations (derived/hooked)**
- Total Receipts (وصولی): sum of all `receipt` values
- Total Payments (ادائیگی): sum of all `payment` values
- Net Balance (بقایا): `totalReceipts - totalPayments`
- Total Entries: count of non-empty entries
- Computed from entriesAtom via useMemo

**4. Serial Number Assignment**
- Serial numbers are per-date (01, 02, 03...)
- On new entry: find max serialNo for current date + 1
- On delete: renumber remaining entries to maintain sequence

**5. Date Filtering**
- `getEntriesByDate(date)` query from IndexedDB
- Date stored as ISO string `YYYY-MM-DD` on each entry
- Urdu date display via `date-fns` with Urdu locale or manual formatting

### Routing

| Route | Page Component |
|-------|---------------|
| `/` | Redirect to `/dashboard` |
| `/dashboard` | DashboardPage |
| `/daily-entry` | DailyEntryPage |
| `/roznamcha` | RoznamchaPage |
| `/customers` | CustomersPage |
| `/expenses` | ExpensesPage |
| `/reports` | ReportsPage |
| `/payments` | PaymentsPage |
| `/settings` | SettingsPage |
| `/users` | UsersPage |
| `/backup` | BackupPage |

## Other Key Decisions

- **Plain CSS (not Tailwind):** As requested by user. Use CSS modules (`.module.css`) or plain `.css` files per component. Global styles in `src/styles/global.css`. CSS variables for design tokens.
- **RTL Support:** Set `dir="rtl"` on `<html>` element. CSS logical properties (`margin-inline-start`, `padding-inline-end`, etc.) for layout. Sidebar stays on left (logical start in RTL).
- **Urdu Font:** Load `Noto Nastaliq Urdu` from Google Fonts. Fallback to system nastaliq fonts. Numbers use `Inter` or system sans-serif.
- **No shadcn/ui:** Using plain CSS per user request, so no Tailwind/shadcn components.
- **Print:** `@media print` stylesheet hides sidebar, header, buttons. Shows clean table layout.
- **Demo Data:** On first load (empty DB), seed 2 sample entries for today's date so the table is not completely empty.
