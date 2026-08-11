# Weft — HOWTO

Guía por tareas para ejecutar y usar Weft. Para una visión rápida, mira el
[README](./README.es.md). English: [HOWTO.md](./HOWTO.md).

---

## 1. Instalar y ejecutar

**Requisitos:** Node.js 20+.

```bash
npm install
npm run seed     # solo la primera vez — crea WEFT-MASTER/ desde el ejemplo inicial
```

### Desarrollo (dos servidores, recarga en caliente)

```bash
npm run dev
```

- Frontend (Vite): **http://localhost:5173**
- Backend (API Hono): **http://localhost:3131**

El frontend hace proxy de `/api` al backend, y el backend de dev lee
`../WEFT-MASTER`. Abre :5173.

### Producción (un proceso lo sirve todo)

```bash
npm run build
npm run serve        # == node bin/weft.js
```

Un proceso sirve la app compilada **y** la API en :3131 (abre esa URL). Los deep
links funcionan al recargar (fallback SPA).

---

## 2. Tu proyecto de aprendizaje (`WEFT-MASTER/`)

Un proyecto es una carpeta de conceptos en disco. Hay tres formas de conseguir uno:

- **`npm run seed`** — copia `examples/starter-master/` a `WEFT-MASTER/` (un
  pequeño roadmap de RAG: embeddings → chunking / retrieval → rag). No hace nada si
  ya existe.
- **Primer arranque gestionado** — ejecuta `weft` (sin args) sin proyecto guardado
  y te pide una carpeta **padre**, crea `<padre>/WEFT-MASTER` y la recuerda.
- **Apuntar al tuyo** — `weft path <dir>` fija `<dir>/WEFT-MASTER` (se crea si no
  existe, se adopta si ya contiene un proyecto). `weft path` imprime la ubicación
  actual.

Todo vive **dentro** de la carpeta master, así el proyecto es autocontenido y
portable (como `.git` en un repo):

```
WEFT-MASTER/
├── <concepto>/
│   ├── .meta            id, nombre, resumen, relaciones (prerrequisitos)
│   ├── .errorlog        errores registrados
│   ├── tests.json       preguntas de opción múltiple
│   ├── flashcard.json   flashcards
│   ├── lessons/  examples/  challenges/  notes/   (.md; lessons/examples aceptan .pdf)
│   └── <subconcepto>/   anidado, misma estructura
└── .weft/              graph.json (caché) + stickies.json, arrows.json, layout.json
```

> Las `relaciones` de un concepto son **sus propios prerrequisitos**. `A requiere
> B` dibuja un hilo sólido `B → A`; `relacionado_con` uno discontinuo.

---

## 3. Usar el grafo

- **Explorar** — desplaza (arrastra el lino), zoom (rueda), **Fit** para encuadrar
  todo. Pasa el ratón por una aguja para su resumen; haz clic para abrir el concepto.
- **Buscar** — `Ctrl+K` abre la paleta; escribe para saltar a cualquier concepto.
- **Añadir concepto** — botón *Add concept*; nombre y resumen.
- **Dibujar hilo** — entra en modo dibujo, arrastra aguja → aguja y elige `requiere`
  o `relacionado_con`.
- **Seleccionar y editar** — `Shift`+arrastrar selecciona por caja agujas / hilos /
  stickies. Toca un hilo para **cortarlo** (Supr/Retroceso). Arrastrar en grupo
  mueve la selección.
- **Notas adhesivas** — añade una sticky de lino desde el botón del lienzo para
  etiquetar una región; es un título grande + cuerpo opcional, **redimensionable
  por el tirador de la esquina**, color con **rueda de color** (hex libre). Doble
  clic para editar. Las stickies van *bajo* las agujas y nunca navegan.
- **Flechas de roadmap** — añade una flecha dirigida gruesa (`+ arrow`) como
  pegatina libre entre regiones; arrastra sus extremos, doble clic en el punto medio
  para color/grosor, Supr para eliminar.

Las posiciones de las agujas, stickies y flechas persisten en `.weft/`, así tu
disposición es estable entre recargas.

### Dentro de un concepto

Seis pestañas: **Lessons**, **Examples**, **Tests**, **Challenges**, **Flashcards**,
**Notes**.

- **Tests** — responde y comprueba; cada fallo se registra en `.errorlog`. La línea
  temporal de **Mistakes** (`/errors`) del grafo muestra todos los errores, del más
  reciente al más antiguo, con la respuesta correcta + explicación.
- **Challenges** — lee el enunciado y escribe tu intento en el bloc de solución
  integrado (se guarda en `challenges/.solutions/`).
- **Notes** — crea tus propias notas en markdown.

### Leer PDFs

Suelta un `.pdf` en `lessons/` o `examples/` de un concepto. Weft lo renderiza
**en la app**, página a página (PDF.js), con enlace de descarga. (Los `.md` se
muestran como texto formateado, como siempre.)

---

## 4. Manéjalo con IA (MCP)

El servidor MCP (`weft mcp`) expone tu proyecto a un asistente de IA por stdio:
puede **leer** el grafo y **escribir** lecciones, ejemplos, tests, flashcards,
roadmaps completos y la disposición del lienzo — con la misma validación que la web.

### Claude Code

```bash
claude mcp add weft -- node /ruta/absoluta/a/weft/bin/weft.js mcp
```

En una sesión de Claude Code, las tools aparecen como `mcp__weft__*` y los prompts
como slash-commands (escribe `/` y filtra `weft`). Instala la skill para que Claude
cargue el flujo de Weft en cualquier sitio:

```bash
weft skill install      # copia la skill en ~/.claude/skills/weft
```

### Claude Desktop

Edita `claude_desktop_config.json` (Ajustes → Developer → Edit Config) y añade:

```json
{
  "mcpServers": {
    "weft": {
      "command": "node",
      "args": ["/ruta/absoluta/a/weft/bin/weft.js", "mcp",
               "--master", "/ruta/absoluta/a/WEFT-MASTER"]
    }
  }
}
```

Usa `node` + ruta absoluta (robusto en Windows). Cierra del todo y reabre Claude
Desktop; las tools salen en el menú de herramientas y los prompts en el menú **+**.

> **Nota:** el servidor MCP corre el `server/dist` compilado, así que ejecuta
> `npm run build` antes de usar `weft mcp` desde un clon.

### Qué puede ver y hacer la IA

Una vez conectado, Weft le da al asistente:

- **Recursos (lectura):** `weft://graph` (todos los conceptos + relaciones),
  `weft://concept/{id}`, `weft://concept/{id}/{folder}/{file}` (un fichero),
  `weft://errors` (todos los errores registrados) y el lienzo —
  `weft://stickies`, `weft://layout`, `weft://arrows`.
- **Tools (escritura):** montar un tema entero en una llamada (`build_subgraph`);
  conceptos y relaciones sueltos (`create_concept`, `add_relation`,
  `add_relations`, `remove_relation`, `update_concept`); contenido
  (`create_lesson` / `create_example` / `create_challenge` / `create_note`,
  `edit_lesson`, `add_questions`, `add_flashcards`, `log_error`); y la disposición
  del lienzo (`set_positions`, `create_sticky` / `update_sticky` /
  `delete_sticky`, `create_arrow` / `update_arrow` / `delete_arrow`).

Cada escritura queda como `.md` / `.json` real bajo `WEFT-MASTER/`, con la misma
validación que la web.

### Prompts (flujos de un clic)

Los prompts son **flujos reutilizables que el servidor ofrece a tu cliente** —
eliges uno e inyecta una instrucción lista (qué recursos leer, qué tools llamar),
para que el asistente haga toda la tarea por ti.

**Cómo invocarlos:**

- **Claude Code** — escribe `/` y elige `mcp__weft__<nombre>` (p. ej.
  `/mcp__weft__build_roadmap`), y pasa el argumento (el tema o el concepto).
- **Claude Desktop** — pulsa el botón **+** (adjuntar) → **weft** → elige el
  prompt → rellena sus argumentos.
- Tras añadir o cambiar prompts, **reconecta / reinicia el servidor MCP** en tu
  cliente para que los recargue (ejecuta `/mcp` en Claude Code, o reinicia la app).

| Prompt | Argumento(s) | Qué hace |
| --- | --- | --- |
| `build_roadmap` | `tema`, `enfoque?` | Diseña y crea un mapa de tema completo de una vez (`build_subgraph` + disposición + stickies de región). |
| `fill_concept` | `concepto` | Redacta y guarda una lección, un ejemplo trabajado y unas preguntas de test. |
| `teach_concept` | `concepto` | Enseña el concepto desde su material y comprueba tu comprensión. |
| `quiz_me` | `concepto` | Te examina desde el concepto y guarda las buenas preguntas. |
| `expand_concept` | `concepto` | Propone y añade los prerrequisitos / subtemas que faltan. |
| `review_mistakes` | — | Repasa `weft://errors` y te reexamina lo fallado. |

**Qué pasa al ejecutar uno:** el prompt deja la guía en el chat, y entonces el
asistente lee los recursos `weft://` pertinentes y llama a las tools de escritura
para hacer el trabajo — tú solo confirmas. Ni siquiera *necesitas* los prompts:
con las tools conectadas, el lenguaje natural también vale ("móntame un roadmap de
Kafka", "rellena el concepto `rag`").

### La skill

Una **skill** es un conjunto de instrucciones empaquetado que **Claude Code carga
automáticamente cuando es relevante** — aquí, todo el flujo de Weft por MCP (lee
primero el grafo, monta un tema con `build_subgraph`, rellena conceptos, cura
relaciones, ordena el lienzo) más las convenciones que mantienen un grafo limpio
(ids en slug, un prerrequisito principal por concepto, colores hex). Así no tienes
que reexplicar cómo manejar Weft en cada sesión.

- Viaja en el repo en **`.claude/skills/weft/SKILL.md`** y se carga sola siempre
  que uses Claude Code **dentro del proyecto**.
- Para usarla en **cualquier sitio** (cualquier carpeta, no solo el repo),
  instálala en tus skills personales:

  ```bash
  weft skill install     # la copia a ~/.claude/skills/weft/
  ```

  (Hace falta porque `npm install` deja el fichero bajo `node_modules`, que Claude
  Code nunca escanea — la skill tiene que vivir en `~/.claude/skills/`.)
- Abre una sesión **nueva** de Claude Code tras instalarla para que la recoja.

> La skill es una funcionalidad de **Claude Code**. **Claude Desktop** tiene su
> propio sistema de skills, aparte, y *no* lee `~/.claude/skills/` — allí, los
> **prompts** de arriba son el equivalente de flujos de un clic.

---

## 5. Usa Weft como CLI (instálalo una vez, úsalo desde cualquier sitio)

La forma más cómoda de convivir con Weft es como el **comando `weft`**:
instálalo una vez y a partir de ahí lo ejecutas desde *cualquier* carpeta —
recuerda tu proyecto, así que no necesitas tener el código abierto para estudiar.

### Instalar el comando `weft` globalmente

Weft aún no está publicado en npm, así que se instala **desde el código**:

```bash
git clone <url-de-tu-fork> weft
cd weft
npm install
npm run build          # compila la app que sirve el CLI
npm link               # pone `weft` en tu PATH (symlink a este clon)
```

- **`npm link`** enlaza el `weft` global a tu clon, así un futuro `git pull` +
  `npm run build` lo actualiza en el sitio — ideal si además tocas Weft.
- **`npm install -g .`** instala una copia independiente (su `prepack` compila por
  ti). Úsalo si solo quieres la herramienta, no el código.

Comprueba que funciona desde cualquier sitio:

```bash
weft help
```

> Cuando Weft se publique en npm, esto será una línea: `npm install -g weftjs`
> (o ejecútalo sin instalar con `npx weftjs`).

### Primer arranque — crea un proyecto en cualquier sitio

Desde **cualquier** carpeta:

```bash
weft
```

Sin proyecto guardado, Weft te pide una carpeta **padre**, crea
`<padre>/WEFT-MASTER` dentro, recuerda la ubicación y abre el menú. Elige
**Start Weft** (o ejecuta `weft serve`) y abre **http://localhost:3131**.

Esa ubicación se guarda por usuario, así que cada `weft` futuro reabre el mismo
proyecto — sin `--master` y sin estar en el repo.

### Comandos del día a día (desde cualquier carpeta)

```
weft                 menú interactivo: Start Weft · Move project · Quit
weft serve           arranca el servidor; abre http://localhost:3131
  --port <n>            escucha en otro puerto (por defecto 3131)
  --master <dir>        usa <dir> solo en esta ejecución (no se guarda)
weft stop | close    detiene un servidor en marcha y libera el puerto
weft path            muestra dónde vive tu WEFT-MASTER ahora
weft path <dir>      mueve / apunta Weft a <dir>/WEFT-MASTER
weft skill install   instala la skill de Claude Code en ~/.claude/skills
weft mcp             arranca el servidor MCP (normalmente lo lanza tu cliente de IA)
weft help
```

Mientras sirve, Weft toma la terminal con un dashboard a pantalla completa (como
`vim`/`less`); **Ctrl+C** te devuelve a la terminal exacta desde la que lo lanzaste,
con el scrollback intacto. El puntero de tu proyecto vive en
`%APPDATA%/weft/config.json` (Windows) o `~/.config/weft/config.json`.

### Actualizar y desinstalar

- **Enlazado desde el código:** `git pull && npm install && npm run build` — el
  enlace sigue funcionando.
- **Copia independiente:** vuelve a ejecutar `npm install -g .` (o `npm i -g weftjs`
  cuando se publique).
- **Quitar:** `npm rm -g weftjs` (usa `npm unlink -g weftjs` si lo instalaste con `npm link`).

### Nota para Windows

El bin global de npm está en tu PATH como un shim `.cmd`, así que `weft` funciona
en PowerShell y CMD. Si sale *"weft is not recognized"*, asegúrate de que la
carpeta bin global de npm (`npm config get prefix`) está en el PATH y abre una
terminal **nueva**.

---

## 6. Dónde vive todo / resolución de problemas

- **Puntero del proyecto** (cuál está activo) — config por usuario en
  `%APPDATA%/weft/config.json` (Windows) o `~/.config/weft/config.json`.
- **Registro del servidor en marcha** — `%APPDATA%/weft/server.json` (lo usa
  `weft stop`).
- **Datos del proyecto** — todo está bajo tu `WEFT-MASTER/`. Borra esa carpeta y
  borras el proyecto; no se guarda nada en ningún otro sitio.
- **"frontend build not found"** — ejecuta `npm run build` antes de `npm run serve`.
- **No se renderiza nada en dev** — asegúrate de que el backend está arriba
  (`npm run dev` arranca ambos); el frontend necesita la API en :3131.
- **Errores TLS en `npm install`** — mira [CONTRIBUTING.md](./CONTRIBUTING.md#installing-dependencies).
