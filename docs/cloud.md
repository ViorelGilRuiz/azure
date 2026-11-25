# Candidato de despliegue en Netlify

Destino previsto: https://azurecert.netlify.app. La rama 3.0 mantiene el modo SQLite local. En Netlify y con `AZURE_DEPLOYMENT=cloud`, la API requiere autenticación y escribe en PostgreSQL. La función de persistencia rechaza SQLite en modo cloud.

## Preparar un entorno de prueba

1. Verificar desde una sesión Netlify autorizada que el sitio `azurecert` pertenece al proyecto esperado, anotar su identificador y comprobar el vínculo con `ViorelGilRuiz/azure`. Conservar la producción mientras se realiza la prueba.
2. Elegir un proyecto Supabase de prueba y revisar el plan, límites, políticas de pausa y correo de recuperación. Seleccionar un plan según las necesidades. Aplicar `supabase/migrations/202611250001_progress.sql` sobre un proyecto verificado.
3. Activar autenticación por correo y contraseña. Desactivar altas públicas. Crear o invitar desde administración solo a los usuarios de prueba autorizados. No usar el rol `service_role` desde Next.js.
4. Configurar la URL de retorno y restringir los orígenes. La plantilla de recuperación usa `{{ .SiteURL }}/api/auth?token_hash={{ .TokenHash }}`. El Site URL debe coincidir con el origen de la aplicación. Usar un entorno de Auth separado para el preview si el retorno de producción es diferente.
5. En las variables del entorno de funciones, establecer `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` y `AZURE_PUBLIC_ORIGIN` para el contexto correspondiente. El origen del preview es su URL exacta, sin barra final. El de producción es `https://azurecert.netlify.app`.
6. Crear un Deploy Preview y verificar `GET /api/health`, cuyo resultado indica configuración disponible. Hacer las pruebas de autenticación y persistencia de abajo. El estado de salud no prueba por sí solo que las credenciales funcionen.

## Verificación con dos usuarios y dos dispositivos

- Un visitante sin sesión debe obtener 401 al leer, descargar o modificar progreso. Una mutación desde un origen ajeno debe obtener 403.
- Con dos usuarios de prueba, crear una sesión o tarjeta con A y verificar que B no la ve en el dashboard, el CSV, la exportación ni mediante su ID. Verificar también las políticas directamente en la REST API utilizando los tokens de los usuarios que se están comprobando.
- Iniciar y cerrar sesión, probar el enlace de recuperación y comprobar que la contraseña anterior deja de funcionar. Validar que el registro público está desactivado.
- Guardar una respuesta y una calificación desde un dispositivo. Volver a consultarlas desde otro y tras desplegar una nueva versión. Probar dos escrituras simultáneas para comprobar la revisión optimista.
- Confirmar que un simulacro activo no devuelve soluciones al consultarlo y que se revelan tras entregarlo.

## Migrar el progreso local

Mantener el backup SQLite y el JSON local fuera de Git. La importación v1/v2 se ejecuta dentro de la sesión autenticada del propietario. Se combinan sesiones y repasos por ID. Para comprobar el resultado, descargar un nuevo JSON desde el mismo usuario y ejecutar:

```powershell
node scripts/compare-progress.mjs .\data\origen.json .\data\destino.json
```

Antes de integrar en `master`, comprobar la equivalencia y repetir las pruebas de persistencia. Después de verificar el preview y el dominio del sitio, configurar las variables de producción, desplegar y comprobar HTTPS, privacidad y persistencia en el dominio indicado. Mantener intacto SQLite hasta haber verificado la migración.

## Límites

El almacenamiento cloud es una instantánea JSONB por usuario con revisión para evitar pérdida de escrituras concurrentes. La función valida el tamaño y limita la aplicación a 10 MiB por documento persistido. Las políticas RLS restringen las filas al usuario autenticado. La app es para acceso privado y el proveedor administra el límite de solicitudes de autenticación. No se ha ejecutado esta migración contra un proyecto Supabase autorizado para el sitio ni se ha efectuado un despliegue 3.0.
