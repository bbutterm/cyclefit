import { mkdirSync, writeFileSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config.js';

// Хранилище картинок упражнений: Supabase Storage в проде, локальная папка в dev (§2.1).

export interface ImageStorage {
  /** Сохраняет файл и возвращает публичный URL. */
  save(filename: string, data: Buffer, contentType: string): Promise<string>;
  /** Удаляет файл по URL, который вернул save (незнакомые URL игнорирует). */
  remove(url: string): Promise<void>;
}

class LocalStorage implements ImageStorage {
  async save(filename: string, data: Buffer): Promise<string> {
    mkdirSync(config.uploadsDir, { recursive: true });
    writeFileSync(join(config.uploadsDir, filename), data);
    return `/uploads/${filename}`;
  }

  async remove(url: string): Promise<void> {
    if (!url.startsWith('/uploads/')) return;
    await unlink(join(config.uploadsDir, url.slice('/uploads/'.length))).catch(() => {});
  }
}

class SupabaseStorage implements ImageStorage {
  private objectUrl(filename: string): string {
    return `${config.supabaseUrl}/storage/v1/object/${config.supabaseBucket}/${filename}`;
  }

  private publicUrl(filename: string): string {
    return `${config.supabaseUrl}/storage/v1/object/public/${config.supabaseBucket}/${filename}`;
  }

  async save(filename: string, data: Buffer, contentType: string): Promise<string> {
    const res = await fetch(this.objectUrl(filename), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.supabaseServiceKey}`,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: new Uint8Array(data),
    });
    if (!res.ok) {
      throw new Error(`Supabase Storage upload failed: ${res.status} ${await res.text()}`);
    }
    return this.publicUrl(filename);
  }

  async remove(url: string): Promise<void> {
    const prefix = `${config.supabaseUrl}/storage/v1/object/public/${config.supabaseBucket}/`;
    if (!url.startsWith(prefix)) return;
    const filename = url.slice(prefix.length);
    await fetch(this.objectUrl(filename), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${config.supabaseServiceKey}` },
    }).catch(() => {});
  }
}

export function getImageStorage(): ImageStorage {
  return config.supabaseUrl && config.supabaseServiceKey ? new SupabaseStorage() : new LocalStorage();
}

/** Определяет тип картинки по сигнатуре (magic bytes). Возвращает null для неподдерживаемых. */
export function detectImageType(buf: Buffer): { ext: string; mime: string } | null {
  if (buf.length < 12) return null;
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { ext: 'png', mime: 'image/png' };
  }
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }
  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return { ext: 'gif', mime: 'image/gif' };
  }
  // WebP: "RIFF"...."WEBP"
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return { ext: 'webp', mime: 'image/webp' };
  }
  return null;
}
