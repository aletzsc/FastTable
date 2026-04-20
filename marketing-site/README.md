# FastTable Marketing Site (local)

Landing page de marketing para FastTable con:

- Sitio web promocional (HTML/CSS/JS)
- Boton de descarga APK
- Contador de descargas persistido en DB SQLite local
- API HTTP minima para integracion

## Ejecutar en local

Desde la raiz del repo:

```bash
npm run marketing:start
```

Abrir en navegador:

```text
http://localhost:4010
```

## Variables de entorno

- `MARKETING_HOST` (default: `0.0.0.0`)
- `MARKETING_PORT` (default: `4010`)
- `MARKETING_APK_URL` (default: `https://example.com/fasttable-latest.apk`)

Ejemplo:

```bash
MARKETING_PORT=4020 MARKETING_APK_URL="https://tu-servidor.com/FastTable.apk" npm run marketing:start
```

## API

- `GET /api/health` -> estado del servicio
- `GET /api/downloads` -> contador actual
- `POST /api/download/apk` -> incrementa contador y devuelve `apkUrl`
- `GET /download/apk` -> incrementa contador y redirige al APK

## Nota para produccion

SQLite local es ideal para demos o despliegues simples. Cuando compartas tus llaves, se puede migrar facilmente a tu DB remota (por ejemplo Supabase/Postgres) sin cambiar la UX del frontend.
