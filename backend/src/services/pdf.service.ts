/**
 * Certificate PDF renderer (PDFKit + QR).
 *
 * Produces an A4-landscape certificate embedding a QR code that points at the
 * public `/verify/:certificateNo` URL. Pure function over the stored docs, so
 * it can be regenerated any time without side effects.
 */
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { CertificateDoc, ReportDoc } from '../models/report.models.js';

const INK = '#111827';
const MUTED = '#6b7280';
const ACCENT = '#0f766e';

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
}

export async function renderCertificatePdf(
  cert: CertificateDoc,
  report: ReportDoc | null,
): Promise<Buffer> {
  const qr = await QRCode.toBuffer(cert.verifyUrl, { type: 'png', margin: 1, width: 240 });

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 54 });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const page = doc.page;
  const width = page.width;
  const height = page.height;

  // Frame
  doc.rect(24, 24, width - 48, height - 48).lineWidth(2).stroke(ACCENT);
  doc.rect(32, 32, width - 64, height - 64).lineWidth(0.5).stroke(MUTED);

  // Header
  doc
    .fillColor(ACCENT)
    .fontSize(13)
    .font('Helvetica-Bold')
    .text('SKILL INDIA · RECOGNITION OF PRIOR LEARNING', 60, 66, { align: 'center', width: width - 120 });

  doc
    .fillColor(INK)
    .fontSize(30)
    .font('Helvetica-Bold')
    .text('Certificate of Competency', 60, 96, { align: 'center', width: width - 120 });

  doc
    .fillColor(MUTED)
    .fontSize(11)
    .font('Helvetica')
    .text('This certifies that', 60, 150, { align: 'center', width: width - 120 });

  doc
    .fillColor(INK)
    .fontSize(26)
    .font('Helvetica-Bold')
    .text(cert.holderName, 60, 172, { align: 'center', width: width - 120 });

  doc
    .fillColor(MUTED)
    .fontSize(11)
    .font('Helvetica')
    .text(`has been assessed and recognised for the qualification`, 60, 214, {
      align: 'center',
      width: width - 120,
    });

  doc
    .fillColor(INK)
    .fontSize(16)
    .font('Helvetica-Bold')
    .text(cert.qpTitle, 60, 234, { align: 'center', width: width - 120 });

  doc
    .fillColor(ACCENT)
    .fontSize(14)
    .font('Helvetica-Bold')
    .text(`NSQF Level ${cert.nsqfLevel}`, 60, 262, { align: 'center', width: width - 120 });

  // Left: score + summary
  doc
    .fillColor(INK)
    .fontSize(12)
    .font('Helvetica-Bold')
    .text(`Overall score: ${cert.overallScore.toFixed(1)} / 100`, 70, 320);

  if (report) {
    doc.fillColor(MUTED).fontSize(10).font('Helvetica');
    const passed = report.skillsPassed.length;
    const improve = report.skillsNeedingImprovement.length;
    doc.text(`Skills met: ${passed}    ·    Needs improvement: ${improve}`, 70, 340);
    doc.text(
      `Critical safety: ${report.criticalSafetyPassed ? 'PASSED' : 'NOT MET'}`,
      70,
      355,
    );
    doc.text(`Recommendation: ${report.recommendation.replace(/_/g, ' ')}`, 70, 370);
  }

  // Right: QR + verify
  const qrX = width - 70 - 120;
  doc.image(qr, qrX, 300, { width: 120 });
  doc
    .fillColor(MUTED)
    .fontSize(8)
    .font('Helvetica')
    .text('Scan to verify', qrX, 424, { width: 120, align: 'center' });
  doc.text(cert.verifyUrl, qrX - 40, 436, { width: 200, align: 'center' });

  // Footer
  doc
    .fillColor(INK)
    .fontSize(10)
    .font('Helvetica-Bold')
    .text(`Certificate No: ${cert.certificateNo}`, 70, height - 80);
  doc
    .fillColor(MUTED)
    .fontSize(10)
    .font('Helvetica')
    .text(`Issued on: ${fmtDate(cert.issuedAt)}`, 70, height - 64);

  doc.end();
  return done;
}
