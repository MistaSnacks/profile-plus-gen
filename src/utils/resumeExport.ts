import jsPDF from 'jspdf';
import { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Packer } from 'docx';
import { saveAs } from 'file-saver';

interface Resume {
  id: string;
  title: string;
  content: string;
  ats_score: number;
}

export const exportToPDF = (resume: Resume) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxWidth = pageWidth - (2 * margin);
  let yPosition = margin;

  // Split content into lines
  const lines = resume.content.split('\n');
  
  doc.setFont('helvetica');
  
  lines.forEach((line) => {
    // Check if we need a new page
    if (yPosition > pageHeight - margin) {
      doc.addPage();
      yPosition = margin;
    }

    // Handle different text styles
    if (line.match(/^[A-Z\s]+$/) && line.trim().length > 0 && line.trim().length < 30) {
      // Section header (all caps, short)
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      yPosition += 5; // Extra space before header
    } else if (line.includes('|') && !line.startsWith('•')) {
      // Job title/company line or contact info
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
    } else if (line.startsWith('•')) {
      // Bullet point
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
    } else {
      // Regular text
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
    }

    // Handle empty lines
    if (!line.trim()) {
      yPosition += 5;
      return;
    }

    // Split long lines
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

  doc.save(`${resume.title.replace(/[^a-z0-9]/gi, '_')}.pdf`);
};

export const exportToDOCX = async (resume: Resume) => {
  const lines = resume.content.split('\n');
  const paragraphs: Paragraph[] = [];

  let currentSection: string = '';

  lines.forEach((line) => {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      // Empty line
      paragraphs.push(new Paragraph({ text: '' }));
      return;
    }

    // Check if it's a section header (all caps, short)
    if (line.match(/^[A-Z\s]+$/) && trimmedLine.length < 30) {
      currentSection = trimmedLine;
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
      // Job title/company or contact info
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
      // Bullet point
      paragraphs.push(
        new Paragraph({
          text: trimmedLine.substring(1).trim(),
          bullet: { level: 0 },
          spacing: { before: 60, after: 60 },
        })
      );
    } else if (line.startsWith('[') && line.endsWith(']')) {
      // Name at the top
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
      // Regular text
      paragraphs.push(
        new Paragraph({
          text: trimmedLine,
          spacing: { before: 60, after: 60 },
        })
      );
    }
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720,
              right: 720,
              bottom: 720,
              left: 720,
            },
          },
        },
        children: paragraphs,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${resume.title.replace(/[^a-z0-9]/gi, '_')}.docx`);
};
