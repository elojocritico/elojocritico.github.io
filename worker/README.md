# Worker `eoc-publicar`

Camino rápido del botón «Publicar cambios» del panel. Si el Worker falla o no está, el flujo horario de GitHub publica igualmente.

`POST /` con `Authorization: Bearer <token de Firebase>` (y, si el panel lo tiene, `X-Firebase-AppCheck`):

1. Comprueba el origen (solo `https://elojocritico.github.io` y `https://elojocritico.pages.dev`).
2. Verifica el token con las claves públicas de Google (`aud` e `iss` del proyecto, caducidad, `email_verified`). Si no es válido: 401.
3. Lee `ajustes/global` por la API REST de Firestore con el propio token del usuario (se aplican las reglas) y reenvía `X-Firebase-AppCheck` sin cambios. Sin papel `admin` o `editor`: 403.
4. Lanza `repository_dispatch` con `{"event_type":"publicar"}` en `elojocritico/elojocritico.github.io`. Si GitHub lo rechaza: 502.

Todo el trabajo tiene un máximo de 10 s. Nunca se escriben tokens en los registros.

## Variables y secreto

- `wrangler.toml` `[vars]` (públicas): `FIREBASE_PROJECT_ID`, `GITHUB_REPO`.
- Secreto `GITHUB_TOKEN_PUBLICAR` (nunca en archivos): `npx wrangler secret put GITHUB_TOKEN_PUBLICAR`.

### Permisos del token de GitHub

Token *fine-grained* limitado a **un solo repositorio**, `elojocritico/elojocritico.github.io`, con el permiso **Contents: Read and write**.
El endpoint `POST /repos/{owner}/{repo}/dispatches` exige ese permiso; «Actions: write» no basta. Ponle caducidad y renuévalo antes.

## Pruebas y despliegue

```
npm install
npm test            # sin red: claves RS256 generadas en la prueba
npx wrangler deploy # solo cuando toque desplegar (requiere wrangler login)
```

La dirección del Worker desplegado va en `PUBLIC_URL_PUBLICAR` del panel.
