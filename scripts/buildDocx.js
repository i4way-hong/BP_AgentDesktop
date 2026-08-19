#!/usr/bin/env node
/* Convert docs/설계서_BP_AgentDesktop.md to docs/설계서_BP_AgentDesktop.docx and embed PNG diagrams. */
const fs = require('fs');
const path = require('path');
const { Document, Packer, Paragraph, HeadingLevel, TextRun, ImageRun, TableOfContents, AlignmentType, PageNumber, Header, Footer } = require('docx');

const root = path.resolve(__dirname, '..');
const mdPath = path.resolve(root, 'docs', '설계서_BP_AgentDesktop.md');
const outPath = path.resolve(root, 'docs', '설계서_BP_AgentDesktop.docx');
const diagramsDir = path.resolve(root, 'docs', 'diagrams');

function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

function loadPng(name) {
  const p = path.resolve(diagramsDir, name);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p);
}

function sectionHeading(text, level = 1) {
  const levelMap = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 };
  return new Paragraph({ text, heading: levelMap[level] || HeadingLevel.HEADING_1 });
}

function imageParagraph(buffer, alt) {
  return new Paragraph({
    children: [
      new ImageRun({ data: buffer, type: 'png', transformation: { width: 920, height: 520 }, altText: alt }),
    ],
    spacing: { after: 240 },
  });
}

function buildBodyFromMarkdown(md) {
  const lines = md.split(/\r?\n/);
  const body = [];
  for (const line of lines) {
    if (/^#\s+/.test(line)) {
      body.push(sectionHeading(line.replace(/^#\s+/, ''), 1));
    } else if (/^##\s+/.test(line)) {
      body.push(sectionHeading(line.replace(/^##\s+/, ''), 2));
    } else if (/^###\s+/.test(line)) {
      body.push(sectionHeading(line.replace(/^###\s+/, ''), 3));
    } else if (/^\s*-\s+/.test(line)) {
      body.push(new Paragraph({ text: line.replace(/^\s*-\s+/, ''), bullet: { level: 0 } }));
    } else if (/^\d+\.\s+/.test(line)) {
      body.push(new Paragraph({ text: line.replace(/^\d+\.\s+/, ''), numbering: { reference: 'numbered-list', level: 0 } }));
    } else if (line.trim() === '') {
      body.push(new Paragraph(''));
    } else if (/^```/.test(line)) {
      continue;
    } else if (/^>\s?/.test(line)) {
      body.push(
        new Paragraph({
          children: [new TextRun({ text: line.replace(/^>\s?/, ''), italics: true, color: '666666' })],
          border: { left: { color: 'cccccc', space: 1, value: 'single', size: 6 } },
          spacing: { before: 120, after: 120 },
        })
      );
    } else {
      body.push(new Paragraph(line));
    }
  }
  return body;
}

async function main() {
  console.log('[buildDocx] start');
  console.log('[buildDocx] mdPath =', mdPath);
  if (!fs.existsSync(mdPath)) {
    console.error('[buildDocx] Markdown not found:', mdPath);
    process.exit(1);
  }
  const md = readText(mdPath);

  const archPng = loadPng('architecture.png');
  const flowsPng = loadPng('flows.png');
  console.log('[buildDocx] archPng =', !!archPng, 'flowsPng =', !!flowsPng);

  const doc = new Document({
    sections: [
      {
        properties: {
          page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: 'BP_AgentDesktop 설계서', bold: true })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun('Page '), PageNumber.CURRENT] }),
            ],
          }),
        },
        children: [
          sectionHeading('Bright Pattern JS API 샘플 설계서 (BP_AgentDesktop)', 1),
          new Paragraph({ text: '문서 버전: 1.0 | 작성일: 2025-08-13', spacing: { after: 200 } }),
          sectionHeading('목차', 1),
          new TableOfContents('TOC', { hyperlink: true, headingStyleRange: '1-3' }),
          new Paragraph({ text: '', spacing: { after: 200 } }),

          // 본문 (markdown 기반 단락)
          ...buildBodyFromMarkdown(md),

          // 다이어그램 섹션 이미지 삽입
          sectionHeading('2. 시스템 구성도', 1),
          ...(archPng ? [imageParagraph(archPng, '시스템 구성도')] : [new Paragraph('architecture.png 미존재')]),
          sectionHeading('7. 이벤트/흐름 설계', 1),
          ...(flowsPng ? [imageParagraph(flowsPng, '이벤트/흐름 설계')] : [new Paragraph('flows.png 미존재')]),
        ],
      },
    ],
    numbering: {
      config: [
        {
          reference: 'numbered-list',
          levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START }],
        },
      ],
    },
  });

  console.log('[buildDocx] generating buffer...');
  const buffer = await Packer.toBuffer(doc);
  console.log('[buildDocx] writing file...');
  fs.writeFileSync(outPath, buffer);
  console.log('Wrote', outPath);
}

main().catch((e) => {
  console.error('[buildDocx] error:', e);
  process.exit(1);
});
