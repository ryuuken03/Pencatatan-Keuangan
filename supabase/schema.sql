-- ==============================================================================
-- SKEMA DATABASE SUPABASE / POSTGRESQL & ROW LEVEL SECURITY (RLS)
-- Aplikasi Pencatatan Keuangan Multi-Workspace (Buku Kas: Pribadi, Usaha, Kopdes)
-- Sesuai Skema Dexie.js v2 (PRD Bagian 5 & FASE 2)
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 2. TABEL-TABEL UTAMA (Cocok 1:1 dengan Dexie.js v2)
-- ==============================================================================

-- A. TABEL workspaces (Buku Kas: 'personal', 'business', 'kopdes')
CREATE TABLE IF NOT EXISTS public.workspaces (
    id TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'IDR',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    sync_status TEXT NOT NULL DEFAULT 'synced',
    PRIMARY KEY (user_id, id)
);

-- B. TABEL accounts (Dompet / Rekening Kas)
CREATE TABLE IF NOT EXISTS public.accounts (
    id TEXT NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'cash', -- 'cash' | 'bank' | 'ewallet'
    initial_balance BIGINT NOT NULL DEFAULT 0, -- Disimpan dalam satuan Rupiah bulat
    merged_into TEXT, -- ID kanonik bila baris ini hasil merge duplikat (soft delete)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    sync_status TEXT NOT NULL DEFAULT 'synced'
);

-- C. TABEL categories (Kategori Pemasukan / Pengeluaran)
CREATE TABLE IF NOT EXISTS public.categories (
    id TEXT NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'expense', -- 'income' | 'expense'
    keywords TEXT DEFAULT '',
    merged_into TEXT, -- ID kanonik bila baris ini hasil merge duplikat (soft delete)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    sync_status TEXT NOT NULL DEFAULT 'synced'
);

-- D. TABEL transactions (Transaksi Utama & Lintas Buku)
CREATE TABLE IF NOT EXISTS public.transactions (
    id TEXT NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    to_account_id TEXT, -- Nullable untuk Transfer
    category_id TEXT, -- Nullable untuk Transfer
    type TEXT NOT NULL DEFAULT 'expense', -- 'income' | 'expense' | 'transfer' | 'debt' | 'receivable'
    amount BIGINT NOT NULL DEFAULT 0, -- Integer positif Rupiah bulat
    date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    note TEXT DEFAULT '',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb, -- no_bukti, unit_usaha, pic_pihak, reimburse_status, reimburse_from_account_id, reimburse_settled_at
    attachment_data JSONB, -- Serialized WebP struk { mime, size, data (base64) }
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    sync_status TEXT NOT NULL DEFAULT 'synced'
);

-- E. TABEL transaction_items (Rincian Produk Opsional 0..N per Transaksi)
CREATE TABLE IF NOT EXISTS public.transaction_items (
    id TEXT NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    transaction_id TEXT NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    amount BIGINT NOT NULL DEFAULT 0, -- Integer Rupiah bulat
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    sync_status TEXT NOT NULL DEFAULT 'synced'
);

-- ==============================================================================
-- 3. INDEX UNTUK PERFORMA DELTA SYNC (HEMAT BATERAI & KUOTA)
-- ==============================================================================

-- Migrasi untuk database lama (aman dijalankan berulang)
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS merged_into TEXT;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS merged_into TEXT;

CREATE INDEX IF NOT EXISTS idx_workspaces_user_updated ON public.workspaces (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_accounts_user_updated ON public.accounts (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_categories_user_updated ON public.categories (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_updated ON public.transactions (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_workspace ON public.transactions (user_id, workspace_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_tx_items_user_updated ON public.transaction_items (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_items_transaction_id ON public.transaction_items (transaction_id);

-- ==============================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- Pengguna hanya dapat membaca, mengubah, dan menghapus datanya sendiri (auth.uid() = user_id)
-- ==============================================================================

-- Aktifkan RLS di seluruh tabel
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_items ENABLE ROW LEVEL SECURITY;

-- Policy Workspaces
DROP POLICY IF EXISTS "workspaces_user_policy" ON public.workspaces;
CREATE POLICY "workspaces_user_policy"
    ON public.workspaces
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Policy Accounts
DROP POLICY IF EXISTS "accounts_user_policy" ON public.accounts;
CREATE POLICY "accounts_user_policy"
    ON public.accounts
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Policy Categories
DROP POLICY IF EXISTS "categories_user_policy" ON public.categories;
CREATE POLICY "categories_user_policy"
    ON public.categories
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Policy Transactions
DROP POLICY IF EXISTS "transactions_user_policy" ON public.transactions;
CREATE POLICY "transactions_user_policy"
    ON public.transactions
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Policy Transaction Items
DROP POLICY IF EXISTS "transaction_items_user_policy" ON public.transaction_items;
CREATE POLICY "transaction_items_user_policy"
    ON public.transaction_items
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ==============================================================================
-- 5. TRIGGER OTOMATIS: DEFAULT WORKSPACES SAAT USER BARU MENDAFTAR (Opsional)
-- Memastikan pengguna yang mendaftar langsung memiliki 3 workspace default di server.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user_workspaces()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.workspaces (id, user_id, name, currency, created_at, updated_at)
    VALUES
        ('personal', NEW.id, 'Pribadi', 'IDR', NOW(), NOW()),
        ('business', NEW.id, 'Usaha', 'IDR', NOW(), NOW()),
        ('kopdes', NEW.id, 'Kopdes', 'IDR', NOW(), NOW())
    ON CONFLICT (user_id, id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_workspaces();

