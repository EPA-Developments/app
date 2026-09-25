# Teleconsulta (módulo vendorizado)

Copia local de los paquetes del monorepo
[EPA-Developments/plan-bienestar-100-dias](https://github.com/EPA-Developments/plan-bienestar-100-dias)
(no publicados en npm todavía):

| Carpeta | Origen en el monorepo |
| --- | --- |
| `teleconsulta-core/` | `packages/teleconsulta-core/src` |
| `teleconsulta-react/` | `packages/teleconsulta-react/src` |

Los imports de la app son `@epa/teleconsulta-core` y `@epa/teleconsulta-react`: los
alias viven en `tsconfig.json` (`paths`) y `vite.config.ts` (`resolve.alias`). El día
que los paquetes se publiquen en npm, basta con instalarlos, borrar esta carpeta y
quitar los alias.

Los cambios de estado de un turno (pagar, mover, cancelar, entrar) pasan por los bots
`epa-teleconsulta-*` del servidor; la puesta en marcha (Jitsi, Mercado Pago, secrets,
AccessPolicy del paciente) está en
[docs/teleconsulta.md](https://github.com/EPA-Developments/plan-bienestar-100-dias/blob/main/docs/teleconsulta.md).

## Cómo actualizar la copia

```bash
git clone https://github.com/EPA-Developments/plan-bienestar-100-dias /tmp/pb
rm -rf src/vendor/teleconsulta/teleconsulta-core src/vendor/teleconsulta/teleconsulta-react
cp -r /tmp/pb/packages/teleconsulta-core/src src/vendor/teleconsulta/teleconsulta-core
cp -r /tmp/pb/packages/teleconsulta-react/src src/vendor/teleconsulta/teleconsulta-react
```

No editar a mano dentro de esta carpeta: los cambios se hacen en el monorepo y se
re-sincronizan.
