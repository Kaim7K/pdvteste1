
CREATE TYPE public.app_role AS ENUM ('gerente', 'vendedor');
CREATE TYPE public.sale_status AS ENUM ('completed', 'cancelled', 'fiado_open', 'fiado_paid');
CREATE TYPE public.payment_method AS ENUM ('dinheiro', 'debito', 'credito', 'pix', 'outros', 'fiado');
CREATE TYPE public.product_unit AS ENUM ('unidade', 'peso', 'pacote');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text, email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE POLICY "user_roles_select" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'gerente'));
CREATE POLICY "user_roles_manage" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gerente')) WITH CHECK (public.has_role(auth.uid(), 'gerente'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE is_first boolean;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  SELECT COUNT(*) = 0 INTO is_first FROM public.user_roles;
  IF is_first THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'gerente');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'vendedor') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories_read" ON public.categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "categories_insert" ON public.categories FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "categories_update" ON public.categories FOR UPDATE TO authenticated USING (true);
CREATE POLICY "categories_delete_gerente" ON public.categories FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'));

CREATE SEQUENCE public.internal_code_seq START 1000;

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  barcode text UNIQUE,
  internal_code text NOT NULL UNIQUE,
  image_url text,
  price numeric(12,2) NOT NULL DEFAULT 0,
  cost_price numeric(12,2),
  stock numeric(12,3) NOT NULL DEFAULT 0,
  unit public.product_unit NOT NULL DEFAULT 'unidade',
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_read" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "products_insert" ON public.products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "products_update" ON public.products FOR UPDATE TO authenticated USING (true);
CREATE POLICY "products_delete_gerente" ON public.products FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'));

CREATE OR REPLACE FUNCTION public.set_internal_code() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.internal_code IS NULL OR NEW.internal_code = '' THEN
    NEW.internal_code := 'P' || lpad(nextval('public.internal_code_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_products_ic BEFORE INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_internal_code();
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.product_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  field text NOT NULL,
  old_value text, new_value text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  origin text, sale_id uuid, note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.product_audit TO authenticated;
GRANT ALL ON public.product_audit TO service_role;
ALTER TABLE public.product_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "paudit_read" ON public.product_audit FOR SELECT TO authenticated USING (true);
CREATE POLICY "paudit_insert" ON public.product_audit FOR INSERT TO authenticated WITH CHECK (true);
CREATE INDEX idx_paudit ON public.product_audit(product_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.audit_product_changes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.price IS DISTINCT FROM OLD.price THEN
    INSERT INTO public.product_audit(product_id, field, old_value, new_value, user_id, origin)
    VALUES (NEW.id, 'price', OLD.price::text, NEW.price::text, auth.uid(), 'update');
  END IF;
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    INSERT INTO public.product_audit(product_id, field, old_value, new_value, user_id, origin)
    VALUES (NEW.id, 'name', OLD.name, NEW.name, auth.uid(), 'update');
  END IF;
  IF NEW.stock IS DISTINCT FROM OLD.stock THEN
    INSERT INTO public.product_audit(product_id, field, old_value, new_value, user_id, origin)
    VALUES (NEW.id, 'stock', OLD.stock::text, NEW.stock::text, auth.uid(), 'stock_change');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_products_audit AFTER UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.audit_product_changes();

CREATE TABLE public.fiado_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, phone text, note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiado_customers TO authenticated;
GRANT ALL ON public.fiado_customers TO service_role;
ALTER TABLE public.fiado_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fc_read" ON public.fiado_customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "fc_insert" ON public.fiado_customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "fc_update" ON public.fiado_customers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "fc_delete_gerente" ON public.fiado_customers FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'));

CREATE SEQUENCE public.sale_number_seq START 1;

CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_number bigint NOT NULL UNIQUE DEFAULT nextval('public.sale_number_seq'),
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  paid numeric(12,2) NOT NULL DEFAULT 0,
  change_due numeric(12,2) NOT NULL DEFAULT 0,
  status public.sale_status NOT NULL DEFAULT 'completed',
  observation text,
  fiado_customer_id uuid REFERENCES public.fiado_customers(id) ON DELETE SET NULL,
  cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancelled_at timestamptz, cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sales_select" ON public.sales FOR SELECT TO authenticated
  USING (seller_id = auth.uid() OR public.has_role(auth.uid(), 'gerente'));
CREATE POLICY "sales_insert_own" ON public.sales FOR INSERT TO authenticated
  WITH CHECK (seller_id = auth.uid());
CREATE POLICY "sales_update" ON public.sales FOR UPDATE TO authenticated
  USING (seller_id = auth.uid() OR public.has_role(auth.uid(), 'gerente'));
CREATE POLICY "sales_delete" ON public.sales FOR DELETE TO authenticated
  USING (seller_id = auth.uid() OR public.has_role(auth.uid(), 'gerente'));
CREATE INDEX idx_sales_seller ON public.sales(seller_id, created_at DESC);
CREATE INDEX idx_sales_created ON public.sales(created_at DESC);

CREATE TABLE public.sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity numeric(12,3) NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL,
  subtotal numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_items TO authenticated;
GRANT ALL ON public.sale_items TO service_role;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "si_parent" ON public.sale_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id AND (s.seller_id = auth.uid() OR public.has_role(auth.uid(), 'gerente'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id AND (s.seller_id = auth.uid() OR public.has_role(auth.uid(), 'gerente'))));
CREATE INDEX idx_si_sale ON public.sale_items(sale_id);
CREATE INDEX idx_si_product ON public.sale_items(product_id);

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  method public.payment_method NOT NULL,
  amount numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pm_parent" ON public.payments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id AND (s.seller_id = auth.uid() OR public.has_role(auth.uid(), 'gerente'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id AND (s.seller_id = auth.uid() OR public.has_role(auth.uid(), 'gerente'))));
CREATE INDEX idx_pm_sale ON public.payments(sale_id);

CREATE TABLE public.general_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  entity_type text, entity_id uuid,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.general_audit TO authenticated;
GRANT ALL ON public.general_audit TO service_role;
ALTER TABLE public.general_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ga_select_gerente" ON public.general_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'));
CREATE POLICY "ga_insert" ON public.general_audit FOR INSERT TO authenticated WITH CHECK (true);
CREATE INDEX idx_ga_created ON public.general_audit(created_at DESC);

CREATE TABLE public.settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  market_name text DEFAULT 'Mercado',
  cnpj text, address text, logo_url text,
  max_minimized_sales int NOT NULL DEFAULT 3,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.settings (id) VALUES (1) ON CONFLICT DO NOTHING;
GRANT SELECT, UPDATE ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "st_read" ON public.settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "st_update_gerente" ON public.settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'gerente')) WITH CHECK (public.has_role(auth.uid(), 'gerente'));
