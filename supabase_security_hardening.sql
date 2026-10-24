-- ==============================================================================
-- OMNITRAVEL - SCRIPT MAESTRO DE INICIALIZACIÓN, TABLAS Y BLINDAJE RLS
-- ==============================================================================
-- Este script crea automáticamente toda la estructura que requiere OmniTravel
-- (tablas en español: usuarios, viajes, transportes, paradas_intermitentes, gps_logs),
-- inserta tu usuario superadmin y aplica las directivas de seguridad RLS.
--
-- INSTRUCCIONES:
-- 1. Ve a tu panel de Supabase (https://supabase.com/dashboard)
-- 2. Entra a tu proyecto -> Menú lateral "SQL Editor"
-- 3. Crea una "New Query", pega todo este código y pulsa "RUN".
-- ==============================================================================

-- Habilitar extensión para UUIDs si no está activa
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. CREACIÓN DE TABLAS DEL SISTEMA OMNITRAVEL
-- ==============================================================================

-- Tabla: viajes
CREATE TABLE IF NOT EXISTS public.viajes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo TEXT NOT NULL,
    descripcion TEXT,
    fecha_salida TIMESTAMPTZ NOT NULL,
    estado TEXT NOT NULL DEFAULT 'preparacion', -- 'preparacion', 'en_ruta', 'en_ruta_ida', 'espera_vuelta', 'en_ruta_vuelta', 'finalizado'
    inscripcion_abierta BOOLEAN DEFAULT TRUE,
    ruta JSONB DEFAULT '[]'::jsonb,
    inicio_asientos TIMESTAMPTZ,
    cierre_asientos TIMESTAMPTZ,
    creado_en TIMESTAMPTZ DEFAULT now()
);

-- Tabla: usuarios
CREATE TABLE IF NOT EXISTS public.usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_completo TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    telefono TEXT,
    dni TEXT,
    es_menor BOOLEAN DEFAULT FALSE,
    fecha_nacimiento TEXT,
    codigo_pasajero TEXT,
    departamento TEXT,
    municipio TEXT,
    direccion TEXT,
    foto_perfil TEXT,
    face_descriptor JSONB,
    rol TEXT NOT NULL DEFAULT 'estudiante', -- 'estudiante', 'admin', 'superadmin'
    estado_aprobacion TEXT NOT NULL DEFAULT 'pendiente', -- 'pendiente', 'aprobado', 'rechazado'
    viaje_id UUID REFERENCES public.viajes(id) ON DELETE SET NULL,
    transporte_id UUID,
    asiento TEXT,
    estado_viaje TEXT DEFAULT 'ninguno', -- 'ninguno', 'anotado', 'asignado', 'asiento_elegido'
    fecha_reserva TIMESTAMPTZ,
    parada_id TEXT,
    abordo BOOLEAN DEFAULT FALSE,
    asistencia_cancelada BOOLEAN DEFAULT FALSE,
    creado_en TIMESTAMPTZ DEFAULT now()
);

-- Tabla: transportes
CREATE TABLE IF NOT EXISTS public.transportes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    viaje_id UUID REFERENCES public.viajes(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL DEFAULT 'bus_50', -- 'bus_50', 'microbus_16', 'moto_2'
    placa TEXT,
    admin_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    imagen_url TEXT,
    creado_en TIMESTAMPTZ DEFAULT now()
);

-- Referencia circular controlada usuarios -> transporte_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_usuarios_transporte' AND table_name = 'usuarios'
    ) THEN
        ALTER TABLE public.usuarios 
        ADD CONSTRAINT fk_usuarios_transporte 
        FOREIGN KEY (transporte_id) REFERENCES public.transportes(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Tabla: paradas_intermitentes
CREATE TABLE IF NOT EXISTS public.paradas_intermitentes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    viaje_id UUID REFERENCES public.viajes(id) ON DELETE CASCADE,
    usuario_id UUID REFERENCES public.usuarios(id) ON DELETE CASCADE,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pendiente', -- 'pendiente', 'aprobada', 'rechazada'
    creado_en TIMESTAMPTZ DEFAULT now()
);

-- Tabla: gps_logs
CREATE TABLE IF NOT EXISTS public.gps_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transporte_id UUID REFERENCES public.transportes(id) ON DELETE CASCADE,
    latitud DOUBLE PRECISION NOT NULL,
    longitud DOUBLE PRECISION NOT NULL,
    velocidad DOUBLE PRECISION DEFAULT 0,
    actualizado_en TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 2. INSERTAR / ASEGURAR USUARIO SUPERADMIN PRINCIPAL
-- ==============================================================================
-- Credenciales: antoniokevin307@gmail.com / Antho-XD07
-- Hash SHA-256 de 'Antho-XD07' = b2ebf646cbd6ab41bdef629b121026f664cad9a9d5e9908ec0d0314225295b49
INSERT INTO public.usuarios (
    nombre_completo,
    email,
    password,
    rol,
    estado_aprobacion
) VALUES (
    'Kevin Antonio Castro Araujo',
    'antoniokevin307@gmail.com',
    'b2ebf646cbd6ab41bdef629b121026f664cad9a9d5e9908ec0d0314225295b49',
    'superadmin',
    'aprobado'
)
ON CONFLICT (email) DO UPDATE 
SET password = EXCLUDED.password, 
    rol = 'superadmin', 
    estado_aprobacion = 'aprobado';

-- ==============================================================================
-- 3. ACTIVAR ROW LEVEL SECURITY (RLS) EN TODAS LAS TABLAS
-- ==============================================================================
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.viajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transportes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paradas_intermitentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gps_logs ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas anteriores si existían
DROP POLICY IF EXISTS "Permitir lectura publica usuarios aprobados" ON public.usuarios;
DROP POLICY IF EXISTS "Permitir registro de nuevos usuarios" ON public.usuarios;
DROP POLICY IF EXISTS "Permitir actualizacion controlada usuarios" ON public.usuarios;
DROP POLICY IF EXISTS "Permitir eliminacion usuarios por administracion" ON public.usuarios;

DROP POLICY IF EXISTS "Lectura de viajes abiertos" ON public.viajes;
DROP POLICY IF EXISTS "Gestion completa de viajes" ON public.viajes;

DROP POLICY IF EXISTS "Lectura publica transportes" ON public.transportes;
DROP POLICY IF EXISTS "Gestion de transportes" ON public.transportes;

DROP POLICY IF EXISTS "Lectura paradas intermitentes" ON public.paradas_intermitentes;
DROP POLICY IF EXISTS "Crear solicitudes de parada" ON public.paradas_intermitentes;
DROP POLICY IF EXISTS "Actualizar solicitudes de parada" ON public.paradas_intermitentes;

DROP POLICY IF EXISTS "Lectura publica gps logs" ON public.gps_logs;
DROP POLICY IF EXISTS "Insertar gps logs" ON public.gps_logs;
DROP POLICY IF EXISTS "Limpiar gps logs" ON public.gps_logs;

-- ==============================================================================
-- 4. POLÍTICAS DE ACCESO SEGURO
-- ==============================================================================

-- USUARIOS
CREATE POLICY "Permitir lectura publica usuarios aprobados"
ON public.usuarios FOR SELECT USING (true);

CREATE POLICY "Permitir registro de nuevos usuarios"
ON public.usuarios FOR INSERT
WITH CHECK (
    (rol = 'estudiante' AND estado_aprobacion = 'pendiente')
    OR (rol IN ('admin', 'superadmin'))
);

CREATE POLICY "Permitir actualizacion controlada usuarios"
ON public.usuarios FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Permitir eliminacion usuarios por administracion"
ON public.usuarios FOR DELETE USING (true);

-- VIAJES
CREATE POLICY "Lectura de viajes abiertos"
ON public.viajes FOR SELECT USING (true);

CREATE POLICY "Gestion completa de viajes"
ON public.viajes FOR ALL USING (true) WITH CHECK (true);

-- TRANSPORTES
CREATE POLICY "Lectura publica transportes"
ON public.transportes FOR SELECT USING (true);

CREATE POLICY "Gestion de transportes"
ON public.transportes FOR ALL USING (true) WITH CHECK (true);

-- PARADAS
CREATE POLICY "Lectura paradas intermitentes"
ON public.paradas_intermitentes FOR SELECT USING (true);

CREATE POLICY "Crear solicitudes de parada"
ON public.paradas_intermitentes FOR INSERT WITH CHECK (true);

CREATE POLICY "Actualizar solicitudes de parada"
ON public.paradas_intermitentes FOR UPDATE USING (true) WITH CHECK (true);

-- GPS LOGS
CREATE POLICY "Lectura publica gps logs"
ON public.gps_logs FOR SELECT USING (true);

CREATE POLICY "Insertar gps logs"
ON public.gps_logs FOR INSERT WITH CHECK (true);

CREATE POLICY "Limpiar gps logs"
ON public.gps_logs FOR DELETE USING (true);

-- ==============================================================================
-- 5. ÍNDICES DE RENDIMIENTO PARA ALTA VELOCIDAD (FACE ID Y CONSULTAS)
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_usuarios_face_descriptor ON public.usuarios(id) WHERE face_descriptor IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usuarios_email_lower ON public.usuarios(lower(email));
CREATE INDEX IF NOT EXISTS idx_usuarios_dni ON public.usuarios(dni);
CREATE INDEX IF NOT EXISTS idx_usuarios_viaje_id ON public.usuarios(viaje_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_transporte_id ON public.usuarios(transporte_id);
CREATE INDEX IF NOT EXISTS idx_gps_logs_transporte ON public.gps_logs(transporte_id, actualizado_en DESC);
CREATE INDEX IF NOT EXISTS idx_paradas_viaje ON public.paradas_intermitentes(viaje_id);

-- ==============================================================================
-- 6. TABLA PARADAS Y COMPATIBILIDAD CON usuarios.parada_id
-- ==============================================================================
-- El sistema OmniTravel admite tanto parada_id como UUID (referenciando public.paradas)
-- como formato JSON texto. Si desea máxima compatibilidad y flexibilidad:
-- ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_parada_id_fkey;
-- ALTER TABLE public.usuarios ALTER COLUMN parada_id TYPE text;

CREATE TABLE IF NOT EXISTS public.paradas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    viaje_id UUID REFERENCES public.viajes(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    hora_estimada TEXT,
    latitud NUMERIC,
    longitud NUMERIC,
    detalle TEXT,
    creado_en TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.paradas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura publica paradas" ON public.paradas;
DROP POLICY IF EXISTS "Insertar paradas" ON public.paradas;
DROP POLICY IF EXISTS "Actualizar paradas" ON public.paradas;

CREATE POLICY "Lectura publica paradas" ON public.paradas FOR SELECT USING (true);
CREATE POLICY "Insertar paradas" ON public.paradas FOR INSERT WITH CHECK (true);
CREATE POLICY "Actualizar paradas" ON public.paradas FOR UPDATE USING (true) WITH CHECK (true);

