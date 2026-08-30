/* Hasnaria Sales — infographic overlay + Majoo import */
(function () {
  'use strict';

  var SB = window.HASNARIA_SB;
  var KEY = window.HASNARIA_KEY;
  var BRAND = 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
  var TAG_SKU = '⟦SKU:';
  var TAG_PAY_RE = /⟦PAY:cash=([\d.]+)\|qris=([\d.]+)\|tf=([\d.]+)⟧/;
  var STATE = { mode: 'daily', rows: [], loading: false, fetched: false, importing: false, fileName: '', msg: '', error: '', draw: false, viewFrom: '', viewTo: '', viewMonth: '' };
