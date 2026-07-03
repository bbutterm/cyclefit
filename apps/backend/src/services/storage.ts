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
