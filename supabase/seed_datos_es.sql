-- Datos de ejemplo (ejecutar después de schema_completo_es.sql en SQL Editor).

DELETE FROM public.items_menu WHERE id_categoria IN (
  SELECT id FROM public.categorias_menu WHERE nombre IN ('Entradas', 'Platos fuertes', 'Bebidas', 'Postres')
);
DELETE FROM public.categorias_menu WHERE nombre IN ('Entradas', 'Platos fuertes', 'Bebidas', 'Postres');
DELETE FROM public.mesas WHERE codigo IN ('M1', 'M2', 'M3', 'M4');
DELETE FROM public.zonas WHERE nombre IN ('Salón principal', 'Terraza');

INSERT INTO public.zonas (nombre, orden) VALUES
  ('Salón principal', 1),
  ('Terraza', 2);

INSERT INTO public.mesas (codigo, id_zona, capacidad, estado, notas)
SELECT 'M1', id, 4, 'libre', 'Ventana'
FROM public.zonas WHERE nombre = 'Salón principal' LIMIT 1;

INSERT INTO public.mesas (codigo, id_zona, capacidad, estado, notas)
SELECT 'M2', id, 4, 'ocupada', NULL
FROM public.zonas WHERE nombre = 'Salón principal' LIMIT 1;

INSERT INTO public.mesas (codigo, id_zona, capacidad, estado, notas)
SELECT 'M3', id, 4, 'reservada', NULL
FROM public.zonas WHERE nombre = 'Salón principal' LIMIT 1;

INSERT INTO public.mesas (codigo, id_zona, capacidad, estado, notas)
SELECT 'M4', id, 4, 'libre', 'Vista jardín'
FROM public.zonas WHERE nombre = 'Terraza' LIMIT 1;

INSERT INTO public.categorias_menu (nombre, orden) VALUES
  ('Entradas', 1),
  ('Platos fuertes', 2),
  ('Bebidas', 3),
  ('Postres', 4);

INSERT INTO public.items_menu (id_categoria, nombre, descripcion, precio_centavos, disponible)
SELECT id, 'Croquetas de jamón', 'Cremosas, con bechamel.', 14500, true FROM public.categorias_menu WHERE nombre = 'Entradas' LIMIT 1;

INSERT INTO public.items_menu (id_categoria, nombre, descripcion, precio_centavos, disponible)
SELECT id, 'Ensalada de burrata', 'Tomate, albahaca, reducción balsámica.', 16500, true FROM public.categorias_menu WHERE nombre = 'Entradas' LIMIT 1;

INSERT INTO public.items_menu (id_categoria, nombre, descripcion, precio_centavos, disponible)
SELECT id, 'Tartar de atún', 'Aguacate, sésamo y lima.', 19500, true FROM public.categorias_menu WHERE nombre = 'Entradas' LIMIT 1;

INSERT INTO public.items_menu (id_categoria, nombre, descripcion, precio_centavos, disponible)
SELECT id, 'Risotto de hongos', 'Parmesano y aceite de trufa.', 24500, true FROM public.categorias_menu WHERE nombre = 'Platos fuertes' LIMIT 1;

INSERT INTO public.items_menu (id_categoria, nombre, descripcion, precio_centavos, disponible)
SELECT id, 'Costillas BBQ', 'Patatas confitadas y ensalada coleslaw.', 28500, true FROM public.categorias_menu WHERE nombre = 'Platos fuertes' LIMIT 1;

INSERT INTO public.items_menu (id_categoria, nombre, descripcion, precio_centavos, disponible)
SELECT id, 'Pescado del día', 'Según mercado, guarnición de temporada.', 26500, true FROM public.categorias_menu WHERE nombre = 'Platos fuertes' LIMIT 1;

INSERT INTO public.items_menu (id_categoria, nombre, descripcion, precio_centavos, disponible)
SELECT id, 'Burger clásica', 'Queso cheddar, bacon crujiente.', 19500, true FROM public.categorias_menu WHERE nombre = 'Platos fuertes' LIMIT 1;

INSERT INTO public.items_menu (id_categoria, nombre, descripcion, precio_centavos, disponible)
SELECT id, 'Limonada de hierbabuena', 'Jarra 1 L.', 8500, true FROM public.categorias_menu WHERE nombre = 'Bebidas' LIMIT 1;

INSERT INTO public.items_menu (id_categoria, nombre, descripcion, precio_centavos, disponible)
SELECT id, 'Agua mineral', '750 ml.', 4500, true FROM public.categorias_menu WHERE nombre = 'Bebidas' LIMIT 1;

INSERT INTO public.items_menu (id_categoria, nombre, descripcion, precio_centavos, disponible)
SELECT id, 'Cerveza artesanal', 'Estilo ale, 473 ml.', 9500, true FROM public.categorias_menu WHERE nombre = 'Bebidas' LIMIT 1;

INSERT INTO public.items_menu (id_categoria, nombre, descripcion, precio_centavos, disponible)
SELECT id, 'Refresco', 'Lata 355 ml.', 5500, true FROM public.categorias_menu WHERE nombre = 'Bebidas' LIMIT 1;

INSERT INTO public.items_menu (id_categoria, nombre, descripcion, precio_centavos, disponible)
SELECT id, 'Brownie con helado', 'Chocolate y nuez.', 11500, true FROM public.categorias_menu WHERE nombre = 'Postres' LIMIT 1;

INSERT INTO public.items_menu (id_categoria, nombre, descripcion, precio_centavos, disponible)
SELECT id, 'Flan de la casa', 'Caramelo casero.', 8500, true FROM public.categorias_menu WHERE nombre = 'Postres' LIMIT 1;

INSERT INTO public.items_menu (id_categoria, nombre, descripcion, precio_centavos, disponible)
SELECT id, 'Tiramisú', 'Café y mascarpone.', 12500, true FROM public.categorias_menu WHERE nombre = 'Postres' LIMIT 1;
