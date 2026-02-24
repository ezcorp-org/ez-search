/**
 * Generate simple test images for the accuracy corpus.
 *
 * Creates minimal valid PNGs using raw pixel data and the PNG format.
 * No external image library dependencies — uses Node's built-in zlib for deflate.
 */

import { writeFileSync } from 'fs';
import { deflateSync } from 'zlib';
import * as path from 'path';

const IMAGE_DIR = path.join(import.meta.dir, 'corpus', 'image');

// ── PNG encoder (minimal, no deps) ──────────────────────────────────────────

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, data.length);

  const combined = new Uint8Array(typeBytes.length + data.length);
  combined.set(typeBytes, 0);
  combined.set(data, typeBytes.length);

  const crc = crc32(combined);
  const crcBytes = new Uint8Array(4);
  new DataView(crcBytes.buffer).setUint32(0, crc);

  const chunk = new Uint8Array(4 + combined.length + 4);
  chunk.set(len, 0);
  chunk.set(combined, 4);
  chunk.set(crcBytes, 4 + combined.length);
  return chunk;
}

function encodePNG(width: number, height: number, pixels: Uint8Array): Uint8Array {
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // IDAT — add filter byte (0=none) before each row
  const rawData = new Uint8Array(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 3)] = 0; // filter: none
    for (let x = 0; x < width * 3; x++) {
      rawData[y * (1 + width * 3) + 1 + x] = pixels[y * width * 3 + x];
    }
  }
  const compressed = deflateSync(Buffer.from(rawData));

  // IEND
  const iend = new Uint8Array(0);

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', new Uint8Array(compressed));
  const iendChunk = makeChunk('IEND', iend);

  const png = new Uint8Array(
    signature.length + ihdrChunk.length + idatChunk.length + iendChunk.length,
  );
  let offset = 0;
  png.set(signature, offset); offset += signature.length;
  png.set(ihdrChunk, offset); offset += ihdrChunk.length;
  png.set(idatChunk, offset); offset += idatChunk.length;
  png.set(iendChunk, offset);
  return png;
}

function setPixel(pixels: Uint8Array, width: number, x: number, y: number, r: number, g: number, b: number) {
  const idx = (y * width + x) * 3;
  pixels[idx] = r;
  pixels[idx + 1] = g;
  pixels[idx + 2] = b;
}

function fillRect(pixels: Uint8Array, width: number, x0: number, y0: number, w: number, h: number, r: number, g: number, b: number) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      setPixel(pixels, width, x, y, r, g, b);
    }
  }
}

// ── Image generators ─────────────────────────────────────────────────────────

function generateBarChart(): Uint8Array {
  const w = 200, h = 150;
  const pixels = new Uint8Array(w * h * 3);
  // White background
  pixels.fill(255);

  // Draw axis lines (dark gray)
  for (let y = 10; y < h - 20; y++) setPixel(pixels, w, 30, y, 60, 60, 60);
  for (let x = 30; x < w - 10; x++) setPixel(pixels, w, x, h - 20, 60, 60, 60);

  // Draw bars with different heights and colors
  const bars = [
    { x: 45, h: 80, color: [66, 133, 244] },   // blue
    { x: 80, h: 100, color: [234, 67, 53] },    // red
    { x: 115, h: 60, color: [251, 188, 4] },    // yellow
    { x: 150, h: 90, color: [52, 168, 83] },    // green
  ];
  for (const bar of bars) {
    fillRect(pixels, w, bar.x, h - 20 - bar.h, 25, bar.h, bar.color[0], bar.color[1], bar.color[2]);
  }

  // Draw axis labels as small tick marks
  for (const bar of bars) {
    for (let x = bar.x; x < bar.x + 25; x++) {
      setPixel(pixels, w, x, h - 18, 60, 60, 60);
    }
  }

  return encodePNG(w, h, pixels);
}

function generateLoginForm(): Uint8Array {
  const w = 200, h = 200;
  const pixels = new Uint8Array(w * h * 3);
  // Light gray background
  pixels.fill(240);

  // White form card
  fillRect(pixels, w, 20, 20, 160, 160, 255, 255, 255);

  // "Email" input field (gray rectangle with border)
  fillRect(pixels, w, 35, 45, 130, 25, 245, 245, 245);
  fillRect(pixels, w, 35, 45, 130, 1, 180, 180, 180);  // top border
  fillRect(pixels, w, 35, 70, 130, 1, 180, 180, 180);  // bottom border
  fillRect(pixels, w, 35, 45, 1, 25, 180, 180, 180);   // left border
  fillRect(pixels, w, 165, 45, 1, 25, 180, 180, 180);  // right border

  // "Password" input field
  fillRect(pixels, w, 35, 90, 130, 25, 245, 245, 245);
  fillRect(pixels, w, 35, 90, 130, 1, 180, 180, 180);
  fillRect(pixels, w, 35, 115, 130, 1, 180, 180, 180);
  fillRect(pixels, w, 35, 90, 1, 25, 180, 180, 180);
  fillRect(pixels, w, 165, 90, 1, 25, 180, 180, 180);

  // Login button (blue)
  fillRect(pixels, w, 35, 135, 130, 30, 66, 133, 244);

  // Small label indicators (dark dots representing text)
  for (let x = 35; x < 65; x++) setPixel(pixels, w, x, 38, 80, 80, 80);  // "Email" label
  for (let x = 35; x < 80; x++) setPixel(pixels, w, x, 83, 80, 80, 80);  // "Password" label
  for (let x = 80; x < 120; x++) setPixel(pixels, w, x, 148, 255, 255, 255); // "Login" text

  return encodePNG(w, h, pixels);
}

function generateTerminal(): Uint8Array {
  const w = 240, h = 160;
  const pixels = new Uint8Array(w * h * 3);

  // Dark background (terminal-like)
  for (let i = 0; i < pixels.length; i += 3) {
    pixels[i] = 30; pixels[i + 1] = 30; pixels[i + 2] = 30;
  }

  // Title bar (darker)
  fillRect(pixels, w, 0, 0, w, 20, 50, 50, 50);

  // Window control dots (red, yellow, green)
  fillRect(pixels, w, 8, 7, 8, 8, 255, 95, 86);   // close
  fillRect(pixels, w, 22, 7, 8, 8, 255, 189, 46);  // minimize
  fillRect(pixels, w, 36, 7, 8, 8, 39, 201, 63);   // maximize

  // Terminal text lines (green on dark, like a CLI)
  const lines = [30, 45, 60, 75, 90, 105, 120];
  const lengths = [120, 80, 150, 60, 110, 90, 70];
  for (let i = 0; i < lines.length; i++) {
    const y = lines[i];
    // Prompt character (green $)
    fillRect(pixels, w, 10, y, 6, 3, 0, 255, 0);
    // Command text (lighter green, varying length)
    for (let x = 20; x < 20 + lengths[i] && x < w - 10; x += 3) {
      fillRect(pixels, w, x, y, 2, 3, 0, 200, 0);
    }
  }

  // Cursor block (blinking cursor at last line)
  fillRect(pixels, w, 20 + 70, 120, 8, 10, 0, 255, 0);

  return encodePNG(w, h, pixels);
}

// ── Main ─────────────────────────────────────────────────────────────────────

writeFileSync(path.join(IMAGE_DIR, 'bar-chart.png'), generateBarChart());
writeFileSync(path.join(IMAGE_DIR, 'login-form.png'), generateLoginForm());
writeFileSync(path.join(IMAGE_DIR, 'terminal.png'), generateTerminal());

console.log('Generated 3 test images in', IMAGE_DIR);
