-- Migrasi: dukungan merge Dompet/Kategori duplikat lintas perangkat
-- Jalankan sekali di Supabase SQL Editor SEBELUM sinkronisasi dengan build terbaru.

ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS merged_into TEXT;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS merged_into TEXT;

-- Opsional (setelah SEMUA perangkat sudah sinkron minimal 1x dengan build terbaru):
-- hapus permanen tombstone hasil merge yang sudah lebih dari 30 hari.
-- DELETE FROM public.accounts   WHERE merged_into IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
-- DELETE FROM public.categories WHERE merged_into IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';

