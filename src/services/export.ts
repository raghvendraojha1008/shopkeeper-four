import { Capacitor } from '@capacitor/core';

/**
 * Detect if running inside a real native Capacitor shell.
 * Avoids calling Capacitor Filesystem/Share on web where they throw.
 */
const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

/**
 * Web-only: trigger a file download via hidden anchor tag.
 */
function webDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

/**
 * Native-only helpers — lazily imported so they don't break on web.
 */
async function nativeShareBlob(blob: Blob, filename: string): Promise<void> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');

  // Convert blob → base64
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  const result = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Cache,
  });

  let fileUri = result.uri;
  if (!fileUri) {
    try {
      const uriResult = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
      fileUri = uriResult.uri;
    } catch {
      throw new Error('Could not resolve file URI');
    }
  }

  await Share.share({ title: filename, url: fileUri });
}

async function nativeShareText(content: string, filename: string): Promise<void> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');

  const result = await Filesystem.writeFile({
    path: filename,
    data: content,
    directory: Directory.Cache,
    encoding: 'utf8' as any,
  });

  let fileUri = result.uri;
  if (!fileUri) {
    try {
      const uriResult = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
      fileUri = uriResult.uri;
    } catch {
      throw new Error('Could not resolve file URI');
    }
  }

  await Share.share({ title: filename, url: fileUri });
}

export const exportService = {
  /** Convert Blob to Base64 (strips "data:..." prefix) */
  blobToBase64: (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  },

  /**
   * Cross-platform PDF/file Export & Share
   * Web: downloads file. Android: writes to cache + native share sheet.
   */
  sharePdfBlob: async (blob: Blob, filename: string): Promise<boolean> => {
    try {
      if (isNative()) {
        await nativeShareBlob(blob, filename);
      } else {
        webDownload(blob, filename);
      }
      return true;
    } catch (error) {
      console.error('❌ sharePdfBlob failed:', error);
      // Fallback: try web download even on native if share fails
      try {
        webDownload(blob, filename);
        return true;
      } catch (e2) {
        console.error('❌ Web fallback also failed:', e2);
        return false;
      }
    }
  },

  /** Save Base64 string and share/download */
  saveBase64File: async (base64: string, filename: string): Promise<void> => {
    try {
      if (isNative()) {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const { Share } = await import('@capacitor/share');
        const result = await Filesystem.writeFile({
          path: filename,
          data: base64,
          directory: Directory.Cache,
        });
        let fileUri = result.uri;
        if (!fileUri) {
          const uriResult = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
          fileUri = uriResult.uri;
        }
        await Share.share({ title: filename, url: fileUri });
      } else {
        // Web: convert base64 to blob and download
        const byteChars = atob(base64);
        const byteNumbers = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
          byteNumbers[i] = byteChars.charCodeAt(i);
        }
        const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
        webDownload(blob, filename);
      }
    } catch (error) {
      console.error('❌ saveBase64File failed:', error);
      // Fallback: try direct data URI download
      const a = document.createElement('a');
      a.href = 'data:application/pdf;base64,' + base64;
      a.download = filename;
      a.click();
    }
  },

  /** Save and open/share a base64-encoded file */
  saveAndOpenFile: async (base64: string, filename: string, _mimeType?: string): Promise<void> => {
    await exportService.saveBase64File(base64, filename);
  },

  /** Share text via WhatsApp */
  shareToWhatsApp: (text: string): void => {
    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
  },

  /** Generic share or download (text content like CSV) */
  shareOrDownload: async (content: string, filename: string, mimeType: string): Promise<void> => {
    try {
      if (isNative()) {
        await nativeShareText(content, filename);
      } else {
        const blob = new Blob([content], { type: mimeType });
        webDownload(blob, filename);
      }
    } catch (error) {
      console.error('❌ shareOrDownload failed:', error);
      const blob = new Blob([content], { type: mimeType });
      webDownload(blob, filename);
    }
  },

  /** CSV Export */
  exportToCSV: async (data: any[], headers: string[], filename: string): Promise<void> => {
    const rows = [
      headers.join(','),
      ...data.map(row => headers.map(h => {
        const val = row[h] ?? '';
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(','))
    ];
    const csvContent = rows.join('\n');
    await exportService.shareOrDownload(csvContent, filename, 'text/csv');
  }
};
