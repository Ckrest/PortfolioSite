import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MEDIA_CONTRACT } from '../js/generated/media-contract.js';
const execute = promisify(execFile);
function imageMediaType(path) {
  const extension = extname(path).toLowerCase();
  return ({
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  })[extension] || null;
}

async function readImageDimensions(path) {
  try {
    const data = await readFile(path);
    if (data.length >= 24 && data.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    )) {
      return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
    }
    if (data.length >= 10 && data.subarray(0, 6).toString('ascii').match(/^GIF8[79]a$/)) {
      return { width: data.readUInt16LE(6), height: data.readUInt16LE(8) };
    }
    if (data.length >= 30 && data.subarray(0, 4).toString('ascii') === 'RIFF'
        && data.subarray(8, 12).toString('ascii') === 'WEBP') {
      const kind = data.subarray(12, 16).toString('ascii');
      if (kind === 'VP8X') {
        return {
          width: 1 + data.readUIntLE(24, 3),
          height: 1 + data.readUIntLE(27, 3),
        };
      }
      if (kind === 'VP8L') {
        const bits = data.readUInt32LE(21);
        return {
          width: 1 + (bits & 0x3fff),
          height: 1 + ((bits >> 14) & 0x3fff),
        };
      }
      if (kind === 'VP8 ') {
        const marker = data.indexOf(Buffer.from([0x9d, 0x01, 0x2a]), 20);
        if (marker >= 0 && marker + 7 <= data.length) {
          return {
            width: data.readUInt16LE(marker + 3) & 0x3fff,
            height: data.readUInt16LE(marker + 5) & 0x3fff,
          };
        }
      }
    }
    if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
      const markers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
      let offset = 2;
      while (offset + 8 < data.length) {
        if (data[offset] !== 0xff) { offset += 1; continue; }
        const marker = data[offset + 1];
        if (markers.has(marker)) {
          return { width: data.readUInt16BE(offset + 7), height: data.readUInt16BE(offset + 5) };
        }
        if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
        const length = data.readUInt16BE(offset + 2);
        if (length < 2) break;
        offset += 2 + length;
      }
    }
    if (extname(path).toLowerCase() === '.svg') {
      const source = data.toString('utf8');
      const root = source.match(/<svg\b[^>]*>/i)?.[0] || '';
      const number = (name) => {
        const raw = root.match(new RegExp(
          `\\b${name}\\s*=\\s*["']\\s*([0-9]+(?:\\.[0-9]+)?)(?:px)?\\s*["']`,
          'i',
        ))?.[1];
        return raw ? Math.round(Number(raw)) : 0;
      };
      let width = number('width');
      let height = number('height');
      if (!width || !height) {
        const viewBox = root.match(/\bviewBox\s*=\s*["']\s*[-+0-9.e]+[ ,]+[-+0-9.e]+[ ,]+([-+0-9.e]+)[ ,]+([-+0-9.e]+)/i);
        width ||= Math.round(Number(viewBox?.[1] || 0));
        height ||= Math.round(Number(viewBox?.[2] || 0));
      }
      if (width > 0 && height > 0) return { width, height };
    }
  } catch { /* normal asset validation reports missing files */ }
  return null;
}


export async function inspectMedia(path) {
  const extension = extname(path).toLowerCase();
  const imageType = imageMediaType(path);
  if (!imageType && !MEDIA_CONTRACT.videoExtensions.includes(extension)) return null;
  const bytes = await readFile(path);
  const identity = {digest: 'sha256:' + createHash('sha256').update(bytes).digest('hex'), byte_size: bytes.length};
  let dimensions = imageType ? await readImageDimensions(path) : null;
  if (imageType && !dimensions) throw new Error('Invalid image bytes');
  if (imageType) {
    const detected = bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
      : bytes[0] === 255 && bytes[1] === 216 ? 'image/jpeg'
      : /^GIF8[79]a$/.test(bytes.subarray(0,6).toString()) ? 'image/gif'
      : bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP' ? 'image/webp'
      : /<svg\b/.test(bytes.toString('utf8')) ? 'image/svg+xml' : null;
    if (detected !== imageType) throw new Error('Image extension does not match verified bytes');
    if (extension !== '.gif') return {kind:'image',media_type:imageType,...dimensions,...identity,
      animated: extension === '.webp' ? bytes.subarray(12,16).toString() === 'VP8X' && Boolean(bytes[20] & 2)
        : extension === '.png' && bytes.includes(Buffer.from('acTL'))};
  }
  const { stdout } = await execute('ffprobe', ['-v', 'error', '-count_frames', '-show_entries',
    'stream=codec_type,codec_name,width,height,nb_frames,nb_read_frames,duration:format=duration', '-of', 'json', path], {timeout: 30000, maxBuffer: 1024 * 1024});
  const probe = JSON.parse(stdout);
  const stream = probe.streams?.find(s => s.codec_type === 'video');
  if (!stream?.width || !stream?.height) throw new Error('Video has no decodable visual stream');
  dimensions = {width: stream.width, height: stream.height};
  const duration = Number(probe.format?.duration || stream.duration || 0);
  const animated = imageType ? (Number(stream.nb_read_frames || stream.nb_frames || 0) > 1) : false;
  return {kind: imageType ? 'image' : 'video', media_type: imageType || ({'.mp4':'video/mp4','.mov':'video/quicktime','.webm':'video/webm','.mkv':'video/x-matroska','.avi':'video/x-msvideo'})[extension],
    ...dimensions, ...identity, codec: stream.codec_name, duration: Math.round(duration * 1000) / 1000,
    has_audio: probe.streams.some(s => s.codec_type === 'audio'), animated};
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  try { process.stdout.write(JSON.stringify(await inspectMedia(process.argv[2])) + '\n'); }
  catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
