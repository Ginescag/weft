# Telar 🧵

**Un telar para aprender — teje conceptos en un grafo y estúdialos con IA.**

[English](./README.md) · [Español](./README.es.md) — [HOWTO](./HOWTO.es.md) · [Contribuir](./CONTRIBUTING.md)

![license: MIT](https://img.shields.io/badge/license-MIT-7A2E3A) ![node](https://img.shields.io/badge/node-%3E%3D20-3E6B54)

Telar es una **herramienta de aprendizaje local-first**: un "arnés de IA para
aprender usando IA". Creas un proyecto de aprendizaje y Telar dibuja su **grafo de
conceptos** y su material (lecciones, ejemplos, tests, retos, flashcards) en el
navegador. Una IA lee tu grafo y escribe material nuevo a través de un **servidor
MCP** — todo queda en disco como `.md` / `.json`, que es siempre la fuente de la
verdad.

El lenguaje de diseño es **"bordado sobre lino"**: la pantalla es lino visto desde
arriba, los conceptos son **cabezas de aguja**, y los prerrequisitos son **hilos
de burdeos tensos**. La intensidad se gasta en un solo sitio — el grafo; todo lo
demás permanece en calma.

> Capturas próximamente — ejecútalo en local para ver el telar.

## Características

- **Lienzo del grafo** — conceptos-aguja sobre lino, hilos para `requiere`
  (sólido) y `relacionado_con` (discontinuo), zoom suave, búsqueda con `Ctrl+K`,
  añadir conceptos, dibujar relaciones, selección por caja, **notas adhesivas como
  regiones** (color hex libre con rueda de color) y **flechas de roadmap** gruesas.
  La disposición persiste entre cargas.
- **Pantallas de concepto** — Lecciones, Ejemplos, Tests (con línea temporal de
  errores registrados), Retos (con bloc de solución), Flashcards y Notas.
- **PDFs en la app** — suelta un `.pdf` en `lessons/` o `examples/` de un concepto
  y léelo renderizado página a página (PDF.js), sin descargar.
- **IA por MCP** — el servidor `telar mcp` permite que un asistente (Claude Code /
  Claude Desktop) lea el grafo y escriba lecciones, tests, flashcards, roadmaps
  completos y la disposición del lienzo — con la misma validación que la web.
  Incluye **prompts** reutilizables y una **skill**.
- **Local-first** — sin base de datos. Si el servidor muere, tu trabajo sobrevive
  como ficheros bajo `TELAR-MASTER/`.

## Inicio rápido

**Requisitos:** Node.js **20+**.

```bash
git clone <url-de-tu-fork> telar
cd telar
npm install
npm run seed     # crea un TELAR-MASTER/ inicial desde examples/starter-master
npm run dev      # Vite en :5173, API en :3131
```

Abre **http://localhost:5173**.

> En una máquina cuyo HTTPS intercepta el antivirus, `npm install` puede fallar
> con `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. Mira [CONTRIBUTING.md](./CONTRIBUTING.md#installing-dependencies)
> para el arreglo con `--cafile`.

### Producción (un solo proceso)

```bash
npm run build    # compila frontend + server a dist/
npm run serve    # o: node bin/telar.js — sirve la app compilada + API en :3131
```

### Úsalo como comando global

Instala `telar` una vez y ejecútalo desde **cualquier** carpeta — recuerda tu
proyecto, así que no necesitas el código abierto para estudiar. Telar aún no está
en npm, así que se instala desde el código:

```bash
npm install
npm run build
npm link            # pone `telar` en tu PATH (o: npm install -g .)
```

Luego, desde cualquier sitio:

```
telar               abre el menú interactivo (iniciar · mover proyecto · salir)
telar serve         arranca el servidor directamente
telar stop          detiene un servidor en marcha (alias: telar close)
telar path [dir]    muestra / cambia dónde vive tu TELAR-MASTER
telar skill install instala la skill de Claude Code en ~/.claude/skills
telar mcp           arranca el servidor MCP (para herramientas de IA)
telar help
```

El primer `telar` sin proyecto guardado te pide una carpeta, crea ahí
`TELAR-MASTER` y la recuerda. Guía completa del CLI (instalar, primer arranque,
actualizar, desinstalar) en **[HOWTO.es.md §5](./HOWTO.es.md#5-usa-telar-como-cli-instálalo-una-vez-úsalo-desde-cualquier-sitio)**.

## Manéjalo con IA (MCP)

Apunta un cliente MCP a `telar mcp`. En **Claude Code**:

```bash
claude mcp add telar -- node /ruta/absoluta/a/telar/bin/telar.js mcp
```

En **Claude Desktop**, añade una entrada `telar` a `mcpServers` en
`claude_desktop_config.json`.

El asistente puede entonces leer tu grafo (`telar://graph`, `telar://errors`, …) y
escribir en él con tools (`build_subgraph`, `create_lesson`, `add_questions`, …).
Además incluye:

- **Prompts** — flujos de un clic: `build_roadmap`, `fill_concept`,
  `teach_concept`, `quiz_me`, `expand_concept`, `review_mistakes`. En Claude Code
  son slash-commands (`/mcp__telar__build_roadmap`); en Claude Desktop están bajo
  el menú **+**.
- **Una skill de Claude Code** — enseña todo el flujo y se autocarga en el repo;
  `telar skill install` la deja disponible en cualquier sesión.

Guía completa (recursos, tools, prompts, la skill) en
**[HOWTO.es.md §4](./HOWTO.es.md#4-manéjalo-con-ia-mcp)**.

## Estructura del proyecto

```
telar/
├── frontend/            Vite + React + TS (pantallas de grafo y concepto)
├── server/              backend Hono + servidor MCP (capa de ficheros en master.ts)
├── bin/telar.js         punto de entrada del CLI
├── examples/            starter-master/ — el seed para `npm run seed`
├── .claude/skills/      la skill de Telar (viaja con el paquete)
├── IA-DOCS/             docs internas de diseño en español (TELAR_PLAN, BACKEND_PLAN, MCP)
├── HOWTO.md             guía de uso (EN)  ·  HOWTO.es.md (ES)
└── CLAUDE.md            guía para Claude Code trabajando en este repo
```

`TELAR-MASTER/` (tu proyecto real de aprendizaje) está **fuera de git** — créalo
con `npm run seed`, o apunta Telar al tuyo con `telar path <dir>`.

## Documentación

- **[HOWTO.es.md](./HOWTO.es.md)** / **[HOWTO.md](./HOWTO.md)** — la guía de uso completa.
- **[IA-DOCS/](./IA-DOCS/README.md)** — las docs internas de diseño y de "cómo se
  construyó" (español).
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** — entorno de desarrollo, estilo y cómo
  enviar un PR.

## Contribuir

¡Las contribuciones son bienvenidas! Lee primero [CONTRIBUTING.md](./CONTRIBUTING.md)
y nuestro [Código de Conducta](./CODE_OF_CONDUCT.md).

## Licencia

[MIT](./LICENSE) © 2026 Ginés
