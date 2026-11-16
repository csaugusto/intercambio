/*
 * Intercambio navideño: la página.
 *
 * Todos entran con el mismo link. La primera vez, cada quien toca su nombre
 * (o lo escribe si no aparece) y el celular lo recuerda.
 *
 * Vistas (se cambian con el # de la dirección para que el botón "atrás"
 * del celular funcione como se espera):
 *   #/                 inicio: a quién le regalo, mis opciones, la familia
 *   #/persona/ID       lo que quiere una persona
 *   #/nuevo            agregar una opción
 *   #/editar/ID        cambiar una opción
 */
(function () {
  'use strict';

  var CONFIG = window.INTERCAMBIO || {};
  var API_URL = String(CONFIG.apiUrl || '').trim();
  var MODO_DEMO = !API_URL;
  var MINIMO = 3;
  var SUFIJO = MODO_DEMO ? '.demo' : '';
  var LS_YO = 'intercambio.yo' + SUFIJO;
  var LS_CACHE = 'intercambio.cache' + SUFIJO;
  var LS_AVATAR = 'intercambio.avatar' + SUFIJO + '.';
  var FOTO_MAX_LADO = 1400;
  var AVATAR_LADO = 360;

  var app = document.getElementById('app');

  var estado = {
    yoId: '',
    datos: null,
    ultimaCarga: 0,
    sinConexion: false,
    fotos: new Map(),       // fotoId -> Promise<dataURL>
    fotosListas: new Map(), // fotoId -> dataURL ya descargada
    avatares: new Map(),    // fotoId -> dataURL de la foto de una persona
    pidiendoAvatares: {},
    fotoPara: '',           // persona a la que se le está poniendo foto
    borrando: null,
    formulario: null
  };

  /* ---------------------------------------------------------------- */
  /* Utilidades                                                        */
  /* ---------------------------------------------------------------- */

  function $(sel, raiz) { return (raiz || document).querySelector(sel); }
  function $$(sel, raiz) { return Array.prototype.slice.call((raiz || document).querySelectorAll(sel)); }

  var almacen = {
    leer: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    guardar: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    borrar: function (k) { try { localStorage.removeItem(k); } catch (e) { /* sin almacenamiento */ } }
  };

  function esc(t) {
    return String(t === null || t === undefined ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function esUrlSegura(u) { return /^https?:\/\//i.test(String(u || '')); }

  function dominio(u) {
    try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return 'la tienda'; }
  }

  /** Escapa el texto y convierte en link las direcciones de internet que traiga. */
  function textoConEnlaces(t) {
    return esc(t).replace(/https?:\/\/[^\s<]+/g, function (url) {
      var limpio = url.replace(/[.,;:!?)]+$/, '');
      var resto = url.slice(limpio.length);
      var visible = dominio(limpio.replace(/&amp;/g, '&'));
      return '<a href="' + limpio + '" target="_blank" rel="noopener noreferrer">' + esc(visible) + '</a>' + resto;
    });
  }

  function normalizar(v) {
    return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ').toLowerCase().trim();
  }

  function plural(n) { return n === 1 ? '1 opción' : n + ' opciones'; }

  /** Deja solo el link (por si pegaron "Mira esto https://...") y le pone https:// si le falta. */
  function normalizarLink(v) {
    var link = String(v || '').trim();
    if (!link) return '';
    var dentro = link.match(/https?:\/\/\S+/i);
    if (dentro) link = dentro[0];
    if (!esUrlSegura(link)) {
      if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(link)) link = 'https://' + link;
      else throw new ErrorApi('El link no parece válido. Cópialo otra vez desde la tienda, o déjalo vacío.');
    }
    return link;
  }

  function ErrorApi(mensaje, codigo) {
    var err = new Error(mensaje);
    err.codigo = codigo || '';
    return err;
  }

  var ICONOS = {
    regresar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    siguiente: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    mas: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg>',
    lapiz: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>',
    basura: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    camara: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.6" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>',
    enlace: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    foto: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 16l4-4 3 3 2-2 3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    palomita: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  /* ---------------------------------------------------------------- */
  /* Comunicación con la hoja (o con los datos de prueba)              */
  /* ---------------------------------------------------------------- */

  function pedirJSON(url, opciones, ms) {
    var ctl = new AbortController();
    var temporizador = setTimeout(function () { ctl.abort(); }, ms || 30000);
    var o = Object.assign({ signal: ctl.signal, redirect: 'follow' }, opciones || {});
    return fetch(url, o).then(function (resp) {
      clearTimeout(temporizador);
      if (!resp.ok) throw new ErrorApi('No se pudo conectar con la hoja (error ' + resp.status + ').', 'red');
      return resp.json().catch(function () {
        throw new ErrorApi('La hoja respondió algo inesperado. Avísale a quien organiza.', 'formato');
      });
    }, function () {
      clearTimeout(temporizador);
      throw new ErrorApi(ctl.signal.aborted
        ? 'Tardó demasiado. Revisa tu internet e intenta otra vez.'
        : 'No se pudo conectar. Revisa tu internet e intenta otra vez.', 'red');
    });
  }

  function revisar(r) {
    if (!r || r.ok !== true) throw new ErrorApi((r && r.error) || 'Algo salió mal. Intenta otra vez.', r && r.codigo);
    return r;
  }

  function pedirGet(params, reintento) {
    var url = API_URL + (API_URL.indexOf('?') >= 0 ? '&' : '?') + new URLSearchParams(params).toString();
    return pedirJSON(url).then(revisar).catch(function (err) {
      // Apps Script a veces falla de a ratos: se intenta una segunda vez.
      if (err.codigo === 'red' && !reintento) return pedirGet(params, true);
      throw err;
    });
  }

  function pedirPost(cuerpo) {
    // Se manda como texto simple para que el navegador no pida permiso
    // previo (CORS) a Google, que no lo sabe contestar.
    return pedirJSON(API_URL, { method: 'POST', body: JSON.stringify(cuerpo) }, 90000).then(revisar);
  }

  var api = {
    datos: function () {
      return MODO_DEMO ? demo.datos() : pedirGet({ accion: 'datos' });
    },
    foto: function (id) {
      if (MODO_DEMO) return demo.foto(id);
      return pedirGet({ accion: 'foto', id: id }).then(function (r) {
        return 'data:' + r.tipo + ';base64,' + r.datos;
      });
    },
    fotos: function (ids) {
      if (MODO_DEMO) return demo.fotos(ids);
      var lotes = [];
      for (var i = 0; i < ids.length; i += 40) lotes.push(ids.slice(i, i + 40));
      return Promise.all(lotes.map(function (lote) {
        return pedirGet({ accion: 'fotos', ids: lote.join(',') });
      })).then(function (respuestas) {
        var urls = {};
        respuestas.forEach(function (r) {
          Object.keys(r.fotos || {}).forEach(function (id) {
            urls[id] = 'data:' + r.fotos[id].tipo + ';base64,' + r.fotos[id].datos;
          });
        });
        return urls;
      });
    },
    fotoPersona: function (personaId, dataUrl) {
      var cuerpo = { accion: 'fotoPersona', persona: personaId };
      if (dataUrl) cuerpo.foto = { tipo: 'image/jpeg', datos: dataUrl.split(',')[1] };
      else cuerpo.quitar = true;
      return MODO_DEMO ? demo.fotoPersona(cuerpo) : pedirPost(cuerpo);
    },
    registrar: function (nombre) {
      var cuerpo = { accion: 'registrar', nombre: nombre };
      return MODO_DEMO ? demo.registrar(cuerpo) : pedirPost(cuerpo);
    },
    guardar: function (cuerpo) {
      cuerpo.accion = 'guardar';
      cuerpo.participante = estado.yoId;
      return MODO_DEMO ? demo.guardar(cuerpo) : pedirPost(cuerpo);
    },
    borrar: function (id) {
      var cuerpo = { accion: 'borrar', participante: estado.yoId, id: id };
      return MODO_DEMO ? demo.borrar(cuerpo) : pedirPost(cuerpo);
    }
  };

  function obtenerFoto(id) {
    if (!estado.fotos.has(id)) {
      var promesa = api.foto(id).then(function (url) {
        estado.fotosListas.set(id, url);
        return url;
      }, function (err) {
        estado.fotos.delete(id);
        throw err;
      });
      estado.fotos.set(id, promesa);
    }
    return estado.fotos.get(id);
  }

  function recordarFoto(id, url) {
    estado.fotos.set(id, Promise.resolve(url));
    estado.fotosListas.set(id, url);
  }

  /* ---------------------------------------------------------------- */
  /* Fotos de las personas (se guardan en el celular para no volver a   */
  /* pedirlas: cuando alguien cambia su foto, cambia su id)             */
  /* ---------------------------------------------------------------- */

  function inicial(nombre) {
    var partes = String(nombre || '?').trim().split(/\s+/);
    return partes[partes.length - 1].charAt(0).toUpperCase();
  }

  function avatarListo(id) {
    if (!id) return '';
    if (estado.avatares.has(id)) return estado.avatares.get(id);
    var guardado = almacen.leer(LS_AVATAR + id);
    if (guardado) estado.avatares.set(id, guardado);
    return guardado || '';
  }

  function guardarAvatar(id, url) {
    estado.avatares.set(id, url);
    almacen.guardar(LS_AVATAR + id, url);
  }

  function avatar(p, clase) {
    var url = avatarListo(p.foto);
    return '<span class="avatar' + (clase ? ' ' + clase : '') + '"' +
      (p.foto && !url ? ' data-avatar-id="' + esc(p.foto) + '"' : '') + ' aria-hidden="true">' +
      (url ? '<img src="' + url + '" alt="">' : '<span>' + esc(inicial(p.nombre)) + '</span>') +
      '</span>';
  }

  function cargarAvatares() {
    var ids = [];
    $$('[data-avatar-id]').forEach(function (el) {
      var id = el.getAttribute('data-avatar-id');
      if (ids.indexOf(id) < 0 && !estado.pidiendoAvatares[id]) ids.push(id);
    });
    if (!ids.length) return;
    ids.forEach(function (id) { estado.pidiendoAvatares[id] = true; });
    var terminar = function () { ids.forEach(function (id) { delete estado.pidiendoAvatares[id]; }); };
    api.fotos(ids).then(function (urls) {
      Object.keys(urls).forEach(function (id) { guardarAvatar(id, urls[id]); });
      terminar();
      $$('[data-avatar-id]').forEach(function (el) {
        var url = avatarListo(el.getAttribute('data-avatar-id'));
        if (!url) return;
        el.innerHTML = '<img src="' + url + '" alt="">';
        el.removeAttribute('data-avatar-id');
      });
    }, terminar);
  }

  /** Borra del celular las fotos de personas que ya no se usan. */
  function limpiarAvataresViejos() {
    try {
      var usadas = {};
      estado.datos.personas.forEach(function (p) { if (p.foto) usadas[LS_AVATAR + p.foto] = true; });
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i);
        if (k && k.indexOf(LS_AVATAR) === 0 && !usadas[k]) localStorage.removeItem(k);
      }
    } catch (e) { /* sin almacenamiento */ }
  }

  function elegirFotoPersona(id) {
    estado.fotoPara = id;
    $('#archivo-persona').click();
  }

  function alElegirFotoPersona(ev) {
    var archivo = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    var id = estado.fotoPara;
    if (!archivo || !id) return;
    mostrarOcupado('Guardando la foto...');
    prepararFoto(archivo, { lado: AVATAR_LADO, cuadrada: true }).then(function (dataUrl) {
      return api.fotoPersona(id, dataUrl).then(function (r) {
        guardarAvatar(r.foto, dataUrl);
        var p = persona(id);
        if (p) p.foto = r.foto;
        guardarCache();
        ocultarOcupado();
        pintar({ desdeRecarga: true });
        avisar('Listo, se guardó la foto.');
        cargar();
      });
    }).catch(function (err) {
      ocultarOcupado();
      avisar(err.message || 'No se pudo guardar la foto. Intenta otra vez.', true);
    });
  }

  function quitarFotoPersona(id) {
    var p = persona(id);
    if (!p || !window.confirm('¿Quitar la foto de ' + p.nombre + '?')) return;
    mostrarOcupado('Quitando la foto...');
    api.fotoPersona(id, null).then(function () {
      p.foto = '';
      guardarCache();
      ocultarOcupado();
      pintar({ desdeRecarga: true });
      avisar('Se quitó la foto.');
      cargar();
    }, function (err) {
      ocultarOcupado();
      avisar(err.message || 'No se pudo quitar la foto. Intenta otra vez.', true);
    });
  }

  function botonesFoto(p, esYo) {
    if (!p.foto) {
      return '<button type="button" class="boton boton-chico" data-accion="foto-persona" data-id="' + esc(p.id) + '">' +
        ICONOS.camara + (esYo ? 'Poner mi foto' : 'Poner su foto') + '</button>';
    }
    return '<button type="button" class="enlace" data-accion="foto-persona" data-id="' + esc(p.id) + '">' +
      (esYo ? 'Cambiar mi foto' : 'Cambiar foto') + '</button>';
  }

  /* ---------------------------------------------------------------- */
  /* Arranque y carga de datos                                         */
  /* ---------------------------------------------------------------- */

  function iniciar() {
    if (MODO_DEMO) $('#aviso-demo').hidden = false;
    estado.yoId = almacen.leer(LS_YO) || '';

    document.addEventListener('click', alHacerClic);
    $('#archivo-persona').addEventListener('change', alElegirFotoPersona);
    window.addEventListener('hashchange', function () { pintar(); });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && estado.datos && Date.now() - estado.ultimaCarga > 60000) cargar();
    });
    $$('dialog').forEach(function (d) {
      d.addEventListener('click', function (ev) { if (ev.target === d) d.close(); });
    });

    var guardado = almacen.leer(LS_CACHE);
    if (guardado) {
      try { estado.datos = JSON.parse(guardado); pintar(); } catch (e) { estado.datos = null; }
    }
    cargar();
  }

  function cargar() {
    return api.datos().then(function (datos) {
      estado.datos = datos;
      estado.ultimaCarga = Date.now();
      estado.sinConexion = false;
      guardarCache();
      limpiarAvataresViejos();
      pintar({ desdeRecarga: true });
    }, function (err) {
      if (estado.datos) {
        estado.sinConexion = true;
        pintar({ desdeRecarga: true });
        return;
      }
      pantallaError(err);
    });
  }

  function guardarCache() {
    if (estado.datos) almacen.guardar(LS_CACHE, JSON.stringify(estado.datos));
  }

  function persona(id) {
    var lista = (estado.datos && estado.datos.personas) || [];
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i];
    return null;
  }

  /** La persona que usa este celular, o null si todavía no elige su nombre. */
  function yo() {
    return estado.yoId ? persona(estado.yoId) : null;
  }

  function elegirPersona(id) {
    estado.yoId = id;
    almacen.guardar(LS_YO, id);
    if (location.hash && location.hash !== '#/') location.hash = '#/';
    else pintar();
  }

  function olvidarPersona() {
    estado.yoId = '';
    almacen.borrar(LS_YO);
    if (location.hash && location.hash !== '#/') location.hash = '#/';
    else pintar();
  }

  /** Si a la persona la quitaron de la hoja, se le vuelve a preguntar quién es. */
  function siYaNoExiste(err) {
    if (err.codigo !== 'sin-participante') return false;
    avisar(err.message, true);
    olvidarPersona();
    cargar();
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* Pintar las vistas                                                 */
  /* ---------------------------------------------------------------- */

  function rutaActual() {
    var partes = location.hash.replace(/^#\/?/, '').split('/');
    var id = partes[1] ? decodeURIComponent(partes[1]) : '';
    if (partes[0] === 'persona' && id) return { vista: 'persona', id: id };
    if (partes[0] === 'nuevo') return { vista: 'formulario', id: '' };
    if (partes[0] === 'editar' && id) return { vista: 'formulario', id: id };
    return { vista: 'inicio' };
  }

  function pintar(opciones) {
    var desdeRecarga = !!(opciones && opciones.desdeRecarga);
    if (!estado.datos) return;
    pintarEncabezado(estado.datos.config || {});
    var ruta = rutaActual();
    // Si llegan datos nuevos mientras alguien escribe, no se borra lo que lleva escrito.
    if (desdeRecarga && ruta.vista === 'formulario' && $('#formulario')) return;

    var html;
    var preguntar = !yo();
    if (preguntar && desdeRecarga && $('#form-registro')) return;
    if (preguntar) html = vistaQuienEres();
    else if (ruta.vista === 'persona') html = vistaPersona(ruta.id);
    else if (ruta.vista === 'formulario') html = vistaFormulario(ruta.id);
    else html = vistaInicio();

    if (estado.sinConexion) {
      html = '<p class="aviso-conexion">No hay conexión: estás viendo la última información que se cargó.</p>' + html;
    }
    app.innerHTML = html;
    if (preguntar) prepararRegistro();
    else if (ruta.vista === 'formulario') prepararFormulario(ruta.id);
    cargarFotosVisibles();
    cargarAvatares();

    if (!desdeRecarga) {
      window.scrollTo(0, 0);
      var h1 = $('h1', app);
      if (h1) h1.focus({ preventScroll: true });
    }
  }

  function pintarEncabezado(config) {
    var titulo = config.titulo || 'Intercambio Navideño';
    $('#titulo').textContent = titulo;
    document.title = titulo;
    var partes = [];
    if (config.fecha) partes.push(String(config.fecha));
    var detalles = $('#detalles');
    detalles.innerHTML = partes.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('');
    detalles.hidden = !partes.length;
  }

  function vistaInicio() {
    var d = estado.datos;
    var mio = yo();
    var otros = d.personas.filter(function (p) { return p.id !== mio.id; });

    var html = '' +
      '<div class="perfil">' + avatar(mio, 'avatar-grande') +
        '<div class="perfil-texto">' +
          '<h1 class="saludo" tabindex="-1">Hola, ' + esc(mio.nombre) + '</h1>' +
          '<div class="perfil-acciones">' + botonesFoto(mio, true) + '</div>' +
        '</div>' +
      '</div>';
    html += '<p class="cambiar-persona">¿No eres ' + esc(mio.nombre) + '? ' +
      '<button type="button" class="enlace" data-accion="cambiar-persona">Elegir otro nombre</button></p>';
    html += '<p class="intro">Aquí puedes escribir lo que te gustaría recibir y ver lo que quiere la persona a la que le regalas.</p>';
    if (d.config && d.config.mensaje) {
      html += '<p class="mensaje-general">' + textoConEnlaces(d.config.mensaje) + '</p>';
    }
    html += seccionMisDeseos(mio);
    if (otros.length) html += seccionFamilia(otros);
    if (d.config && d.config.ayuda) {
      html += '<p class="pie">¿Dudas? Pregúntale a ' + esc(d.config.ayuda) + '.</p>';
    }
    return html;
  }

  function vistaQuienEres() {
    var ordenados = estado.datos.personas.slice().sort(function (a, b) {
      return a.nombre.localeCompare(b.nombre, 'es');
    });
    var html = '<h1 tabindex="-1">¿Quién eres?</h1>';
    if (ordenados.length) {
      html += '<p class="intro">Toca tu nombre. Solo te lo preguntamos esta vez.</p>' +
        '<div class="tarjeta"><ul class="lista-familia lista-nombres">' + ordenados.map(function (p) {
          return '<li><button type="button" class="persona-fila" data-accion="soy" data-id="' + esc(p.id) + '">' +
            avatar(p) + '<span class="persona-nombre">' + esc(p.nombre) + '</span>' + ICONOS.siguiente + '</button></li>';
        }).join('') + '</ul></div>';
    } else {
      html += '<p class="intro">Escribe tu nombre para empezar.</p>';
    }
    html += '' +
      '<form id="form-registro" class="tarjeta" novalidate>' +
        (ordenados.length ? '<h2>¿No apareces en la lista?</h2>' : '') +
        '<label for="nombre-nuevo" class="etiqueta-campo">Escribe tu nombre como te dicen en la familia</label>' +
        '<input id="nombre-nuevo" type="text" maxlength="60" autocomplete="name" placeholder="Por ejemplo: Tía Rosa">' +
        '<p class="error-formulario" id="error-registro" role="alert" hidden></p>' +
        '<button type="submit" class="boton boton-principal">Entrar</button>' +
      '</form>';
    return html;
  }

  function prepararRegistro() {
    var form = $('#form-registro');
    if (!form) return;
    var campo = $('#nombre-nuevo');
    var error = $('#error-registro');
    campo.addEventListener('input', function () { error.hidden = true; });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var nombre = campo.value.replace(/\s+/g, ' ').trim();
      if (!nombre) {
        error.textContent = 'Escribe tu nombre.';
        error.hidden = false;
        campo.focus();
        return;
      }
      var existente = estado.datos.personas.filter(function (p) {
        return normalizar(p.nombre) === normalizar(nombre);
      })[0];
      if (existente) { elegirPersona(existente.id); return; }
      mostrarOcupado('Entrando...');
      api.registrar(nombre).then(function (r) {
        ocultarOcupado();
        if (!persona(r.persona.id)) {
          estado.datos.personas.push({ id: r.persona.id, nombre: r.persona.nombre, deseos: [] });
          guardarCache();
        }
        elegirPersona(r.persona.id);
        cargar();
      }, function (err) {
        ocultarOcupado();
        error.textContent = err.message || 'No se pudo. Intenta otra vez.';
        error.hidden = false;
      });
    });
  }

  function seccionMisDeseos(mio) {
    var n = mio.deseos.length;
    var faltan = MINIMO - n;
    var html = '<section class="tarjeta" aria-labelledby="t-mios">' +
      '<h2 id="t-mios">Lo que a mí me gustaría</h2>';

    if (n === 0) {
      html += '<p>Todavía no has puesto nada. Escribe por lo menos ' + MINIMO +
        ' cosas que te gustaría recibir, así quien te regale tiene de dónde escoger.</p>';
    } else if (faltan > 0) {
      html += '<p class="progreso">' + puntos(n) + '<span>Llevas ' + n + ' de ' + MINIMO + '. ' +
        (faltan === 1 ? 'Te falta una.' : 'Te faltan ' + faltan + '.') + '</span></p>';
    } else {
      html += '<p class="progreso progreso-listo">' + ICONOS.palomita +
        '<span>Ya tienes ' + plural(n) + '. Si quieres, puedes agregar más.</span></p>';
    }

    if (n) {
      html += '<ol class="lista-mios">' + mio.deseos.map(function (x, i) {
        var extras = [];
        if (x.foto) extras.push('<span class="etiqueta-chica">' + ICONOS.foto + 'Con foto</span>');
        if (x.link) extras.push('<span class="etiqueta-chica">' + ICONOS.enlace + 'Con link</span>');
        return '' +
          '<li class="mio">' +
            '<span class="numero" aria-hidden="true">' + (i + 1) + '</span>' +
            '<div class="mio-cuerpo">' +
              '<p class="mio-texto">' + esc(x.descripcion) + '</p>' +
              (extras.length ? '<p class="mio-extras">' + extras.join('') + '</p>' : '') +
            '</div>' +
            '<div class="mio-acciones">' +
              '<a class="boton boton-chico" href="#/editar/' + encodeURIComponent(x.id) + '">' +
                ICONOS.lapiz + 'Cambiar</a>' +
              '<button type="button" class="boton boton-chico boton-chico-peligro" data-accion="borrar" data-id="' + esc(x.id) + '">' +
                ICONOS.basura + 'Borrar</button>' +
            '</div>' +
          '</li>';
      }).join('') + '</ol>';
    }

    html += '<a class="boton ' + (faltan > 0 ? 'boton-principal' : 'boton-secundario') + '" href="#/nuevo">' +
      ICONOS.mas + (n === 0 ? 'Agregar mi primera opción' : 'Agregar otra opción') + '</a>';
    if (n) {
      html += '<a class="enlace-suave" href="#/persona/' + encodeURIComponent(mio.id) + '">Ver cómo ven los demás mi lista</a>';
    }
    return html + '</section>';
  }

  function puntos(n) {
    var html = '<span class="puntos" aria-hidden="true">';
    for (var i = 0; i < MINIMO; i++) html += '<span class="punto' + (i < n ? ' lleno' : '') + '"></span>';
    return html + '</span>';
  }

  function seccionFamilia(otros) {
    var ordenados = otros.slice().sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });
    return '' +
      '<section class="tarjeta" aria-labelledby="t-familia">' +
        '<h2 id="t-familia">¿A quién le regalas?</h2>' +
        '<p>Busca su nombre y tócalo para ver lo que le gustaría. Nadie se entera de qué listas ves.</p>' +
        '<ul class="lista-familia">' + ordenados.map(function (p) {
          var n = p.deseos.length;
          return '' +
            '<li><a class="persona-fila" href="#/persona/' + encodeURIComponent(p.id) + '">' +
              avatar(p) +
              '<span class="persona-datos">' +
                '<span class="persona-nombre">' + esc(p.nombre) + '</span>' +
                '<span class="persona-cuenta' + (n ? '' : ' persona-cuenta-vacia') + '">' +
                  (n ? plural(n) : 'Todavía no pone nada') + '</span>' +
              '</span>' + ICONOS.siguiente +
            '</a></li>';
        }).join('') + '</ul>' +
      '</section>';
  }

  function vistaPersona(id) {
    var d = estado.datos;
    var p = persona(id);
    var regresar = '<a class="regresar" href="#/">' + ICONOS.regresar + 'Regresar</a>';
    if (!p) {
      return regresar + '<h1 tabindex="-1">No encontramos a esa persona</h1>' +
        '<p>Puede que ya no esté en la lista. Regresa al inicio para ver a todos.</p>';
    }
    var esYo = p.id === estado.yoId;
    var html = regresar;
    html += '' +
      '<div class="perfil">' + avatar(p, 'avatar-grande') +
        '<div class="perfil-texto">' +
          '<p class="sobre-titulo">' + (esYo ? 'Así ven los demás tu lista' : 'Lo que le gustaría a') + '</p>' +
          '<h1 tabindex="-1">' + (esYo ? 'Mi lista' : esc(p.nombre)) + '</h1>' +
          '<div class="perfil-acciones">' + botonesFoto(p, esYo) +
            (p.foto ? '<button type="button" class="enlace enlace-quitar" data-accion="quitar-foto-persona" data-id="' +
              esc(p.id) + '">Quitar foto</button>' : '') +
          '</div>' +
        '</div>' +
      '</div>';

    if (!p.deseos.length) {
      html += '<div class="vacio">' +
        (esYo
          ? '<p><strong>Todavía no has puesto nada.</strong></p>'
          : '<p><strong>' + esc(p.nombre) + ' todavía no ha puesto sus opciones.</strong></p><p>Vuelve a revisar en unos días.</p>') +
        '</div>';
    } else {
      var hayFotos = p.deseos.some(function (x) { return x.foto; });
      if (!esYo) {
        html += '<p class="instruccion">Puedes escoger la que tú quieras.' +
          (hayFotos ? ' Toca una foto para verla en grande.' : '') + '</p>';
      }
      html += '<ol class="lista-deseos">' + p.deseos.map(function (x, i) {
        return '' +
          '<li class="deseo">' +
            '<p class="deseo-numero"><span class="numero" aria-hidden="true">' + (i + 1) + '</span>Opción ' + (i + 1) + '</p>' +
            '<p class="deseo-texto">' + textoConEnlaces(x.descripcion) + '</p>' +
            (x.foto ? bloqueFoto(x.foto) : '') +
            (esUrlSegura(x.link)
              ? '<a class="boton boton-secundario boton-link" href="' + esc(x.link) + '" target="_blank" rel="noopener noreferrer">' +
                  ICONOS.enlace + '<span>Abrir el link<small>' + esc(dominio(x.link)) + '</small></span></a>'
              : '') +
          '</li>';
      }).join('') + '</ol>';
    }

    if (esYo) html += '<a class="boton boton-principal" href="#/nuevo">' + ICONOS.mas + 'Agregar otra opción</a>';
    html += '<a class="boton boton-secundario" href="#/">' + ICONOS.regresar + 'Regresar al inicio</a>';
    return html;
  }

  function bloqueFoto(id) {
    var lista = estado.fotosListas.get(id);
    return '' +
      '<button type="button" class="deseo-foto" data-accion="ampliar" data-foto="' + esc(id) + '" aria-label="Ver la foto en grande">' +
        '<img data-foto-id="' + esc(id) + '" alt="Foto de referencia"' + (lista ? ' src="' + lista + '"' : '') + '>' +
        (lista ? '' : '<span class="foto-cargando"><span class="girando" aria-hidden="true"></span>Cargando foto...</span>') +
      '</button>';
  }

  function cargarFotosVisibles() {
    $$('img[data-foto-id]', app).forEach(function (img) {
      if (img.getAttribute('src')) return;
      var id = img.getAttribute('data-foto-id');
      var etiqueta = img.parentNode.querySelector('.foto-cargando');
      obtenerFoto(id).then(function (url) {
        img.src = url;
        if (etiqueta) etiqueta.remove();
      }, function () {
        if (etiqueta) etiqueta.textContent = 'No se pudo cargar la foto.';
      });
    });
  }

  /* ---------------------------------------------------------------- */
  /* Formulario para agregar o cambiar una opción                      */
  /* ---------------------------------------------------------------- */

  function vistaFormulario(id) {
    var mio = yo();
    var deseo = null;
    var numero = mio.deseos.length + 1;
    if (id) {
      for (var i = 0; i < mio.deseos.length; i++) {
        if (mio.deseos[i].id === id) { deseo = mio.deseos[i]; numero = i + 1; }
      }
      if (!deseo) {
        return '<a class="regresar" href="#/">' + ICONOS.regresar + 'Regresar</a>' +
          '<h1 tabindex="-1">No encontramos esa opción</h1><p>Puede que ya la hayas borrado.</p>';
      }
    }
    var puedePegar = !!(navigator.clipboard && navigator.clipboard.readText);

    return '' +
      '<a class="regresar" href="#/" data-salir>' + ICONOS.regresar + 'Regresar sin guardar</a>' +
      '<p class="sobre-titulo">' + (deseo ? 'Cambiar' : 'Agregar') + '</p>' +
      '<h1 tabindex="-1">Opción ' + numero + '</h1>' +
      '<form id="formulario" class="formulario" novalidate>' +
        '<div class="campo">' +
          '<label for="descripcion">¿Qué te gustaría recibir?</label>' +
          '<p class="ayuda" id="ayuda-descripcion">Entre más detalles, mejor: color, talla, marca, tamaño...</p>' +
          '<textarea id="descripcion" name="descripcion" rows="4" maxlength="1500" aria-describedby="ayuda-descripcion" ' +
            'placeholder="Por ejemplo: una bufanda gris de lana, que no pique">' + esc(deseo ? deseo.descripcion : '') + '</textarea>' +
        '</div>' +
        '<div class="campo">' +
          '<label for="link">Link de la tienda <span class="opcional">(si tienes)</span></label>' +
          '<p class="ayuda" id="ayuda-link">Si lo viste en internet, copia el link de esa página y pégalo aquí.</p>' +
          '<div class="fila-link">' +
            '<input id="link" name="link" type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" ' +
              'aria-describedby="ayuda-link" placeholder="https://..." value="' + esc(deseo ? deseo.link : '') + '">' +
            (puedePegar ? '<button type="button" class="boton boton-secundario boton-pegar" data-accion="pegar">Pegar</button>' : '') +
          '</div>' +
          '<p class="ayuda ayuda-pegar" id="ayuda-pegar" hidden>Mantén el dedo apretado dentro de la caja y elige <strong>Pegar</strong>.</p>' +
        '</div>' +
        '<div class="campo">' +
          '<p class="etiqueta-campo">Foto <span class="opcional">(si tienes)</span></p>' +
          '<p class="ayuda">Puede ser una foto que tomes o una captura de pantalla.</p>' +
          '<div id="zona-foto"></div>' +
          '<input type="file" id="archivo" accept="image/*" class="oculto" tabindex="-1" aria-hidden="true">' +
        '</div>' +
        '<p class="error-formulario" id="error-formulario" role="alert" hidden></p>' +
        '<button type="submit" class="boton boton-principal boton-guardar">' + ICONOS.palomita + 'Guardar</button>' +
        '<a class="boton boton-secundario" href="#/" data-salir>Cancelar</a>' +
      '</form>';
  }

  function prepararFormulario(id) {
    var form = $('#formulario');
    if (!form) return;
    var deseo = id ? yo().deseos.filter(function (x) { return x.id === id; })[0] : null;
    estado.formulario = {
      id: id || '',
      fotoActual: deseo ? deseo.foto : '',
      fotoNueva: null,
      quitarFoto: false,
      cambios: false,
      guardando: false
    };

    var texto = $('#descripcion');
    var ajustar = function () {
      texto.style.height = 'auto';
      texto.style.height = Math.min(texto.scrollHeight + 4, 480) + 'px';
    };
    texto.addEventListener('input', function () { ajustar(); estado.formulario.cambios = true; ocultarError(); });
    var campoLink = $('#link');
    campoLink.addEventListener('input', function () { estado.formulario.cambios = true; ocultarError(); });
    campoLink.addEventListener('blur', function () {
      try { campoLink.value = normalizarLink(campoLink.value); } catch (e) { /* se avisa al guardar */ }
    });
    requestAnimationFrame(ajustar);

    $('#archivo').addEventListener('change', alElegirFoto);
    form.addEventListener('submit', guardarFormulario);
    $$('[data-salir]', app).forEach(function (a) {
      a.addEventListener('click', function (ev) {
        if (estado.formulario && estado.formulario.cambios &&
            !window.confirm('¿Salir sin guardar? Se perderá lo que escribiste.')) {
          ev.preventDefault();
        }
      });
    });
    pintarZonaFoto();
  }

  function pintarZonaFoto(mensaje) {
    var zona = $('#zona-foto');
    var f = estado.formulario;
    if (!zona || !f) return;
    if (mensaje) {
      zona.innerHTML = '<div class="foto-preparando"><span class="girando" aria-hidden="true"></span>' + esc(mensaje) + '</div>';
      return;
    }
    var mostrar = f.fotoNueva || (!f.quitarFoto && f.fotoActual);
    if (!mostrar) {
      zona.innerHTML = '<button type="button" class="boton-foto" data-accion="elegir-foto">' +
        ICONOS.camara + '<span>Agregar una foto</span></button>';
      return;
    }
    var src = f.fotoNueva || estado.fotosListas.get(f.fotoActual) || '';
    zona.innerHTML = '' +
      '<div class="foto-elegida">' +
        '<img id="foto-vista" alt="La foto que elegiste"' + (src ? ' src="' + src + '"' : '') + '>' +
        (src ? '' : '<span class="foto-cargando"><span class="girando" aria-hidden="true"></span>Cargando foto...</span>') +
      '</div>' +
      '<div class="foto-acciones">' +
        '<button type="button" class="boton boton-chico" data-accion="elegir-foto">' + ICONOS.camara + 'Cambiar foto</button>' +
        '<button type="button" class="boton boton-chico boton-chico-peligro" data-accion="quitar-foto">' + ICONOS.basura + 'Quitar foto</button>' +
      '</div>';
    if (!src && f.fotoActual) {
      obtenerFoto(f.fotoActual).then(function (url) {
        var img = $('#foto-vista');
        if (img) { img.src = url; var c = img.parentNode.querySelector('.foto-cargando'); if (c) c.remove(); }
      }, function () {
        var c = $('.foto-elegida .foto-cargando');
        if (c) c.textContent = 'No se pudo cargar la foto.';
      });
    }
  }

  function alElegirFoto(ev) {
    var archivo = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!archivo || !estado.formulario) return;
    pintarZonaFoto('Preparando la foto...');
    prepararFoto(archivo).then(function (dataUrl) {
      if (!estado.formulario) return;
      estado.formulario.fotoNueva = dataUrl;
      estado.formulario.quitarFoto = false;
      estado.formulario.cambios = true;
      pintarZonaFoto();
    }, function (err) {
      pintarZonaFoto();
      mostrarError(err.message);
    });
  }

  /**
   * Achica la foto (las de celular pesan mucho) y la convierte a JPG.
   * Con { cuadrada: true } recorta el centro, para las fotos de las personas.
   */
  function prepararFoto(archivo, opciones) {
    var lado = (opciones && opciones.lado) || FOTO_MAX_LADO;
    var cuadrada = !!(opciones && opciones.cuadrada);
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(archivo);
      var img = new Image();
      img.onload = function () {
        var sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0;
        if (cuadrada) {
          var m = Math.min(sw, sh);
          sx = (sw - m) / 2;
          sy = (sh - m) / 2;
          sw = sh = m;
        }
        var escala = Math.min(1, lado / Math.max(sw, sh));
        var w = Math.max(1, Math.round(sw * escala));
        var h = Math.max(1, Math.round(sh * escala));
        var lienzo = document.createElement('canvas');
        lienzo.width = w;
        lienzo.height = h;
        var ctx = lienzo.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(lienzo.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('No se pudo abrir esa foto. Intenta con otra, o toma una captura de pantalla.'));
      };
      img.src = url;
    });
  }

  function guardarFormulario(ev) {
    ev.preventDefault();
    var f = estado.formulario;
    if (!f || f.guardando) return;
    var descripcion = $('#descripcion').value.trim();
    if (!descripcion) {
      mostrarError('Escribe qué te gustaría recibir.');
      $('#descripcion').focus();
      return;
    }
    var link;
    try {
      link = normalizarLink($('#link').value);
    } catch (err) {
      mostrarError(err.message);
      $('#link').focus();
      return;
    }

    var cuerpo = {
      deseo: { id: f.id, descripcion: descripcion, link: link },
      quitarFoto: f.quitarFoto && !f.fotoNueva
    };
    if (f.fotoNueva) cuerpo.foto = { tipo: 'image/jpeg', datos: f.fotoNueva.split(',')[1] };

    f.guardando = true;
    mostrarOcupado(f.fotoNueva ? 'Guardando (con la foto puede tardar un poquito)...' : 'Guardando...');
    api.guardar(cuerpo).then(function (r) {
      if (f.fotoNueva && r.deseo.foto) recordarFoto(r.deseo.foto, f.fotoNueva);
      ponerDeseoLocal(r.deseo);
      ocultarOcupado();
      estado.formulario = null;
      location.hash = '#/';
      avisar(f.id ? 'Listo, se guardaron los cambios.' : 'Listo, se guardó tu opción.');
      cargar();
    }, function (err) {
      f.guardando = false;
      ocultarOcupado();
      if (siYaNoExiste(err)) { estado.formulario = null; return; }
      mostrarError(err.message || 'No se pudo guardar. Intenta otra vez.');
    });
  }

  function ponerDeseoLocal(deseo) {
    var lista = yo().deseos;
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].id === deseo.id) { lista[i] = deseo; guardarCache(); return; }
    }
    lista.push(deseo);
    guardarCache();
  }

  function quitarDeseoLocal(id) {
    var mio = yo();
    mio.deseos = mio.deseos.filter(function (x) { return x.id !== id; });
    guardarCache();
  }

  function mostrarError(texto) {
    var el = $('#error-formulario');
    if (!el) { avisar(texto, true); return; }
    el.textContent = texto;
    el.hidden = false;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function ocultarError() {
    var el = $('#error-formulario');
    if (el) el.hidden = true;
  }

  /* ---------------------------------------------------------------- */
  /* Clics                                                             */
  /* ---------------------------------------------------------------- */

  function alHacerClic(ev) {
    var el = ev.target.closest('[data-accion]');
    if (!el) return;
    var accion = el.getAttribute('data-accion');

    if (accion === 'borrar') {
      var id = el.getAttribute('data-id');
      var deseo = yo().deseos.filter(function (x) { return x.id === id; })[0];
      if (!deseo) return;
      estado.borrando = id;
      var resumen = deseo.descripcion.length > 120 ? deseo.descripcion.slice(0, 117) + '...' : deseo.descripcion;
      $('#dialogo-borrar-texto').textContent = '"' + resumen + '"';
      $('#dialogo-borrar').showModal();
    } else if (accion === 'confirmar-borrar') {
      confirmarBorrar();
    } else if (accion === 'cerrar-dialogo') {
      var dialogo = el.closest('dialog');
      if (dialogo) dialogo.close();
    } else if (accion === 'ampliar') {
      var url = estado.fotosListas.get(el.getAttribute('data-foto'));
      if (!url) return;
      $('#visor-imagen').src = url;
      $('#visor').showModal();
    } else if (accion === 'elegir-foto') {
      $('#archivo').click();
    } else if (accion === 'quitar-foto') {
      estado.formulario.fotoNueva = null;
      estado.formulario.quitarFoto = true;
      estado.formulario.cambios = true;
      pintarZonaFoto();
    } else if (accion === 'pegar') {
      pegarLink();
    } else if (accion === 'foto-persona') {
      elegirFotoPersona(el.getAttribute('data-id'));
    } else if (accion === 'quitar-foto-persona') {
      quitarFotoPersona(el.getAttribute('data-id'));
    } else if (accion === 'soy') {
      elegirPersona(el.getAttribute('data-id'));
    } else if (accion === 'cambiar-persona') {
      olvidarPersona();
    } else if (accion === 'reintentar') {
      app.innerHTML = '<div class="cargando"><span class="girando" aria-hidden="true"></span><p>Cargando...</p></div>';
      cargar();
    } else if (accion === 'reiniciar-demo') {
      demo.reiniciar();
      location.hash = '#/';
      location.reload();
    }
  }

  function confirmarBorrar() {
    var id = estado.borrando;
    $('#dialogo-borrar').close();
    if (!id) return;
    mostrarOcupado('Borrando...');
    api.borrar(id).then(function () {
      quitarDeseoLocal(id);
      ocultarOcupado();
      pintar({ desdeRecarga: true });
      avisar('Se borró la opción.');
      cargar();
    }, function (err) {
      ocultarOcupado();
      if (siYaNoExiste(err)) return;
      avisar(err.message || 'No se pudo borrar. Intenta otra vez.', true);
    });
  }

  function pegarLink() {
    var campo = $('#link');
    navigator.clipboard.readText().then(function (texto) {
      texto = String(texto || '').trim();
      if (!texto) { $('#ayuda-pegar').hidden = false; campo.focus(); return; }
      try { campo.value = normalizarLink(texto); } catch (e) { campo.value = texto; }
      estado.formulario.cambios = true;
      ocultarError();
    }, function () {
      $('#ayuda-pegar').hidden = false;
      campo.focus();
    });
  }

  /* ---------------------------------------------------------------- */
  /* Mensajes                                                          */
  /* ---------------------------------------------------------------- */

  function mostrarOcupado(texto) {
    $('#ocupado-texto').textContent = texto;
    $('#ocupado').hidden = false;
  }

  function ocultarOcupado() {
    $('#ocupado').hidden = true;
  }

  var temporizadorAviso;
  function avisar(texto, esError) {
    var el = $('#aviso');
    el.innerHTML = (esError ? '' : ICONOS.palomita) + '<span>' + esc(texto) + '</span>';
    el.classList.toggle('aviso-error', !!esError);
    el.hidden = false;
    requestAnimationFrame(function () { el.classList.add('visible'); });
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(function () {
      el.classList.remove('visible');
      setTimeout(function () { el.hidden = true; }, 300);
    }, esError ? 7000 : 4500);
  }

  function pantallaError(err) {
    app.innerHTML = '' +
      '<div class="pantalla-centro">' +
        '<h1 tabindex="-1">No se pudo cargar</h1>' +
        '<p>' + esc(err.message || 'Revisa tu internet e intenta otra vez.') + '</p>' +
        '<button type="button" class="boton boton-principal" data-accion="reintentar">Intentar otra vez</button>' +
      '</div>';
  }

  /* ---------------------------------------------------------------- */
  /* Modo de prueba: datos de ejemplo guardados en este aparato         */
  /* ---------------------------------------------------------------- */

  var demo = (function () {
    var LS = 'intercambio.demo.v5';

    function inicial() {
      return {
        config: {
          titulo: 'Intercambio Navideño 2026',
          fecha: '',
          mensaje: '',
          ayuda: 'quien organiza'
        },
        personas: [
          { id: 'p1', nombre: 'Lupe', deseos: [
            { id: 'd1', descripcion: 'Un libro de recetas de cocina mexicana, de preferencia con fotos.', link: '', foto: '', orden: 1 }
          ] },
          { id: 'p2', nombre: 'Tío Beto', deseos: [
            { id: 'd2', descripcion: 'Una bufanda gris de lana, larga y que no pique.', link: '', foto: '', orden: 1 },
            { id: 'd3', descripcion: 'Audífonos inalámbricos para escuchar música cuando salgo a caminar. Color negro.', link: 'https://www.amazon.com.mx/', foto: '', orden: 2 },
            { id: 'd4', descripcion: 'Una taza térmica grande para el café, que lo mantenga caliente.', link: '', foto: '', orden: 3 }
          ] },
          { id: 'p3', nombre: 'Abuela Carmen', deseos: [
            { id: 'd5', descripcion: 'Una cobija suave para la sala, color café o beige.', link: '', foto: '', orden: 1 },
            { id: 'd6', descripcion: 'Un portarretratos para poner la foto de los nietos.', link: '', foto: '', orden: 2 }
          ] },
          { id: 'p4', nombre: 'Tía Rosa', deseos: [] },
          { id: 'p5', nombre: 'Memo', deseos: [
            { id: 'd7', descripcion: 'Un balón de futbol número 5.', link: '', foto: '', orden: 1 },
            { id: 'd8', descripcion: 'Tenis para correr, talla 27.', link: '', foto: '', orden: 2 },
            { id: 'd9', descripcion: 'Una gorra de los Pumas.', link: '', foto: '', orden: 3 }
          ] }
        ],
        fotos: {}
      };
    }

    function leer() {
      try {
        var guardado = JSON.parse(almacen.leer(LS) || 'null');
        if (guardado && guardado.personas) return guardado;
      } catch (e) { /* datos dañados: se empieza de nuevo */ }
      return inicial();
    }

    function escribir(db) {
      if (!almacen.guardar(LS, JSON.stringify(db))) {
        throw new ErrorApi('En el modo de prueba ya no cabe otra foto en este aparato. Usa "Volver a empezar".');
      }
    }

    function esperar(valor, ms) {
      return new Promise(function (resolve) { setTimeout(function () { resolve(valor); }, ms || 350); });
    }

    function quien(db, id) {
      var p = db.personas.filter(function (x) { return x.id === id; })[0];
      if (!p) throw new ErrorApi('No te encontramos en la lista. Vuelve a elegir tu nombre.', 'sin-participante');
      return p;
    }

    return {
      datos: function () {
        var db = leer();
        var copia = JSON.parse(JSON.stringify(db));
        delete copia.fotos;
        return esperar({ ok: true, config: copia.config, personas: copia.personas });
      },
      fotos: function (ids) {
        var db = leer();
        var urls = {};
        ids.forEach(function (id) { if (db.fotos[id]) urls[id] = db.fotos[id]; });
        return esperar(urls, 250);
      },
      fotoPersona: function (cuerpo) {
        return esperar(null, 500).then(function () {
          var db = leer();
          var p = db.personas.filter(function (x) { return x.id === cuerpo.persona; })[0];
          if (!p) throw new ErrorApi('No se encontró a esa persona. Recarga la página.');
          if (p.foto) delete db.fotos[p.foto];
          p.foto = '';
          if (!cuerpo.quitar) {
            p.foto = 'fp' + Date.now();
            db.fotos[p.foto] = 'data:' + cuerpo.foto.tipo + ';base64,' + cuerpo.foto.datos;
          }
          escribir(db);
          return { ok: true, foto: p.foto };
        });
      },
      registrar: function (cuerpo) {
        return esperar(null, 400).then(function () {
          var db = leer();
          var nombre = String(cuerpo.nombre || '').replace(/\s+/g, ' ').trim().slice(0, 60);
          if (!nombre) throw new ErrorApi('Escribe tu nombre.');
          var p = db.personas.filter(function (x) { return normalizar(x.nombre) === normalizar(nombre); })[0];
          if (!p) {
            p = { id: 'p' + Date.now(), nombre: nombre, deseos: [] };
            db.personas.push(p);
            escribir(db);
          }
          return { ok: true, persona: { id: p.id, nombre: p.nombre } };
        });
      },
      foto: function (id) {
        var url = leer().fotos[id];
        return url ? esperar(url, 250) : Promise.reject(new ErrorApi('No se encontró la foto.'));
      },
      guardar: function (cuerpo) {
        return esperar(null, 600).then(function () {
          var db = leer();
          var mio = quien(db, cuerpo.participante);
          var d = cuerpo.deseo;
          var deseo = d.id ? mio.deseos.filter(function (x) { return x.id === d.id; })[0] : null;
          if (d.id && !deseo) throw new ErrorApi('No se encontró esa opción.');
          if (!deseo) {
            deseo = { id: 'd' + Date.now(), orden: mio.deseos.length + 1, foto: '' };
            mio.deseos.push(deseo);
          }
          deseo.descripcion = d.descripcion;
          deseo.link = d.link;
          deseo.actualizado = new Date().toISOString();
          if (cuerpo.foto) {
            if (deseo.foto) delete db.fotos[deseo.foto];
            deseo.foto = 'f' + Date.now();
            db.fotos[deseo.foto] = 'data:' + cuerpo.foto.tipo + ';base64,' + cuerpo.foto.datos;
          } else if (cuerpo.quitarFoto) {
            if (deseo.foto) delete db.fotos[deseo.foto];
            deseo.foto = '';
          }
          escribir(db);
          return { ok: true, deseo: JSON.parse(JSON.stringify(deseo)) };
        });
      },
      borrar: function (cuerpo) {
        return esperar(null, 400).then(function () {
          var db = leer();
          var mio = quien(db, cuerpo.participante);
          mio.deseos.forEach(function (x) {
            if (x.id === cuerpo.id && x.foto) delete db.fotos[x.foto];
          });
          mio.deseos = mio.deseos.filter(function (x) { return x.id !== cuerpo.id; });
          escribir(db);
          return { ok: true };
        });
      },
      reiniciar: function () {
        almacen.borrar(LS);
        almacen.borrar(LS_CACHE);
        almacen.borrar(LS_YO);
      }
    };
  })();

  iniciar();
})();
