import jsPDF from 'jspdf';
import { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Packer, BorderStyle } from 'docx';
import { saveAs } from 'file-saver';

interface Resume {
  id: string;
  title: string;
  content: string;
  ats_score: number;
}

export type ATSTemplate = 'classic' | 'modern' | 'minimal';

// Classic ATS Template - Traditional format with clear sections
const exportClassicPDF = (resume: Resume) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxWidth = pageWidth - (2 * margin);
  let yPosition = margin;

  const lines = resume.content.split('\n');
  doc.setFont('helvetica');
  
  lines.forEach((line) => {
    if (yPosition > pageHeight - margin) {
      doc.addPage();
      yPosition = margin;
    }

    if (line.match(/^[A-Z\s]+$/) && line.trim().length > 0 && line.trim().length < 30) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      yPosition += 5;
    } else if (line.includes('|') && !line.startsWith('•')) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
    } else if (line.startsWith('•')) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
    } else {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
    }

    if (!line.trim()) {
      yPosition += 5;
      return;
    }

    const splitLines = doc.splitTextToSize(line, maxWidth);
    splitLines.forEach((splitLine: string) => {
      if (yPosition > pageHeight - margin) {
        doc.addPage();
        yPosition = margin;
      }
      doc.text(splitLine, margin, yPosition);
      yPosition += 6;
    });
  });

  doc.save(`${resume.title.replace(/[^a-z0-9]/gi, '_')}_classic.pdf`);
};

// Modern ATS Template - Clean with subtle styling
const exportModernPDF = (resume: Resume) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const maxWidth = pageWidth - (2 * margin);
  let yPosition = margin;

  const lines = resume.content.split('\n');
  doc.setFont('helvetica');
  
  lines.forEach((line) => {
    if (yPosition > pageHeight - margin) {
      doc.addPage();
      yPosition = margin;
    }

    if (line.match(/^[A-Z\s]+$/) && line.trim().length > 0 && line.trim().length < 30) {
      // Section headers with underline
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(40, 40, 40);
      const text = line.trim();
      doc.text(text, margin, yPosition);
      doc.setLineWidth(0.5);
      doc.line(margin, yPosition + 2, margin + doc.getTextWidth(text), yPosition + 2);
      yPosition += 8;
      return;
    } else if (line.includes('|') && !line.startsWith('•')) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(20, 20, 20);
    } else if (line.startsWith('•')) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
    } else {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
    }

    if (!line.trim()) {
      yPosition += 4;
      return;
    }

    const splitLines = doc.splitTextToSize(line, maxWidth);
    splitLines.forEach((splitLine: string) => {
      if (yPosition > pageHeight - margin) {
        doc.addPage();
        yPosition = margin;
      }
      doc.text(splitLine, margin, yPosition);
      yPosition += 5.5;
    });
  });

  doc.save(`${resume.title.replace(/[^a-z0-9]/gi, '_')}_modern.pdf`);
};

// Minimal ATS Template - Ultra-clean, compact format
const exportMinimalPDF = (resume: Resume) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const maxWidth = pageWidth - (2 * margin);
  let yPosition = margin;

  const lines = resume.content.split('\n');
  doc.setFont('helvetica');
  
  lines.forEach((line) => {
    if (yPosition > pageHeight - margin) {
      doc.addPage();
      yPosition = margin;
    }

    if (line.match(/^[A-Z\s]+$/) && line.trim().length > 0 && line.trim().length < 30) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      yPosition += 3;
    } else if (line.includes('|') && !line.startsWith('•')) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 30, 30);
    } else if (line.startsWith('•')) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(50, 50, 50);
    } else {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(50, 50, 50);
    }

    if (!line.trim()) {
      yPosition += 3;
      return;
    }

    const splitLines = doc.splitTextToSize(line, maxWidth);
    splitLines.forEach((splitLine: string) => {
      if (yPosition > pageHeight - margin) {
        doc.addPage();
        yPosition = margin;
      }
      doc.text(splitLine, margin, yPosition);
      yPosition += 5;
    });
  });

  doc.save(`${resume.title.replace(/[^a-z0-9]/gi, '_')}_minimal.pdf`);
};

// DOCX Templates
const exportClassicDOCX = async (resume: Resume) => {
  const lines = resume.content.split('\n');
  const paragraphs: Paragraph[] = [];

  lines.forEach((line) => {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      paragraphs.push(new Paragraph({ text: '' }));
      return;
    }

    if (line.match(/^[A-Z\s]+$/) && trimmedLine.length < 30) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: trimmedLine,
              bold: true,
              size: 24,
            }),
          ],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240, after: 120 },
        })
      );
    } else if (line.includes('|') && !line.startsWith('•')) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: trimmedLine,
              bold: true,
              size: 22,
            }),
          ],
          spacing: { before: 120, after: 60 },
        })
      );
    } else if (line.startsWith('•')) {
      paragraphs.push(
        new Paragraph({
          text: trimmedLine.substring(1).trim(),
          bullet: { level: 0 },
          spacing: { before: 60, after: 60 },
        })
      );
    } else if (line.startsWith('[') && line.endsWith(']')) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: trimmedLine.replace(/[\[\]]/g, ''),
              bold: true,
              size: 32,
            }),
          ],
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
        })
      );
    } else {
      paragraphs.push(
        new Paragraph({
          text: trimmedLine,
          spacing: { before: 60, after: 60 },
        })
      );
    }
  });

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 720, right: 720, bottom: 720, left: 720 },
        },
      },
      children: paragraphs,
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${resume.title.replace(/[^a-z0-9]/gi, '_')}_classic.docx`);
};

const exportModernDOCX = async (resume: Resume) => {
  const lines = resume.content.split('\n');
  const paragraphs: Paragraph[] = [];

  lines.forEach((line) => {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      paragraphs.push(new Paragraph({ text: '', spacing: { before: 80 } }));
      return;
    }

    if (line.match(/^[A-Z\s]+$/) && trimmedLine.length < 30) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: trimmedLine,
              bold: true,
              size: 22,
            }),
          ],
          border: {
            bottom: {
              color: "808080",
              space: 1,
              style: BorderStyle.SINGLE,
              size: 6,
            },
          },
          spacing: { before: 200, after: 100 },
        })
      );
    } else if (line.includes('|') && !line.startsWith('•')) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: trimmedLine,
              bold: true,
              size: 20,
            }),
          ],
          spacing: { before: 100, after: 50 },
        })
      );
    } else if (line.startsWith('•')) {
      paragraphs.push(
        new Paragraph({
          text: trimmedLine.substring(1).trim(),
          bullet: { level: 0 },
          spacing: { before: 50, after: 50 },
        })
      );
    } else if (line.startsWith('[') && line.endsWith(']')) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: trimmedLine.replace(/[\[\]]/g, ''),
              bold: true,
              size: 30,
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 150 },
        })
      );
    } else {
      paragraphs.push(
        new Paragraph({
          text: trimmedLine,
          spacing: { before: 50, after: 50 },
        })
      );
    }
  });

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 650, right: 650, bottom: 650, left: 650 },
        },
      },
      children: paragraphs,
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${resume.title.replace(/[^a-z0-9]/gi, '_')}_modern.docx`);
};

const exportMinimalDOCX = async (resume: Resume) => {
  const lines = resume.content.split('\n');
  const paragraphs: Paragraph[] = [];

  lines.forEach((line) => {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      paragraphs.push(new Paragraph({ text: '', spacing: { before: 60 } }));
      return;
    }

    if (line.match(/^[A-Z\s]+$/) && trimmedLine.length < 30) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: trimmedLine,
              bold: true,
              size: 22,
            }),
          ],
          spacing: { before: 180, after: 80 },
        })
      );
    } else if (line.includes('|') && !line.startsWith('•')) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: trimmedLine,
              bold: true,
              size: 20,
            }),
          ],
          spacing: { before: 90, after: 45 },
        })
      );
    } else if (line.startsWith('•')) {
      paragraphs.push(
        new Paragraph({
          text: trimmedLine.substring(1).trim(),
          bullet: { level: 0 },
          spacing: { before: 40, after: 40 },
        })
      );
    } else if (line.startsWith('[') && line.endsWith(']')) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: trimmedLine.replace(/[\[\]]/g, ''),
              bold: true,
              size: 28,
            }),
          ],
          alignment: AlignmentType.LEFT,
          spacing: { after: 120 },
        })
      );
    } else {
      paragraphs.push(
        new Paragraph({
          text: trimmedLine,
          spacing: { before: 45, after: 45 },
        })
      );
    }
  });

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 700, right: 700, bottom: 700, left: 700 },
        },
      },
      children: paragraphs,
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${resume.title.replace(/[^a-z0-9]/gi, '_')}_minimal.docx`);
};

export const exportResumeWithTemplate = (
  resume: Resume,
  template: ATSTemplate,
  format: 'pdf' | 'docx'
) => {
  if (format === 'pdf') {
    switch (template) {
      case 'classic':
        exportClassicPDF(resume);
        break;
      case 'modern':
        exportModernPDF(resume);
        break;
      case 'minimal':
        exportMinimalPDF(resume);
        break;
    }
  } else {
    switch (template) {
      case 'classic':
        exportClassicDOCX(resume);
        break;
      case 'modern':
        exportModernDOCX(resume);
        break;
      case 'minimal':
        exportMinimalDOCX(resume);
        break;
    }
  }
};
