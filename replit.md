# Shopkeeper V2

A mobile-first ledger and inventory management application for small business owners.

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS 4
- **State Management:** TanStack Query v5, React Router v7
- **Backend/BaaS:** Firebase 12 (Firestore + Auth)
- **Mobile:** Capacitor 8 (Android/iOS)
- **AI:** Google Generative AI (Gemini)
- **Charts:** Recharts
- **Icons:** Lucide React

## Project Structure

- `src/` - Core React application
  - `components/` - UI components (auth, cards, charts, layout, modals, views, widgets)
  - `context/` - Global state providers (Auth, Data, Role, UI)
  - `services/` - API logic, Firebase config, utility services
  - `hooks/` - Custom hooks (offline sync, pagination, UI)
  - `types/` - TypeScript interfaces
  - `utils/` - Utility helpers (paymentDistribution, helpers, etc.)
- `android/` & `ios/` - Capacitor native project folders
- `pdf-generator/` - Custom Capacitor plugin for native PDF generation
- `public/` - Static assets, PWA icons

## Development

```bash
npm install --legacy-peer-deps
npm run dev
```

The dev server runs on port 5000 (http://0.0.0.0:5000).

## Recent Changes

- **Payment Status in Ledger List:** Each ledger/order card now shows a Paid / Partially Paid / Pending tag with icon, plus individual paid and pending amounts. The summary card shows total paid and total pending across filtered entries.
- **Conditional Balance/Pending label in Order Form:** The linked-payments section in OrderForm now shows "Pending" (amber, AlertCircle) when the paid amount is less than the order total, and "Balance" (green, CheckCircle2) when equal or overpaid.
- **Linked Order Preview in Payment Form:** Selecting an order in the "Linked Invoice / Bill" field of the TransactionForm now renders an attached order preview card showing invoice#, date, party, items, type, and total.
- **Auto Payment Distribution (FIFO):** New utility `src/utils/paymentDistribution.ts` distributes unlinked party payments to orders chronologically (oldest first), per party+type group. Directly linked payments (by bill_no) are applied first. Toggle in Settings > General > "Auto Payment Distribution" (on by default via `automation.auto_distribute_payments`).
- **bill_no mapping:** When a user selects a linked invoice in the payment form, the invoice number is automatically extracted and stored as `bill_no` on the transaction record, enabling proper matching.
- **Invoice font customization:** `generateInvoice` in `professionalInvoice.ts` accepts optional 4th `templateOpts` `{ fontFamily, baseFontSize }`.
- **7-day backup CSVs:** `autoBackup.ts` now generates `parties_<date>.csv`, `ledger_<date>.csv`, and `transactions_<date>.csv` alongside the JSON backup.
- **Dynamic bottom nav:** `preferences.dynamic_nav` toggle in Settings > General.
- **Onboarding skip:** Skips onboarding if `settings.profile.firm_name` already exists in Firestore.
- **Contact picker fix:** Separate `_permissionDenied` flag prevents permanently caching an empty list.
- **WasteView modal:** Solid background + backdrop blur.
- **CSV exports (LedgerView/ReportsView):** Flat row-per-line-item format.

## Notes

- Uses `--legacy-peer-deps` due to peer dependency conflict with `@capacitor-community/barcode-scanner` (requires Capacitor 5 core but project uses Capacitor 8)
- Firebase config is required via environment variables for the app to function
- Uses HashRouter for Capacitor compatibility
