/**
 * Utilitas untuk download file Blob di browser
 */
export function downloadBlobFile(
  content,
  filename,
  mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

