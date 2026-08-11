export const DEMO_MARKDOWN = `# Visualizador de Markdown con Mermaid

Este es un **documento de ejemplo**. Puedes editar el texto de la izquierda y la vista previa se actualizará al instante.

## Características

- Markdown con resaltado de sintaxis
- Diagramas **Mermaid** renderizados a SVG
- Carga de archivos \`.md\` por botón o **arrastrar y soltar**
- HTML saneado con DOMPurify

## Tabla de ejemplo

| Tipo        | Descripción                  |
| ----------- | ---------------------------- |
| flowchart   | Diagramas de flujo           |
| sequence    | Diagramas de secuencia       |
| gantt       | Diagramas de Gantt           |

## Código con resaltado

\`\`\`ts
interface Usuario {
  nombre: string
  plan: 'pro' | 'gratis'
}

const saludar = (u: Usuario): string => \`Hola, \${u.nombre}\`
\`\`\`

## Flowchart

\`\`\`mermaid
flowchart TD
    A[Inicio] --> B{¿Tiene cuenta?}
    B -- Sí --> C[Iniciar sesión]
    B -- No --> D[Registrarse]
    C --> E[Panel]
    D --> E
\`\`\`

## Diagrama de secuencia

\`\`\`mermaid
sequenceDiagram
    participant U as Usuario
    participant S as Servidor
    U->>S: GET /api/documento
    S-->>U: 200 markdown
    U->>S: POST /api/render
    S-->>U: diagrama SVG
\`\`\`

## Diagrama de clases

\`\`\`mermaid
classDiagram
    class Documento {
        +titulo: string
        +contenido: string
        +render() string
    }
    class Diagrama {
        +fuente: string
        +svg: string
    }
    Documento --> Diagrama : contiene
\`\`\`

## Diagrama de Gantt

\`\`\`mermaid
gantt
    title Plan del proyecto
    dateFormat YYYY-MM-DD
    section Diseño
    Maquetación       :a1, 2026-08-01, 5d
    Revisión          :a2, after a1, 3d
    section Desarrollo
    Componentes       :a3, after a2, 7d
    Integración       :a4, after a3, 4d
\`\`\`

## Gráfico circular

\`\`\`mermaid
pie showData
    title Uso del editor
    "Markdown" : 60
    "Mermaid" : 25
    "Otros" : 15
\`\`\`

## Cita

> Los diagramas son una forma excelente de comunicar arquitectura y flujos.
`
