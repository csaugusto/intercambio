# Intercambio Navideño

Página para que la familia escriba lo que le gustaría recibir en el intercambio y
vea lo que pidió la persona a la que le regala.

**Link para la familia:** https://csaugusto.github.io/intercambio/

- Todos entran con **el mismo link**, que se manda al grupo de WhatsApp.
- La primera vez, cada quien toca su nombre en la lista (o lo escribe si no
  aparece). El celular lo recuerda y ya no lo vuelve a preguntar.
- Todos pueden ver las listas de todos, así nadie se entera de a quién le regala
  cada quien. El sorteo no se guarda en ningún lado.
- **La información** se guarda en una Hoja de cálculo de Google del organizador,
  y **las fotos** en una carpeta de su Google Drive.

```
WhatsApp ──link──▶ Página (GitHub Pages) ──▶ Apps Script ──▶ Hoja de Google + carpeta de fotos
```

Si en [`js/config.js`](js/config.js) no hay URL de Apps Script, la página funciona
en **modo de prueba** con datos de ejemplo.

---

## Instalación (una sola vez)

### 1. Crear la hoja de Google

1. Entra a [sheets.new](https://sheets.new) para crear una hoja nueva.
   > Tiene que ser una **Hoja de cálculo de Google**, no un archivo de Excel (.xlsx).
2. Ve a **Extensiones > Apps Script**, borra lo que aparece, pega **todo** el
   contenido de [`apps-script/Codigo.gs`](apps-script/Codigo.gs) y guarda.
3. Regresa a la hoja, recárgala y usa **Intercambio > Preparar las hojas**.
   La primera vez Google pide permiso: *Continuar* > tu cuenta >
   *Configuración avanzada* > *Ir a Intercambio (no seguro)* > *Permitir*.
   Es normal: el código es tuyo y Google avisa porque no lo revisó.

Se crean tres hojas:

| Hoja | Qué va ahí |
|---|---|
| **Participantes** | ID, Nombre y Foto. Puedes escribir los nombres tú, o dejar que cada quien se agregue desde la página. El ID y la foto se ponen desde la página. |
| **Deseos** | Las opciones de regalo. La llena la página. |
| **Configuración** | Título, fecha (si quieres), un mensaje para todos y quién ayuda. |

### 2. Publicar el Apps Script

1. En Apps Script: **Implementar > Nueva implementación > engrane > Aplicación web**.
2. *Ejecutar como*: **Yo**. *Quién tiene acceso*: **Cualquier usuario**.
3. **Implementar** y copia la URL que termina en `/exec`.
4. Pégala en [`js/config.js`](js/config.js) y sube el cambio a GitHub.

### 3. Mandar el link

Manda https://csaugusto.github.io/intercambio/ al grupo de WhatsApp de la familia.

---

## Si cambias el código de Apps Script

Pega el código nuevo en Apps Script, guarda y vuelve a publicar:
**Implementar > Gestionar implementaciones >** lápiz **> Versión: Nueva versión >
Implementar**. La URL no cambia.

## Preguntas frecuentes

**¿Cómo se pone la foto de alguien?** En la página de esa persona (tocando su nombre)
hay un botón *Poner su foto*. Cualquiera puede ponerla o cambiarla, así se le puede
poner la foto a los abuelos. Cada quien también tiene *Poner mi foto* en su inicio.
Quien no tiene foto aparece con la inicial de su nombre.

**Alguien eligió el nombre equivocado.** Abajo de su saludo tiene *Elegir otro nombre*.

**Alguien se agregó dos veces o con el nombre mal escrito.** Corrígelo o bórralo en
la hoja *Participantes*. Si borras a alguien, sus opciones se quedan en la hoja
*Deseos* pero ya no se muestran.

**¿Dónde quedan las fotos?** En la carpeta *Intercambio - fotos*, junto a tu hoja en
Drive (las de las personas se llaman *Foto de ...*). Cuando alguien cambia o borra
una foto, la vieja se va a la papelera.

**¿Quién puede ver la información?** Cualquiera que tenga el link. La página no
aparece en buscadores. En GitHub solo está el código: los nombres, las opciones y
las fotos viven en tu hoja de Google.

**Tarda un poquito en cargar la primera vez.** Es normal: Google tarda 2 o 3 segundos
en "despertar" el Apps Script. Después la página recuerda la información y abre al
instante.

**¿Cuántas opciones puede poner cada quien?** Se les pide al menos 3; el máximo es 12.

---

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | La página |
| `css/estilos.css` | Colores, letras y tamaños |
| `js/app.js` | Todo el funcionamiento de la página (incluye el modo de prueba) |
| `js/config.js` | La URL del Apps Script |
| `apps-script/Codigo.gs` | El código que va dentro de la hoja de Google |
| `img/` | Ícono e imagen de vista previa para WhatsApp |
