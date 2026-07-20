/**
 * Hands a generated file to the user: on phones this opens the native share
 * sheet (Save to Files / open in Sheets / Drive, all in one place); everywhere
 * else it falls back to a plain browser download.
 */
export async function saveOrShareBlob(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: blob.type });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return; // user dismissed the sheet
      // any other failure → fall through to a plain download
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
