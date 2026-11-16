/**
 * Intercambio navideño: el "servidor" de la página.
 *
 * Vive dentro de la Hoja de Google (Extensiones > Apps Script) y se publica
 * como "Aplicación web". La página de GitHub le habla a esta URL para leer y
 * guardar las opciones de regalo.
 *
 * Hojas que usa (las crea el menú "Intercambio > Preparar las hojas"):
 *   - Participantes: una fila por persona (ID, Nombre y Foto). Puedes escribir
 *     los nombres tú, o cada quien se agrega solo desde la página. El ID y la
 *     foto se ponen desde la página.
 *   - Deseos: una fila por cada opción de regalo. La llena la página.
 *   - Configuración: título, fecha (opcional), mensaje y quién ayuda.
 *
 * Todos entran con el mismo link. La primera vez, cada quien toca su nombre y
 * el celular lo recuerda. El sorteo no se guarda aquí: todos ven todas las
 * listas, así nadie se entera de a quién le regala cada quien.
 */

var HOJA_PARTICIPANTES = 'Participantes';
var HOJA_DESEOS = 'Deseos';
var HOJA_CONFIG = 'Configuración';

var MAX_DESEOS_POR_PERSONA = 12;
var MAX_TEXTO = 1500;
var MAX_LINK = 2000;
var MAX_FOTO_BYTES = 6 * 1024 * 1024;
var MAX_NOMBRE = 60;
var MAX_PARTICIPANTES = 200;
var MAX_FOTOS_POR_PEDIDO = 40;

// Encabezados de cada hoja. Se buscan por nombre (sin importar acentos ni
// mayúsculas), así que el organizador puede mover las columnas de lugar.
var COLUMNAS_PARTICIPANTES = [
  { clave: 'id', titulo: 'ID' },
  { clave: 'nombre', titulo: 'Nombre' },
  { clave: 'foto', titulo: 'Foto' }
];

var COLUMNAS_DESEOS = [
  { clave: 'id', titulo: 'ID' },
  { clave: 'participante', titulo: 'Participante' },
  { clave: 'nombre', titulo: 'Nombre' },
  { clave: 'descripcion', titulo: 'Descripción' },
  { clave: 'link', titulo: 'Link' },
  { clave: 'foto', titulo: 'Foto' },
  { clave: 'orden', titulo: 'Orden' },
  { clave: 'actualizado', titulo: 'Actualizado' }
];

var CONFIG_INICIAL = [
  ['Título', 'Intercambio Navideño 2026'],
  ['Fecha del intercambio', ''],
  ['Mensaje para todos', ''],
  ['Quién ayuda', '']
];

/* ------------------------------------------------------------------ */
/* Entradas de la aplicación web                                       */
/* ------------------------------------------------------------------ */

function doGet(e) {
  return responder_(function () {
    var p = (e && e.parameter) || {};
    var accion = p.accion || '';
    if (!accion) {
      return { ok: true, mensaje: 'El intercambio está funcionando.' };
    }
    if (accion === 'datos') return accionDatos_();
    if (accion === 'foto') return accionFoto_(p.id);
    if (accion === 'fotos') return accionFotos_(p.ids);
    throw new ErrorUsuario_('Acción desconocida.');
  });
}

function doPost(e) {
  return responder_(function () {
    var cuerpo;
    try {
      cuerpo = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    } catch (err) {
      throw new ErrorUsuario_('No se entendió la petición.');
    }
    if (cuerpo.accion === 'registrar') return accionRegistrar_(cuerpo);
    if (cuerpo.accion === 'fotoPersona') return accionFotoPersona_(cuerpo);
    var yo = participante_(cuerpo.participante);
    if (cuerpo.accion === 'guardar') return accionGuardar_(yo, cuerpo);
    if (cuerpo.accion === 'borrar') return accionBorrar_(yo, cuerpo);
    throw new ErrorUsuario_('Acción desconocida.');
  });
}

/*
 * Revision de acentos. Si el codigo se pega con los acentos danados (por
 * ejemplo la n con tilde aparece como dos simbolos raros), la hoja ya no
 * encuentra la pestana de Configuracion ni la columna de Descripcion, y las
 * opciones se guardarian sin texto. Por eso se revisa antes de hacer
 * cualquier cosa. Este comentario y el mensaje van sin acentos a proposito,
 * para que se lean aunque pase eso.
 */
var PRUEBA_ACENTOS = 'ñ';

function revisarAcentos_() {
  if (PRUEBA_ACENTOS !== '\u00f1') {
    throw new ErrorUsuario_('El codigo de la hoja se pego con los acentos danados. ' +
      'Hay que volver a copiarlo y pegarlo en Apps Script, y publicar una nueva version.', 'acentos');
  }
}

function responder_(fn) {
  var resultado;
  try {
    revisarAcentos_();
    resultado = fn();
  } catch (err) {
    if (err && err.esDeUsuario) {
      resultado = { ok: false, error: err.message, codigo: err.codigo || '' };
    } else {
      console.error(err && err.stack ? err.stack : err);
      resultado = { ok: false, error: 'Algo salió mal del lado de la hoja. Intenta otra vez en un momento.' };
    }
  }
  return ContentService.createTextOutput(JSON.stringify(resultado))
    .setMimeType(ContentService.MimeType.JSON);
}

function ErrorUsuario_(mensaje, codigo) {
  // Se devuelve un Error real para que, si sale en el menú de la hoja, se lea bien.
  var err = new Error(mensaje);
  err.codigo = codigo;
  err.esDeUsuario = true;
  return err;
}

/* ------------------------------------------------------------------ */
/* Acciones                                                            */
/* ------------------------------------------------------------------ */

/** Busca a la persona que eligió su nombre en la página. */
function participante_(id) {
  id = String(id || '').trim();
  if (id) {
    var lista = leerParticipantes_();
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i];
  }
  throw new ErrorUsuario_('No te encontramos en la lista. Vuelve a elegir tu nombre.', 'sin-participante');
}

/** Agrega a alguien que no estaba en la lista (o devuelve a quien ya tenía ese nombre). */
function accionRegistrar_(cuerpo) {
  var nombre = String(cuerpo.nombre || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NOMBRE);
  if (!nombre) throw new ErrorUsuario_('Escribe tu nombre.');
  asegurarIds_(true);
  var candado = esperarCandado_('');
  try {
    var hoja = obtenerHoja_(HOJA_PARTICIPANTES);
    var tabla = leerTabla_(hoja, COLUMNAS_PARTICIPANTES);
    var ix = tabla.indices;
    var buscado = normalizar_(nombre);
    var usados = [];
    var cuantos = 0;
    for (var i = 0; i < tabla.filas.length; i++) {
      var n = celda_(tabla.filas[i], ix.nombre);
      var id = celda_(tabla.filas[i], ix.id);
      if (id) usados.push(String(id));
      if (!n) continue;
      cuantos++;
      if (id && normalizar_(n) === buscado) return { ok: true, persona: { id: String(id), nombre: n } };
    }
    if (cuantos >= MAX_PARTICIPANTES) throw new ErrorUsuario_('Ya no caben más personas en la lista.');
    var nueva = { id: nuevoId_('p', usados), nombre: nombre };
    var fila = [];
    for (var j = 0; j < tabla.ancho; j++) fila.push('');
    ponerEnFila_(fila, ix, nueva);
    hoja.appendRow(fila);
    return { ok: true, persona: nueva };
  } finally {
    candado.releaseLock();
  }
}

/**
 * Pone ID a los nombres que el organizador escribió a mano en Participantes.
 * El ID es lo que une a cada persona con sus opciones en la hoja Deseos.
 */
function asegurarIds_(conCandado) {
  var hoja = obtenerHoja_(HOJA_PARTICIPANTES);
  var tabla = leerTabla_(hoja, COLUMNAS_PARTICIPANTES);
  var ix = tabla.indices;
  var faltan = tabla.filas.some(function (f) { return celda_(f, ix.nombre) && !celda_(f, ix.id); });
  if (!faltan) return;
  if (ix.id < 0 || ix.nombre < 0) {
    throw new ErrorUsuario_('A la hoja Participantes le faltan columnas. Usa Intercambio > Preparar las hojas.');
  }
  var candado = conCandado ? esperarCandado_('') : null;
  try {
    tabla = leerTabla_(hoja, COLUMNAS_PARTICIPANTES);
    var usados = [];
    tabla.filas.forEach(function (f) { if (celda_(f, ix.id)) usados.push(String(celda_(f, ix.id))); });
    var columna = tabla.filas.map(function (f) {
      var id = celda_(f, ix.id);
      if (celda_(f, ix.nombre) && !id) {
        id = nuevoId_('p', usados);
        usados.push(id);
      }
      return [id];
    });
    if (columna.length) hoja.getRange(2, ix.id + 1, columna.length, 1).setValues(columna);
  } finally {
    if (candado) candado.releaseLock();
  }
}

function accionDatos_() {
  asegurarIds_(true);
  var config = leerConfig_();
  var participantes = leerParticipantes_().filter(function (p) { return p.id; });
  var deseos = leerDeseos_();

  var personas = participantes.map(function (p) {
    var suyos = deseos
      .filter(function (d) { return d.participante === p.id; })
      .sort(function (a, b) { return a.orden - b.orden; })
      .map(deseoPublico_);
    return { id: p.id, nombre: p.nombre, foto: p.foto || '', deseos: suyos };
  });

  return {
    ok: true,
    config: {
      titulo: config.titulo,
      fecha: config.fecha,
      mensaje: config.mensaje,
      ayuda: config.ayuda
    },
    personas: personas
  };
}

/**
 * Solo se sirven fotos que están en la hoja (de una opción de regalo o de una
 * persona). Así nadie puede usar esta URL para leer otros archivos del Drive.
 */
function fotosPermitidas_() {
  var permitidas = {};
  leerDeseos_().forEach(function (d) { if (d.foto) permitidas[d.foto] = true; });
  leerParticipantes_().forEach(function (p) { if (p.foto) permitidas[p.foto] = true; });
  return permitidas;
}

function leerFoto_(fotoId) {
  var blob = DriveApp.getFileById(fotoId).getBlob();
  return { tipo: blob.getContentType(), datos: Utilities.base64Encode(blob.getBytes()) };
}

function accionFoto_(fotoId) {
  fotoId = String(fotoId || '').trim();
  if (!fotoId) throw new ErrorUsuario_('Falta la foto.');
  if (!fotosPermitidas_()[fotoId]) throw new ErrorUsuario_('No se encontró la foto.');
  var foto = leerFoto_(fotoId);
  return { ok: true, tipo: foto.tipo, datos: foto.datos };
}

/** Varias fotos de un jalón (las de las personas, que son chiquitas). */
function accionFotos_(ids) {
  var permitidas = fotosPermitidas_();
  var fotos = {};
  String(ids || '').split(',').slice(0, MAX_FOTOS_POR_PEDIDO).forEach(function (id) {
    id = id.trim();
    if (!id || !permitidas[id] || fotos[id]) return;
    try {
      fotos[id] = leerFoto_(id);
    } catch (err) {
      console.warn('No se pudo leer la foto ' + id + ': ' + err);
    }
  });
  return { ok: true, fotos: fotos };
}

/** Pone, cambia o quita la foto de una persona. Cualquiera puede hacerlo. */
function accionFotoPersona_(cuerpo) {
  var id = String(cuerpo.persona || '').trim();
  var persona = null;
  leerParticipantes_().forEach(function (p) { if (p.id && p.id === id) persona = p; });
  if (!persona) throw new ErrorUsuario_('No se encontró a esa persona. Recarga la página.');
  var quitar = !!cuerpo.quitar;
  if (!quitar && !(cuerpo.foto && cuerpo.foto.datos)) throw new ErrorUsuario_('Falta la foto.');

  var nueva = quitar ? '' : guardarFoto_({ tipo: cuerpo.foto.tipo, datos: cuerpo.foto.datos, persona: true }, persona);
  var vieja = '';
  var candado = esperarCandado_(nueva);
  try {
    var hoja = obtenerHoja_(HOJA_PARTICIPANTES);
    var tabla = leerTabla_(hoja, COLUMNAS_PARTICIPANTES);
    if (tabla.indices.foto < 0) {
      // Hojas hechas antes de que existieran las fotos: se agrega la columna.
      asegurarEncabezados_(hoja, COLUMNAS_PARTICIPANTES);
      tabla = leerTabla_(hoja, COLUMNAS_PARTICIPANTES);
    }
    var ix = tabla.indices;
    var fila = -1;
    tabla.filas.forEach(function (f, i) { if (celda_(f, ix.id) === id) fila = i + 2; });
    if (fila < 0) {
      if (nueva) borrarFoto_(nueva);
      throw new ErrorUsuario_('No se encontró a esa persona. Recarga la página.');
    }
    vieja = String(celda_(tabla.filas[fila - 2], ix.foto));
    hoja.getRange(fila, ix.foto + 1).setValues([[nueva]]);
  } finally {
    candado.releaseLock();
  }
  if (vieja && vieja !== nueva) borrarFoto_(vieja);
  return { ok: true, foto: nueva };
}

function accionGuardar_(yo, cuerpo) {
  var d = cuerpo.deseo || {};
  var descripcion = limpiarTexto_(d.descripcion, MAX_TEXTO);
  if (!descripcion) throw new ErrorUsuario_('Escribe qué te gustaría recibir.');
  var link = normalizarLink_(d.link);
  var idDeseo = String(d.id || '').trim();

  // Revisión previa (sin candado) para no subir una foto si de todos modos
  // no se va a poder guardar.
  var previos = leerDeseos_();
  var anterior = idDeseo ? buscarDeseo_(previos, idDeseo) : null;
  if (idDeseo && (!anterior || anterior.participante !== yo.id)) {
    throw new ErrorUsuario_('No se encontró esa opción. Puede que ya la hayas borrado.');
  }
  if (!idDeseo && contarDe_(previos, yo.id) >= MAX_DESEOS_POR_PERSONA) {
    throw new ErrorUsuario_('Ya tienes ' + MAX_DESEOS_POR_PERSONA + ' opciones. Borra alguna para agregar otra.');
  }

  var fotoNueva = '';
  if (cuerpo.foto && cuerpo.foto.datos) fotoNueva = guardarFoto_(cuerpo.foto, yo);

  var fotoParaBorrar = '';
  var guardado;
  var candado = esperarCandado_(fotoNueva);
  try {
    var hoja = obtenerHoja_(HOJA_DESEOS);
    var tabla = leerTabla_(hoja, COLUMNAS_DESEOS);
    var deseos = filasADeseos_(tabla);
    var ahora = new Date();

    if (idDeseo) {
      var actual = buscarDeseo_(deseos, idDeseo);
      if (!actual || actual.participante !== yo.id) {
        if (fotoNueva) fotoParaBorrar = fotoNueva;
        throw new ErrorUsuario_('No se encontró esa opción. Puede que ya la hayas borrado.');
      }
      var foto = actual.foto;
      if (fotoNueva) {
        if (foto) fotoParaBorrar = foto;
        foto = fotoNueva;
      } else if (cuerpo.quitarFoto && foto) {
        fotoParaBorrar = foto;
        foto = '';
      }
      var fila = tabla.filas[actual.indice].slice();
      ponerEnFila_(fila, tabla.indices, {
        nombre: yo.nombre,
        descripcion: descripcion,
        link: link,
        foto: foto,
        actualizado: ahora
      });
      hoja.getRange(actual.fila, 1, 1, fila.length).setValues([fila]);
      guardado = { id: actual.id, descripcion: descripcion, link: link, foto: foto, orden: actual.orden, actualizado: ahora };
    } else {
      if (contarDe_(deseos, yo.id) >= MAX_DESEOS_POR_PERSONA) {
        if (fotoNueva) fotoParaBorrar = fotoNueva;
        throw new ErrorUsuario_('Ya tienes ' + MAX_DESEOS_POR_PERSONA + ' opciones. Borra alguna para agregar otra.');
      }
      var orden = 1;
      deseos.forEach(function (x) {
        if (x.participante === yo.id && x.orden >= orden) orden = x.orden + 1;
      });
      var nuevo = {
        id: nuevoId_('d', deseos.map(function (x) { return x.id; })),
        participante: yo.id,
        nombre: yo.nombre,
        descripcion: descripcion,
        link: link,
        foto: fotoNueva,
        orden: orden,
        actualizado: ahora
      };
      var filaNueva = [];
      for (var i = 0; i < tabla.ancho; i++) filaNueva.push('');
      ponerEnFila_(filaNueva, tabla.indices, nuevo);
      hoja.appendRow(filaNueva);
      guardado = nuevo;
    }
  } finally {
    candado.releaseLock();
    if (fotoParaBorrar) borrarFoto_(fotoParaBorrar);
  }

  return { ok: true, deseo: deseoPublico_(guardado) };
}

function accionBorrar_(yo, cuerpo) {
  var idDeseo = String(cuerpo.id || '').trim();
  if (!idDeseo) throw new ErrorUsuario_('Falta indicar qué opción borrar.');
  var foto = '';
  var candado = esperarCandado_('');
  try {
    var hoja = obtenerHoja_(HOJA_DESEOS);
    var deseos = filasADeseos_(leerTabla_(hoja, COLUMNAS_DESEOS));
    var actual = buscarDeseo_(deseos, idDeseo);
    if (!actual) return { ok: true };
    if (actual.participante !== yo.id) throw new ErrorUsuario_('Esa opción no es tuya.');
    foto = actual.foto;
    hoja.deleteRow(actual.fila);
  } finally {
    candado.releaseLock();
  }
  if (foto) borrarFoto_(foto);
  return { ok: true };
}

/** Evita que dos personas escriban en la hoja exactamente al mismo tiempo. */
function esperarCandado_(fotoSubida) {
  var candado = LockService.getScriptLock();
  try {
    candado.waitLock(20000);
  } catch (err) {
    if (fotoSubida) borrarFoto_(fotoSubida);
    throw new ErrorUsuario_('Hay mucha gente guardando al mismo tiempo. Espera unos segundos e intenta otra vez.');
  }
  return candado;
}

/* ------------------------------------------------------------------ */
/* Lectura de las hojas                                                */
/* ------------------------------------------------------------------ */

function obtenerHoja_(nombre) {
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre);
  if (!hoja) {
    throw new ErrorUsuario_('Falta la hoja "' + nombre + '". Usa el menú Intercambio > 1. Preparar las hojas.');
  }
  return hoja;
}

/**
 * Lee una hoja completa y ubica cada columna por su encabezado.
 * Devuelve { indices: {clave: número de columna base 0}, filas: [...], ancho }.
 */
function leerTabla_(hoja, columnas) {
  var valores = hoja.getDataRange().getValues();
  var encabezados = (valores[0] || []).map(normalizar_);
  var indices = {};
  columnas.forEach(function (c) {
    var buscado = normalizar_(c.titulo);
    var corto = buscado.replace(/\s*\(.*\)$/, '');
    var i = encabezados.indexOf(buscado);
    if (i < 0) {
      for (var j = 0; j < encabezados.length; j++) {
        if (encabezados[j] && encabezados[j].indexOf(corto) === 0) { i = j; break; }
      }
    }
    indices[c.clave] = i;
  });
  return { indices: indices, filas: valores.slice(1), ancho: Math.max(encabezados.length, 1) };
}

function celda_(fila, indice) {
  if (indice < 0 || indice >= fila.length) return '';
  var v = fila[indice];
  if (v === null || v === undefined) return '';
  if (esFecha_(v)) return v;
  return leerTextoSeguro_(String(v).trim());
}

function leerParticipantes_() {
  var tabla = leerTabla_(obtenerHoja_(HOJA_PARTICIPANTES), COLUMNAS_PARTICIPANTES);
  var ix = tabla.indices;
  var lista = [];
  tabla.filas.forEach(function (f, i) {
    var nombre = celda_(f, ix.nombre);
    if (!nombre) return;
    lista.push({
      fila: i + 2,
      id: celda_(f, ix.id),
      nombre: nombre,
      foto: String(celda_(f, ix.foto))
    });
  });
  return lista;
}

function leerDeseos_() {
  return filasADeseos_(leerTabla_(obtenerHoja_(HOJA_DESEOS), COLUMNAS_DESEOS));
}

function filasADeseos_(tabla) {
  var ix = tabla.indices;
  var lista = [];
  tabla.filas.forEach(function (f, i) {
    var id = celda_(f, ix.id);
    var participante = celda_(f, ix.participante);
    if (!id || !participante) return;
    var orden = Number(celda_(f, ix.orden));
    lista.push({
      indice: i,
      fila: i + 2,
      id: String(id),
      participante: String(participante),
      descripcion: String(celda_(f, ix.descripcion)),
      link: String(celda_(f, ix.link)),
      foto: String(celda_(f, ix.foto)),
      orden: isFinite(orden) && orden > 0 ? orden : i + 1,
      actualizado: celda_(f, ix.actualizado)
    });
  });
  return lista;
}

function leerConfig_() {
  var datos = {};
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_CONFIG);
  if (hoja) {
    hoja.getDataRange().getValues().forEach(function (f) {
      var k = normalizar_(f[0]);
      if (k) datos[k] = esFecha_(f[1]) ? f[1] : String(f[1] === null || f[1] === undefined ? '' : f[1]).trim();
    });
  }
  return {
    titulo: datos['titulo'] || 'Intercambio Navideño',
    fecha: textoDeFecha_(datos['fecha del intercambio']),
    mensaje: datos['mensaje para todos'] || '',
    ayuda: datos['quien ayuda'] || ''
  };
}

function textoDeFecha_(v) {
  if (!esFecha_(v)) return v || '';
  var meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return v.getDate() + ' de ' + meses[v.getMonth()];
}

/* ------------------------------------------------------------------ */
/* Fotos (se guardan en una carpeta de Drive del organizador)          */
/* ------------------------------------------------------------------ */

function guardarFoto_(foto, yo) {
  var tipo = /^image\/(jpeg|png|webp|gif)$/.test(foto.tipo) ? foto.tipo : 'image/jpeg';
  var bytes;
  try {
    bytes = Utilities.base64Decode(String(foto.datos));
  } catch (err) {
    throw new ErrorUsuario_('No se pudo leer la foto. Intenta con otra.');
  }
  if (bytes.length > MAX_FOTO_BYTES) throw new ErrorUsuario_('La foto es muy grande. Intenta con otra.');
  var extension = tipo.split('/')[1].replace('jpeg', 'jpg');
  var nombre = (foto.persona ? 'Foto de ' : '') + yo.nombre + ' - ' + Utilities.formatDate(new Date(), 'GMT', 'yyyyMMdd-HHmmss') + '.' + extension;
  return carpetaFotos_().createFile(Utilities.newBlob(bytes, tipo, nombre)).getId();
}

function borrarFoto_(id) {
  try {
    DriveApp.getFileById(id).setTrashed(true);
  } catch (err) {
    console.warn('No se pudo borrar la foto ' + id + ': ' + err);
  }
}

function carpetaFotos_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('CARPETA_FOTOS');
  if (id) {
    try {
      var existente = DriveApp.getFolderById(id);
      if (!existente.isTrashed()) return existente;
    } catch (err) {
      // la carpeta se borró: se crea otra abajo
    }
  }
  var padre;
  try {
    padre = DriveApp.getFileById(SpreadsheetApp.getActiveSpreadsheet().getId()).getParents().next();
  } catch (err) {
    padre = DriveApp.getRootFolder();
  }
  var carpeta = padre.createFolder('Intercambio - fotos');
  props.setProperty('CARPETA_FOTOS', carpeta.getId());
  return carpeta;
}

/* ------------------------------------------------------------------ */
/* Menú para el organizador                                            */
/* ------------------------------------------------------------------ */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Intercambio')
    .addItem('Preparar las hojas', 'prepararHojas')
    .addToUi();
}

/** Al escribir un nombre nuevo en Participantes, se le pone su ID. */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var hoja = e.range.getSheet();
    if (hoja.getName() !== HOJA_PARTICIPANTES || e.range.getRow() < 2) return;
    asegurarIds_(false);
  } catch (err) {
    console.warn(err);
  }
}

function prepararHojas() {
  revisarAcentos_();
  var libro = SpreadsheetApp.getActiveSpreadsheet();

  var participantes = libro.getSheetByName(HOJA_PARTICIPANTES);
  if (!participantes) {
    // Si la hoja de cálculo es nueva, se reutiliza la primera hoja vacía.
    var primera = libro.getSheets()[0];
    if (libro.getSheets().length === 1 && primera.getLastRow() === 0) {
      participantes = primera.setName(HOJA_PARTICIPANTES);
    } else {
      participantes = libro.insertSheet(HOJA_PARTICIPANTES);
    }
  }
  asegurarEncabezados_(participantes, COLUMNAS_PARTICIPANTES);
  var ixP = leerTabla_(participantes, COLUMNAS_PARTICIPANTES).indices;
  participantes.setColumnWidth(ixP.id + 1, 70);
  participantes.setColumnWidth(ixP.nombre + 1, 220);
  participantes.getRange(2, ixP.nombre + 1, participantes.getMaxRows() - 1, 1).setNumberFormat('@');

  var deseos = libro.getSheetByName(HOJA_DESEOS) || libro.insertSheet(HOJA_DESEOS);
  asegurarEncabezados_(deseos, COLUMNAS_DESEOS);
  var ixD = leerTabla_(deseos, COLUMNAS_DESEOS).indices;
  deseos.setColumnWidth(ixD.descripcion + 1, 360);
  deseos.setColumnWidth(ixD.link + 1, 260);
  var filasD = deseos.getMaxRows() - 1;
  deseos.getRange(2, ixD.descripcion + 1, filasD, 1).setNumberFormat('@').setWrap(true);
  deseos.getRange(2, ixD.link + 1, filasD, 1).setNumberFormat('@');

  var config = libro.getSheetByName(HOJA_CONFIG);
  if (!config) {
    config = libro.insertSheet(HOJA_CONFIG);
    config.getRange(1, 2, CONFIG_INICIAL.length, 1).setNumberFormat('@');
    config.getRange(1, 1, CONFIG_INICIAL.length, 2).setValues(CONFIG_INICIAL);
    config.getRange(1, 1, CONFIG_INICIAL.length, 1).setFontWeight('bold');
    config.setColumnWidth(1, 220);
    config.setColumnWidth(2, 380);
  }

  libro.setActiveSheet(participantes);
  SpreadsheetApp.getUi().alert(
    'Listo',
    'Ya están las hojas.\n\n' +
    'Comparte el link de la página en el WhatsApp de la familia. La primera vez, cada quien ' +
    'toca su nombre en la lista, o lo escribe si no aparece.\n\n' +
    'Si quieres que ya aparezcan, escribe los nombres en "Participantes" (columna Nombre).',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function asegurarEncabezados_(hoja, columnas) {
  var ultima = Math.max(hoja.getLastColumn(), 1);
  var actuales = hoja.getRange(1, 1, 1, ultima).getValues()[0].map(normalizar_);
  var faltantes = columnas.filter(function (c) {
    var buscado = normalizar_(c.titulo).replace(/\s*\(.*\)$/, '');
    return !actuales.some(function (a) { return a && a.indexOf(buscado) === 0; });
  });
  if (faltantes.length) {
    var inicio = actuales.filter(function (a) { return a; }).length + 1;
    hoja.getRange(1, inicio, 1, faltantes.length).setValues([faltantes.map(function (c) { return c.titulo; })]);
  }
  hoja.getRange(1, 1, 1, hoja.getLastColumn()).setFontWeight('bold').setBackground('#e8efe9');
  hoja.setFrozenRows(1);
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

function deseoPublico_(d) {
  return {
    id: d.id,
    descripcion: d.descripcion,
    link: d.link,
    foto: d.foto || '',
    orden: d.orden,
    actualizado: esFecha_(d.actualizado) ? d.actualizado.toISOString() : String(d.actualizado || '')
  };
}

function ponerEnFila_(fila, indices, valores) {
  Object.keys(valores).forEach(function (k) {
    var i = indices[k];
    if (i === undefined || i < 0) return;
    var v = valores[k];
    fila[i] = typeof v === 'string' ? escribirTextoSeguro_(v) : v;
  });
}

/**
 * Un texto que empieza con = + - @ la hoja lo trataría como fórmula
 * (por ejemplo "- bufanda gris" daría #ERROR!). Se guarda con un apóstrofo
 * al inicio, que la hoja oculta.
 */
function escribirTextoSeguro_(texto) {
  return /^[=+\-@]/.test(texto) ? "'" + texto : texto;
}

function leerTextoSeguro_(texto) {
  return /^'[=+\-@]/.test(texto) ? texto.slice(1) : texto;
}

function buscarDeseo_(lista, id) {
  for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i];
  return null;
}

function contarDe_(lista, participanteId) {
  return lista.filter(function (d) { return d.participante === participanteId; }).length;
}

function normalizar_(v) {
  return String(v === null || v === undefined ? '' : v)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase().trim();
}

function limpiarTexto_(v, max) {
  return String(v || '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}

function normalizarLink_(v) {
  var link = String(v || '').trim();
  if (!link) return '';
  // Si pegaron texto con el link adentro ("Mira esto https://..."), se queda solo el link.
  var dentro = link.match(/https?:\/\/\S+/i);
  if (dentro) link = dentro[0];
  if (!/^https?:\/\//i.test(link)) {
    if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(link)) link = 'https://' + link;
    else throw new ErrorUsuario_('El link no parece válido. Cópialo otra vez desde la tienda.');
  }
  if (link.length > MAX_LINK) throw new ErrorUsuario_('El link es demasiado largo.');
  return link;
}

function nuevoId_(prefijo, usados) {
  var id;
  do {
    id = prefijo + Utilities.getUuid().replace(/-/g, '').slice(0, 6);
  } while (usados.indexOf(id) >= 0);
  return id;
}

function esFecha_(v) {
  return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime());
}
