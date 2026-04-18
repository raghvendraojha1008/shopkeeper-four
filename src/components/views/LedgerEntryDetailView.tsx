/**
 * LedgerEntryDetailView — Beautiful receipt-style detail card for orders
 * Full-width slide-up panel with:
 *  - Receipt design with firm header & colored top bar
 *  - All item rows, quantities, rates, GST
 *  - Vehicle/transport info
 *  - Download (PDF/Excel), Edit, Back actions
 *  - WhatsApp share
 */

import React, { useState, useMemo } from 'react';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import {
  ArrowLeft, Edit2, Download, Share2, MessageCircle,
  Package, Truck, Hash, Calendar, User, MapPin,
  FileText, Loader2, ChevronDown, ChevronUp, Printer,
  CheckCircle2, AlertCircle, IndianRupee, BadgePercent,
} from 'lucide-react';
import { exportService } from '../../services/export';
import { nativePdfService } from '../../services/nativePdfService';
import { buildInvoiceSummary, amountInWords, fmtINR } from '../../utils/gstUtils';
import UpiQrInvoice from '../common/UpiQrInvoice';
import { useUI } from '../../context/UIContext';
import ExportFormatModal from '../common/ExportFormatModal';

interface LedgerEntryDetailViewProps {
  entry      : any;
  settings   : any;
  parties?   : any[];
  onBack     : () => void;
  onEdit     : (entry: any) => void;
}

const LedgerEntryDetailView: React.FC<LedgerEntryDetailViewProps> = ({
  entry, settings, parties = [], onBack, onEdit,
}) => {
  const { showToast } = useUI();
  const [loading, setLoading]           = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showItems, setShowItems]       = useState(true);

  const isSale      = entry.type === 'sell';
  const party       = parties.find(p => p.name === entry.party_name) || {};
  const gstEnabled  = settings?.automation?.auto_calculate_gst !== false;
  const isInterstate= (settings?.profile?.gstin || '').substring(0,2) !== (party?.gstin || '').substring(0,2) && !!party?.gstin;

  const items  = entry.items || [];
  const rent   = Number(entry.vehicle_rent) || 0;
  const disc   = Number(entry.discount_amount) || 0;
  const total  = Number(entry.total_amount) || 0;
  const itemTotal = total - rent;

  const gstSummary = useMemo(() => {
    if (!gstEnabled || items.length === 0) return null;
    return buildInvoiceSummary(items.map((i: any) => ({
      itemName  : i.item_name,
      quantity  : Number(i.quantity) || 1,
      rate      : Number(i.rate) || 0,
      unit      : i.unit || 'Pcs',
      gstPercent: Number(i.gst_percent) || 0,
      priceType : 'exclusive' as const,
    })), isInterstate);
  }, [items, gstEnabled, isInterstate]);

  const accentColor  = isSale ? '#34d399' : '#f87171';
  const accentBg     = isSale ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.08)';
  const accentBorder = isSale ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.22)';

  const fmtDate = (d: any) => {
    try {
      const dt = d?.toDate ? d.toDate() : new Date(d || 0);
      return dt.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return String(d || ''); }
  };

  // ── PDF generation ────────────────────────────────────────────────────────
  const generatePDF = async () => {
    // ── Read invoice template settings ──────────────────────────────────────
    const tpl = {
      id: 'classic',
      theme_color: '#1e3a8a',
      show_logo: true,
      show_signature: true,
      show_bank_details: true,
      show_gstin: true,
      show_vehicle: false,
      show_terms: true,
      show_qr: false,
      terms_text: 'Goods once sold will not be taken back.',
      bank_details: '',
      authorized_signatory: 'Authorized Signatory',
      header_style: 'filled' as const,
      font_size: 'medium' as const,
      invoice_title: 'TAX INVOICE',
      logo_base64: '',
      ...(settings?.invoice_template || {}),
    };

    // Font size mapping from template settings
    const FS = tpl.font_size === 'small' ? { h1: 12, h2: 10, body: 7, tiny: 6 }
             : tpl.font_size === 'large' ? { h1: 16, h2: 13, body: 10, tiny: 8 }
             : /* medium */                 { h1: 14, h2: 11, body: 9, tiny: 7 };

    // Font family from template (jsPDF built-ins: 'helvetica', 'times', 'courier')
    const fontFamily: string = (tpl as any).font_family || 'helvetica';

    // Parse theme color to RGB
    const hexToRgb = (hex: string): [number, number, number] => {
      const h = hex.replace('#', '');
      return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
    };
    const themeRgb = hexToRgb(tpl.theme_color);

    // Currency formatter for PDF — use "Rs." instead of "₹" (jsPDF built-in fonts lack ₹ glyph)
    const pdfCurrency = (n: number): string => {
      const abs = Math.abs(n);
      const [intPart, decPart] = abs.toFixed(2).split('.');
      let formatted = '';
      if (intPart.length <= 3) {
        formatted = intPart;
      } else {
        formatted = intPart.slice(-3);
        let rest = intPart.slice(0, -3);
        while (rest.length > 2) {
          formatted = rest.slice(-2) + ',' + formatted;
          rest = rest.slice(0, -2);
        }
        if (rest.length > 0) formatted = rest + ',' + formatted;
      }
      return `${n < 0 ? '-' : ''}Rs.${formatted}.${decPart}`;
    };

    const { jsPDF } = await import('jspdf');
    const autoTableModule = await import('jspdf-autotable');
    const autoTable = (autoTableModule as any).default || autoTableModule;
    const doc = new jsPDF();
    const PW = doc.internal.pageSize.width;
    const PH = doc.internal.pageSize.height;
    const margin = 14;
    const contentW = PW - margin * 2;

    const firmName = settings?.profile?.firm_name || 'Business';
    let y = 0;

    // ── HEADER ──────────────────────────────────────────────────────────────
    if (tpl.header_style === 'filled') {
      doc.setFillColor(...themeRgb);
      doc.rect(0, 0, PW, 24, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(FS.h1);
      doc.setFont(fontFamily, 'bold');
      doc.text(tpl.invoice_title, PW / 2, 15, { align: 'center' });
      y = 30;
    } else if (tpl.header_style === 'outline') {
      doc.setDrawColor(...themeRgb);
      doc.setLineWidth(1);
      doc.rect(margin, 6, contentW, 18);
      doc.setTextColor(...themeRgb);
      doc.setFontSize(FS.h1);
      doc.setFont(fontFamily, 'bold');
      doc.text(tpl.invoice_title, PW / 2, 18, { align: 'center' });
      y = 30;
    } else {
      // minimal
      doc.setTextColor(...themeRgb);
      doc.setFontSize(FS.h1);
      doc.setFont(fontFamily, 'bold');
      doc.text(tpl.invoice_title, margin, 14);
      y = 20;
    }

    // ── LOGO ────────────────────────────────────────────────────────────────
    if (tpl.show_logo && tpl.logo_base64) {
      try {
        doc.addImage(tpl.logo_base64, 'PNG', margin, y, 20, 20);
        // Firm name next to logo
        doc.setTextColor(30, 40, 60);
        doc.setFontSize(FS.h2 + 2);
        doc.setFont(fontFamily, 'bold');
        doc.text(firmName, margin + 24, y + 8);
        doc.setFontSize(FS.tiny);
        doc.setFont(fontFamily, 'normal');
        doc.setTextColor(100, 100, 100);
        if (settings?.profile?.address) doc.text(settings.profile.address, margin + 24, y + 14);
        if (tpl.show_gstin && settings?.profile?.gstin) doc.text('GSTIN: ' + settings.profile.gstin, margin + 24, y + 19);
        y += 24;
      } catch (e) {
        console.error('Logo add failed:', e);
        // fallback: no logo
        doc.setTextColor(30, 40, 60);
        doc.setFontSize(FS.h2 + 2);
        doc.setFont(fontFamily, 'bold');
        doc.text(firmName, margin, y + 6);
        y += 10;
      }
    } else {
      doc.setTextColor(30, 40, 60);
      doc.setFontSize(FS.h2 + 2);
      doc.setFont(fontFamily, 'bold');
      doc.text(firmName, margin, y + 6);
      y += 8;
      doc.setFontSize(FS.tiny);
      doc.setFont(fontFamily, 'normal');
      doc.setTextColor(100, 100, 100);
      if (settings?.profile?.address) { doc.text(settings.profile.address, margin, y + 4); y += 4; }
      if (settings?.profile?.contact) { doc.text('Ph: ' + settings.profile.contact, margin, y + 4); y += 4; }
      if (tpl.show_gstin && settings?.profile?.gstin) { doc.text('GSTIN: ' + settings.profile.gstin, margin, y + 4); y += 4; }
      y += 2;
    }

    // Invoice meta (right side, at top)
    const metaY = tpl.header_style === 'minimal' ? 20 : 30;
    doc.setTextColor(30, 40, 60);
    doc.setFontSize(FS.body);
    doc.setFont(fontFamily, 'bold');
    const pdfInvoiceNo = entry.invoice_no || entry.prefixed_id || entry.bill_no || 'N/A';
    doc.text('Invoice: #' + pdfInvoiceNo, PW - margin, metaY, { align: 'right' });
    doc.text('Date: ' + (entry.date || ''), PW - margin, metaY + 5, { align: 'right' });
    doc.setFont(fontFamily, 'normal');
    doc.text('Type: ' + (isSale ? 'Sale' : 'Purchase'), PW - margin, metaY + 10, { align: 'right' });

    // ── DIVIDER ─────────────────────────────────────────────────────────────
    y += 4;
    doc.setDrawColor(200, 210, 220);
    doc.setLineWidth(0.3);
    doc.line(margin, y, PW - margin, y);
    y += 6;

    // ── PARTY BOX ───────────────────────────────────────────────────────────
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, y, contentW / 2 - 4, 22, 2, 2, 'F');
    doc.setFontSize(FS.tiny);
    doc.setFont(fontFamily, 'bold');
    doc.setTextColor(100, 100, 100);
    doc.text(isSale ? 'BILL TO' : 'FROM SUPPLIER', margin + 3, y + 5);
    doc.setFontSize(FS.body + 1);
    doc.setFont(fontFamily, 'bold');
    doc.setTextColor(30, 40, 60);
    doc.text(entry.party_name || 'N/A', margin + 3, y + 12);
    if (tpl.show_gstin && party?.gstin) {
      doc.setFontSize(FS.tiny);
      doc.setFont(fontFamily, 'normal');
      doc.setTextColor(80, 80, 80);
      doc.text('GSTIN: ' + party.gstin, margin + 3, y + 18);
    }

    // Vehicle info (right side of party box)
    if (tpl.show_vehicle && (entry.vehicle || entry.vehicle_rent)) {
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(PW / 2 + 2, y, contentW / 2 - 4, 22, 2, 2, 'F');
      doc.setFontSize(FS.tiny);
      doc.setFont(fontFamily, 'bold');
      doc.setTextColor(100, 100, 100);
      doc.text('VEHICLE INFO', PW / 2 + 5, y + 5);
      doc.setFontSize(FS.body);
      doc.setFont(fontFamily, 'normal');
      doc.setTextColor(30, 40, 60);
      if (entry.vehicle) doc.text('Vehicle: ' + entry.vehicle, PW / 2 + 5, y + 12);
      if (entry.vehicle_rent) doc.text('Rent: ' + pdfCurrency(Number(entry.vehicle_rent)), PW / 2 + 5, y + 18);
    }

    y += 28;

    // ── ITEMS TABLE ─────────────────────────────────────────────────────────
    const tableRows = items.map((i: any) => [
      i.item_name,
      String(i.quantity),
      i.unit || 'Pcs',
      pdfCurrency(Number(i.rate)),
      pdfCurrency(Number(i.quantity) * Number(i.rate)),
      i.gst_percent ? i.gst_percent + '%' : '-',
    ]);

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Item', 'Qty', 'Unit', 'Rate', 'Amount', 'GST%']],
      body: tableRows,
      headStyles: { fillColor: themeRgb, fontSize: FS.body - 1, fontStyle: 'bold', font: fontFamily, textColor: [255, 255, 255] },
      bodyStyles: { fontSize: FS.body - 1, cellPadding: 3, font: fontFamily },
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right', fontStyle: 'bold' }, 5: { halign: 'center' } },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });

    y = (doc as any).lastAutoTable.finalY + 8;

    // ── TOTALS ──────────────────────────────────────────────────────────────
    const totRow = (lbl: string, val: string, bold = false) => {
      if (y > PH - 40) { doc.addPage(); y = 20; }
      doc.setFontSize(FS.body);
      doc.setFont(fontFamily, bold ? 'bold' : 'normal');
      doc.setTextColor(bold ? 30 : 80, bold ? 40 : 80, bold ? 60 : 80);
      doc.text(lbl, PW - margin - 55, y, { align: 'left' });
      doc.text(val, PW - margin, y, { align: 'right' });
      y += 6;
    };

    totRow('Subtotal (excl. GST):', pdfCurrency(gstSummary?.subtotal ?? itemTotal));
    if (gstSummary?.totalGst && gstSummary.totalGst > 0) {
      if (!isInterstate) {
        totRow('CGST:', pdfCurrency(gstSummary.totalCgst));
        totRow('SGST:', pdfCurrency(gstSummary.totalSgst));
      } else {
        totRow('IGST:', pdfCurrency(gstSummary.totalIgst));
      }
    }
    if (rent > 0) totRow('Vehicle Rent:', pdfCurrency(rent));
    if (disc > 0) totRow('Discount:', '-' + pdfCurrency(disc));
    doc.setDrawColor(200, 210, 220);
    doc.line(PW - margin - 65, y - 2, PW - margin, y - 2);
    totRow('GRAND TOTAL:', pdfCurrency(total), true);

    // ── AMOUNT IN WORDS ─────────────────────────────────────────────────────
    y += 2;
    if (y > PH - 60) { doc.addPage(); y = 20; }
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, y, contentW, 12, 'F');
    doc.setFontSize(FS.tiny);
    doc.setFont(fontFamily, 'bold');
    doc.setTextColor(100, 100, 100);
    doc.text('Amount in Words:', margin + 3, y + 5);
    doc.setFont(fontFamily, 'italic');
    doc.setTextColor(60, 60, 60);
    doc.text(amountInWords(total), margin + 32, y + 5, { maxWidth: contentW - 35 });
    y += 16;

    // ── BANK DETAILS ────────────────────────────────────────────────────────
    if (tpl.show_bank_details && tpl.bank_details) {
      if (y > PH - 40) { doc.addPage(); y = 20; }
      doc.setFontSize(FS.tiny);
      doc.setFont(fontFamily, 'bold');
      doc.setTextColor(...themeRgb);
      doc.text('BANK DETAILS', margin, y);
      y += 4;
      doc.setFont(fontFamily, 'normal');
      doc.setTextColor(60, 60, 60);
      const bankLines = doc.splitTextToSize(tpl.bank_details, contentW / 2);
      doc.text(bankLines, margin, y);
      y += bankLines.length * 4 + 4;
    }

    // ── TERMS & CONDITIONS ──────────────────────────────────────────────────
    if (tpl.show_terms && tpl.terms_text) {
      if (y > PH - 30) { doc.addPage(); y = 20; }
      doc.setDrawColor(220, 220, 220);
      doc.line(margin, y, PW - margin, y);
      y += 4;
      doc.setFontSize(FS.tiny);
      doc.setFont(fontFamily, 'bold');
      doc.setTextColor(100, 100, 100);
      doc.text('Terms & Conditions:', margin, y);
      y += 4;
      doc.setFont(fontFamily, 'normal');
      doc.setTextColor(120, 120, 120);
      const termLines = doc.splitTextToSize(tpl.terms_text, contentW);
      doc.text(termLines, margin, y);
      y += termLines.length * 3.5 + 4;
    }

    // ── SIGNATURE ───────────────────────────────────────────────────────────
    if (tpl.show_signature && tpl.authorized_signatory) {
      const sigY = Math.max(y + 10, PH - 30);
      if (sigY > PH - 10) { doc.addPage(); }
      const finalSigY = sigY > PH - 10 ? 40 : sigY;
      doc.setDrawColor(180, 180, 180);
      doc.line(PW - margin - 50, finalSigY, PW - margin, finalSigY);
      doc.setFontSize(FS.tiny);
      doc.setFont(fontFamily, 'normal');
      doc.setTextColor(80, 80, 80);
      doc.text(tpl.authorized_signatory, PW - margin - 25, finalSigY + 5, { align: 'center' });
      doc.text('Authorized Signatory', PW - margin - 25, finalSigY + 10, { align: 'center' });
    }

    // ── FOOTER ──────────────────────────────────────────────────────────────
    const footY = PH - 10;
    doc.setFontSize(FS.tiny);
    doc.setFont(fontFamily, 'normal');
    doc.setTextColor(150, 150, 150);
    doc.text('Thank you for your business!', PW / 2, footY, { align: 'center' });

    // ── SAVE ────────────────────────────────────────────────────────────────
    const nativeData = nativePdfService.entryToSections(entry, settings, {
      isSale, items, gstSummary, isInterstate, party, rent, disc, total, itemTotal,
    });
    const fallbackBlob = doc.output('blob');
    const success = await nativePdfService.generateAndShare(nativeData, fallbackBlob);
    if (success) {
      showToast('PDF shared successfully!', 'success');
    } else {
      showToast('Failed to share PDF', 'error');
    }
  };

  // ── Excel/CSV generation ───────────────────────────────────────────────────
  const generateExcel = async () => {
    const rows: string[][] = [];
    const firm = settings?.profile?.firm_name || 'Business';
    rows.push([firm]);
    rows.push([isSale ? 'TAX INVOICE' : 'PURCHASE ORDER']);
    rows.push([]);
    rows.push(['Invoice No', entry.invoice_no || entry.prefixed_id || '-', 'Date', entry.date]);
    rows.push(['Party', entry.party_name || '-', 'Type', isSale?'Sale':'Purchase']);
    if (party?.gstin) rows.push(['Party GSTIN', party.gstin, 'Our GSTIN', settings?.profile?.gstin||'-']);
    rows.push([]);
    rows.push(['Item Name','Qty','Unit','Rate','Amount','GST%','GST Amount']);
    items.forEach((i: any) => {
      const amt = Number(i.quantity)*Number(i.rate);
      const gst = amt * (Number(i.gst_percent)||0) / 100;
      rows.push([i.item_name, i.quantity, i.unit||'Pcs', i.rate, amt.toFixed(2), `${i.gst_percent||0}%`, gst.toFixed(2)]);
    });
    rows.push([]);
    if (gstSummary) {
      rows.push(['Subtotal (Taxable)', gstSummary.subtotal.toFixed(2)]);
      if (!isInterstate) {
        rows.push(['CGST', gstSummary.totalCgst.toFixed(2)]);
        rows.push(['SGST', gstSummary.totalSgst.toFixed(2)]);
      } else {
        rows.push(['IGST', gstSummary.totalIgst.toFixed(2)]);
      }
    }
    if (rent > 0) rows.push(['Vehicle Rent', rent.toFixed(2)]);
    if (disc > 0) rows.push(['Discount', `-${disc.toFixed(2)}`]);
    rows.push(['GRAND TOTAL', total.toFixed(2)]);
    rows.push([]);
    rows.push(['Amount in Words', amountInWords(total)]);
    if (entry.notes) rows.push(['Notes', entry.notes]);

    const csv = rows.map(r => r.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const invoiceNo = entry.invoice_no || entry.prefixed_id || 'entry';
    const csvBlob = new Blob([csv], { type: 'text/csv' });
    await exportService.sharePdfBlob(csvBlob, `${isSale?'Invoice':'Purchase'}_${invoiceNo}.csv`);
    showToast('Excel/CSV exported!', 'success');
  };

  const handleExport = async (format: 'pdf' | 'excel') => {
    setLoading(true);
    setShowExportModal(false);
    try { format === 'pdf' ? await generatePDF() : await generateExcel(); }
    catch (e: any) { console.error('Export error:', e); showToast('Export failed: ' + (e?.message || 'Unknown error'), 'error'); }
    finally { setLoading(false); }
  };

  const handleWhatsApp = async () => {
    const msg =
`*${isSale ? 'Invoice' : 'Purchase Order'}*
*${settings?.profile?.firm_name || 'Business'}*
Invoice: #${entry.invoice_no || entry.prefixed_id || '-'}
Date: ${entry.date}
Party: ${entry.party_name}
Items: ${items.map((i:any)=>`${i.item_name} ×${i.quantity}`).join(', ')}
*Total: ₹${Math.round(total).toLocaleString('en-IN')}*
${entry.notes ? `Notes: ${entry.notes}` : ''}`;
    if (Capacitor.isNativePlatform()) {
      // Android WebView blocks window.open for external URLs
      // Use Share plugin which routes through the OS share sheet
      try { await Share.share({ text: msg }); } catch (_) {}
    } else {
      window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
    }
  };

  return (
    <div className="h-full overflow-y-auto" style={{ background: '#0b0e1a' }}>
      {showExportModal && (
        <ExportFormatModal onSelect={handleExport} onClose={() => setShowExportModal(false)} />
      )}

      {/* ── Sticky header ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 px-4 pb-3"
        style={{paddingTop: 'max(16px, calc(env(safe-area-inset-top, 0px) + 8px))',  background: 'rgba(11,14,26,0.93)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex items-center justify-between">
          <button onClick={onBack}
            className="flex items-center gap-2 p-2 rounded-2xl active:scale-95 transition-all"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(148,163,184,0.7)' }}>
            <ArrowLeft size={18} />
          </button>
          <div className="text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.15em]"
              style={{ color: accentColor }}>{isSale ? 'Sale Invoice' : 'Purchase Order'}</p>
            <p className="text-sm font-black text-white">
              #{entry.invoice_no || entry.prefixed_id || entry.id?.slice(-6)}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowExportModal(true)} disabled={loading}
              className="p-2 rounded-2xl active:scale-95 transition-all"
              style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.25)', color: '#60a5fa' }}>
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
            </button>
            <button onClick={() => onEdit(entry)}
              className="p-2 rounded-2xl active:scale-95 transition-all"
              style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.25)', color: '#a78bfa' }}>
              <Edit2 size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 pt-3 pb-32 space-y-3">

        {/* ── Hero card ──────────────────────────────────────────────── */}
        <div className="rounded-[24px] overflow-hidden relative"
          style={{ background: accentBg, border: `1px solid ${accentBorder}`, backdropFilter: 'blur(20px)' }}>
          {/* Colored top band */}
          <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${accentColor}, transparent)` }} />
          <div className="absolute top-0 left-0 right-0 h-px"
            style={{ background: `linear-gradient(90deg,transparent,${accentColor}44,transparent)` }} />

          <div className="p-4 space-y-3">
            {/* Type badge + date */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase px-3 py-1.5 rounded-xl"
                style={{ background: accentBg, color: accentColor, border: `1px solid ${accentBorder}` }}>
                {isSale ? '↑ Sale' : '↓ Purchase'}
              </span>
              <div className="flex items-center gap-1.5 text-[10px]" style={{ color: 'rgba(148,163,184,0.5)' }}>
                <Calendar size={11} />
                <span className="font-bold">{fmtDate(entry.date)}</span>
              </div>
            </div>

            {/* Amount hero */}
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] mb-0.5" style={{ color: 'rgba(148,163,184,0.4)' }}>
                Grand Total
              </p>
              <p className="text-[34px] font-black leading-none tabular-nums" style={{ color: accentColor, letterSpacing: '-0.03em' }}>
                <span style={{ fontSize: '55%', opacity: 0.55 }}>₹</span>
                {Math.round(total).toLocaleString('en-IN')}
              </p>
              {gstSummary && gstSummary.totalGst > 0 && (
                <p className="text-[9px] mt-1" style={{ color: 'rgba(148,163,184,0.5)' }}>
                  incl. GST ₹{Math.round(gstSummary.totalGst).toLocaleString('en-IN')}
                </p>
              )}
            </div>

            {/* Party info */}
            <div className="rounded-[16px] p-3.5"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-[8px] font-black uppercase tracking-[0.15em] mb-1.5" style={{ color: 'rgba(148,163,184,0.4)' }}>
                {isSale ? 'Customer' : 'Supplier'}
              </p>
              <div className="flex items-center justify-between gap-2">
                <p className="font-black text-white text-sm">{entry.party_name || 'Unknown'}</p>
                {party?.gstin && (
                  <span className="text-[8px] font-mono px-2 py-0.5 rounded-lg"
                    style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' }}>
                    {party.gstin}
                  </span>
                )}
              </div>
              {party?.contact && (
                <p className="text-[10px] mt-1" style={{ color: 'rgba(148,163,184,0.5)' }}>
                  📞 {party.contact}
                </p>
              )}
              {party?.address && (
                <p className="text-[10px] mt-0.5" style={{ color: 'rgba(148,163,184,0.4)' }}>
                  📍 {party.address}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── Items table ─────────────────────────────────────────────── */}
        <div className="rounded-[20px] overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}>
          <button className="w-full flex items-center justify-between px-4 py-3.5"
            onClick={() => setShowItems(!showItems)}
            style={{ borderBottom: showItems ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
            <div className="flex items-center gap-2.5">
              <Package size={14} style={{ color: '#a78bfa' }} />
              <span className="text-sm font-black text-white">{items.length} Item{items.length !== 1 ? 's' : ''}</span>
            </div>
            {showItems ? <ChevronUp size={14} style={{ color: 'rgba(148,163,184,0.4)' }} />
                       : <ChevronDown size={14} style={{ color: 'rgba(148,163,184,0.4)' }} />}
          </button>

          {showItems && (
            <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              {items.map((i: any, idx: number) => {
                const lineAmt = Number(i.quantity) * Number(i.rate);
                const gstAmt  = lineAmt * (Number(i.gst_percent)||0) / 100;
                return (
                  <div key={idx} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-white">{i.item_name}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[10px]" style={{ color: 'rgba(148,163,184,0.5)' }}>
                            {i.quantity} {i.unit||'Pcs'} × ₹{Number(i.rate).toLocaleString('en-IN')}
                          </span>
                          {i.gst_percent > 0 && gstEnabled && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-md font-bold"
                              style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa' }}>
                              GST {i.gst_percent}%
                            </span>
                          )}
                          {i.hsn_code && (
                            <span className="text-[8px] font-mono" style={{ color: 'rgba(148,163,184,0.35)' }}>
                              HSN {i.hsn_code}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-black tabular-nums" style={{ color: '#e2e8f0' }}>
                          ₹{Math.round(lineAmt).toLocaleString('en-IN')}
                        </p>
                        {gstAmt > 0 && (
                          <p className="text-[9px]" style={{ color: 'rgba(96,165,250,0.7)' }}>
                            +₹{gstAmt.toLocaleString('en-IN', {minimumFractionDigits:2,maximumFractionDigits:2})} GST
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Totals breakdown ─────────────────────────────────────────── */}
        <div className="rounded-[20px] p-4 space-y-2"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}>
          <p className="text-[9px] font-black uppercase tracking-[0.15em] mb-2.5" style={{ color: 'rgba(148,163,184,0.4)' }}>
            Summary
          </p>

          {[
            { label: 'Item Subtotal', value: fmtINR(itemTotal), show: true },
            { label: 'Vehicle Rent', value: `+${fmtINR(rent)}`, show: rent > 0, color: '#fbbf24' },
            { label: 'Discount', value: `-${fmtINR(disc)}`, show: disc > 0, color: '#34d399' },
            ...(gstSummary && gstSummary.totalGst > 0
              ? isInterstate
                ? [{ label: 'IGST', value: fmtINR(gstSummary.totalIgst), show: true, color: '#60a5fa' }]
                : [
                    { label: 'CGST', value: fmtINR(gstSummary.totalCgst), show: true, color: '#a78bfa' },
                    { label: 'SGST', value: fmtINR(gstSummary.totalSgst), show: true, color: '#34d399' },
                  ]
              : []),
          ].filter(r => r.show).map((row, i) => (
            <div key={i} className="flex justify-between text-[11px]">
              <span style={{ color: 'rgba(148,163,184,0.6)' }}>{row.label}</span>
              <span className="font-bold tabular-nums" style={{ color: row.color || 'rgba(226,232,240,0.8)' }}>{row.value}</span>
            </div>
          ))}

          <div className="flex justify-between pt-2"
            style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <span className="text-sm font-black text-white">Grand Total</span>
            <span className="text-base font-black tabular-nums" style={{ color: accentColor }}>
              {fmtINR(total)}
            </span>
          </div>

          {/* Amount in words */}
          <div className="mt-2 px-3 py-2 rounded-[12px]"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-[8px] font-black uppercase tracking-wider mb-0.5"
              style={{ color: 'rgba(148,163,184,0.35)' }}>Amount in Words</p>
            <p className="text-[10px] italic font-medium" style={{ color: 'rgba(203,213,225,0.55)' }}>
              {amountInWords(total)}
            </p>
          </div>
        </div>

        {/* UPI QR — shown for Sales when firm has UPI ID */}
        {settings?.profile?.upi_id && entry.type === 'sell' && (
          <div className="px-1 mb-2">
            <UpiQrInvoice
              upiId={settings.profile.upi_id}
              payeeName={settings.profile?.firm_name || 'Business'}
              amount={total}
              invoiceRef={entry.invoice_no || entry.prefixed_id}
            />
          </div>
        )}

        {/* ── Meta info ────────────────────────────────────────────────── */}
        <div className="rounded-[20px] p-4 space-y-2"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          {[
            { icon: Hash,     label: 'Invoice No',  value: entry.invoice_no || entry.prefixed_id || '-' },
            { icon: Calendar, label: 'Date',         value: entry.date },
            { icon: Truck,    label: 'Vehicle',      value: entry.vehicle, show: !!entry.vehicle },
            { icon: FileText, label: 'Notes',        value: entry.notes,   show: !!entry.notes },
          ].filter(m => m.show !== false).map(({ icon: Icon, label, value }, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="p-1.5 rounded-xl flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.06)' }}>
                <Icon size={11} style={{ color: 'rgba(148,163,184,0.5)' }} />
              </div>
              <p className="text-[9px] font-bold uppercase tracking-wider w-20 flex-shrink-0"
                style={{ color: 'rgba(148,163,184,0.35)' }}>{label}</p>
              <p className="text-[11px] font-bold text-right flex-1" style={{ color: 'rgba(203,213,225,0.8)' }}>
                {value}
              </p>
            </div>
          ))}
        </div>

        {/* ── Action buttons ───────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setShowExportModal(true)} disabled={loading}
            className="flex items-center justify-center gap-2 py-3.5 rounded-[18px] font-black text-sm active:scale-95 transition-all"
            style={{ background: 'rgba(59,130,246,0.14)', border: '1px solid rgba(59,130,246,0.25)', color: '#60a5fa' }}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            Export
          </button>
          <button onClick={handleWhatsApp}
            className="flex items-center justify-center gap-2 py-3.5 rounded-[18px] font-black text-sm active:scale-95 transition-all"
            style={{ background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.25)', color: '#25d366' }}>
            <MessageCircle size={15} /> WhatsApp
          </button>
          <button onClick={() => onEdit(entry)}
            className="col-span-2 flex items-center justify-center gap-2 py-3.5 rounded-[18px] font-black text-sm active:scale-95 transition-all"
            style={{ background: 'rgba(139,92,246,0.14)', border: '1px solid rgba(139,92,246,0.25)', color: '#a78bfa' }}>
            <Edit2 size={15} /> Edit Entry
          </button>
        </div>
      </div>
    </div>
  );
};

export default LedgerEntryDetailView;






