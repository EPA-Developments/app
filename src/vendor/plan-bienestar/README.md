# Plan Bienestar · 100 días (módulo vendorizado)

Copia local de los paquetes del monorepo
[EPA-Developments/plan-bienestar-100-dias](https://github.com/EPA-Developments/plan-bienestar-100-dias)
(no publicados en npm todavía):

| Carpeta | Origen en el monorepo |
| --- | --- |
| `careplan-menopausia/` | `packages/careplan-menopausia/src` |
| `plan-bienestar-react/` | `packages/plan-bienestar-react/src` |

Los imports de la app siguen siendo `@epa/careplan-menopausia` y
`@epa/plan-bienestar-react`: los alias viven en `tsconfig.json` (`paths`) y
`vite.config.ts` (`resolve.alias`). El día que los paquetes se publiquen en npm,
basta con instalarlos, borrar esta carpeta y quitar los alias — ningún archivo
de la app cambia.

## Cómo actualizar la copia

```bash
git clone https://github.com/EPA-Developments/plan-bienestar-100-dias /tmp/pb
rm -rf src/vendor/plan-bienestar/careplan-menopausia src/vendor/plan-bienestar/plan-bienestar-react
cp -r /tmp/pb/packages/careplan-menopausia/src src/vendor/plan-bienestar/careplan-menopausia
cp -r /tmp/pb/packages/plan-bienestar-react/src src/vendor/plan-bienestar/plan-bienestar-react
```

No editar a mano dentro de esta carpeta: los cambios se hacen en el monorepo y
se re-sincronizan, para que las apps anfitrionas (esta y drdalessandro/app) no
diverjan.
