(function (root) {
  'use strict';

  var MESSAGE = 'Password baru minimal 12 karakter dan wajib memuat huruf kecil, huruf besar, angka, serta simbol.';

  function validate(password) {
    var value = String(password || '');
    var reasons = [];
    if (value.length < 12) reasons.push('minimal 12 karakter');
    if (!/[a-z]/.test(value)) reasons.push('huruf kecil');
    if (!/[A-Z]/.test(value)) reasons.push('huruf besar');
    if (!/[0-9]/.test(value)) reasons.push('angka');
    if (!/[^A-Za-z0-9]/.test(value)) reasons.push('simbol');
    return {
      ok: reasons.length === 0,
      reasons: reasons,
      message: reasons.length ? MESSAGE : ''
    };
  }

  var policy = Object.freeze({
    validate: validate,
    message: MESSAGE,
    minLength: 12
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = policy;
  if (root) root.__HASNARIA_PASSWORD_POLICY = policy;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
