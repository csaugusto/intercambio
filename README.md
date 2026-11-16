# Intercambio Navideño

Página para que la familia escriba lo que le gustaría recibir en el intercambio y
vea lo que pidió la persona a la que le regala. Cada quien entra con **su link
personal** que le llega por WhatsApp: no hay que instalar nada ni crear contraseñas.

- **La página** vive en GitHub Pages (gratis).
- **La información** se guarda en una Hoja de cálculo de Google tuya.
- **Las fotos** se guardan en una carpeta de tu Google Drive.

```
WhatsApp ──link personal──▶ Página (GitHub Pages) ──▶ Apps Script ──▶ Hoja de Google + carpeta de fotos
```

Mientras no la conectes a la hoja, la página funciona en **modo de prueba** con
datos de ejemplo, para que puedas verla y enseñarla.

---

## Instalación (una sola vez, unos 20 minutos)

### 1. Crear la hoja de Google

1. Entra a [sheets.new](https://sheets.new) para crear una hoja nueva y ponle de
   nombre algo como *Intercambio Navideño 2026*.
   > Tiene que ser una **Hoja de cálculo de Google**, no un archivo de Excel
   > (.xlsx) guardado en Drive. Si ya tienes un Excel, ábrelo y usa
   > *Archivo > Guardar como Hojas de cálculo de Google*.
2. En el menú, ve a **Extensiones > Apps Script**.
3. Borra lo que aparece ahí, pega **todo** el contenido del archivo
   [`apps-script/Codigo.gs`](apps-script/Codigo.gs) y guarda (ícono de disquete).
4. Regresa a la pestaña de la hoja y **recárgala**. Aparecerá un menú nuevo
   llamado **Intercambio**.
5. Usa **Intercambio > 1. Preparar las hojas**. La primera vez Google te pide permiso:
   - *Se requiere autorización* > **Continuar** > elige tu cuenta.
   - Si sale *Google no ha verificado esta aplicación*: **Configuración avanzada** >
     **Ir a ... (no seguro)** > **Permitir**.

   Es normal: el código es tuyo y Google avisa porque no lo revisó. Pide permiso
   para usar esta hoja y tu Drive (ahí guarda las fotos).

Se crean tres hojas:

| Hoja | Qué va ahí |
|---|---|
| **Participantes** | Escribe el **Nombre** de cada persona. Lo demás se llena solo. |
| **Deseos** | Las opciones de regalo. La llena la página; no hace falta tocarla. |
| **Configuración** | Título, fecha (si quieres), un mensaje para todos, etc. |

En **Participantes**:

- **Nombre**: como quieras que aparezca (por ejemplo *Abuela Carmen*, *Tío Beto*).
- **Teléfono** (opcional): con lada del país, por ejemplo `52 55 1234 5678`
  (52 es México). Sirve para que el mensaje de WhatsApp se abra directo en su chat.

### 2. Publicar el Apps Script

1. En la pestaña de Apps Script: **Implementar > Nueva implementación**.
2. En el engrane de *Seleccionar tipo*, elige **Aplicación web**.
3. Llena así:
   - *Ejecutar como*: **Yo**
   - *Quién tiene acceso*: **Cualquier usuario**
4. **Implementar** y copia la **URL de la aplicación web** (termina en `/exec`).
5. Ábrela en el navegador para probarla. Debe decir:
   `{"ok":true,"mensaje":"El intercambio está funcionando."}`

> Si después cambias algo en el código de Apps Script, tienes que volver a publicar:
> **Implementar > Gestionar implementaciones >** lápiz **> Versión: Nueva versión >
> Implementar**. La URL no cambia.

### 3. Conectar la página

La página ya está publicada en **https://csaugusto.github.io/intercambio/**
(mientras no se conecte, abre en modo de prueba).

1. Pega la URL del Apps Script en [`js/config.js`](js/config.js) y sube el cambio a GitHub:
   ```js
   window.INTERCAMBIO = {
     apiUrl: 'https://script.google.com/macros/s/.../exec'
   };
   ```
2. En la hoja **Configuración**, en *Link de la página*, pon
   `https://csaugusto.github.io/intercambio/`.

### 4. Mandar los links por WhatsApp

1. En la hoja usa **Intercambio > 2. Generar links personales**.
2. En la columna **Mandar por WhatsApp** toca *Enviar a ...* de cada persona: se abre
   WhatsApp con el mensaje ya escrito y su link. Solo dale enviar.
3. Antes de mandarlos, prueba tu propio link.

---

## Preguntas frecuentes

**Alguien perdió su link.** Búscalo en la columna *Link personal* y mándaselo otra vez.
Su lista no se pierde.

**Alguien compartió su link con otra persona.** Borra el contenido de su celda *Clave*
y usa *Generar links personales*. Se crea un link nuevo y el viejo deja de funcionar.

**Quiero agregar a alguien después.** Escribe su nombre en *Participantes*: se le
genera su clave sola. Luego usa *Generar links personales* y mándale el suyo.

**¿Dónde quedan las fotos?** En la carpeta *Intercambio - fotos*, junto a tu hoja en
Drive. Cuando alguien cambia o borra una foto, la vieja se va a la papelera.

**¿Quién puede ver qué?** Solo quien tenga un link personal puede entrar. Adentro,
todos pueden ver las listas de todos, y nadie se entera de qué listas abrió cada
quien. El sorteo no se guarda en ningún lado: cada quien busca en la lista a la
persona que le tocó.

**¿Es pública la información?** El código de la página está en GitHub, pero ahí no hay
nombres ni datos de la familia: todo eso vive en tu hoja de Google.

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
