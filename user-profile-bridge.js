(function () {
  'use strict';

  var db = window.__HASNARIA_DB;
  var BRAND = 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
  var LEGACY_PREFIX = 'HASNARIA_USER|';
  var LEGACY_PATTERN = 'HASNARIA_USER|%';

  if (!db || db.__hasnariaProfileAuthorityBridge) return;

  var originalFrom = db.from.bind(db);
  var originalRpc = db.rpc.bind(db);

  function isLegacyName(name) {
    return typeof name === 'string' && name.indexOf(LEGACY_PREFIX) === 0;
  }

  function parseLegacy(name) {
    if (!isLegacyName(name)) return null;
    var parts = name.split('|');
    if (parts.length < 5) return null;
    return {
      userId: parts[1],
      role: parts[2],
      email: parts[3] || null,
      name: parts.slice(4).join('|') || null
    };
  }

  function cleanLegacyDisplayName(value) {
    var text = String(value || '');
    var idx = text.indexOf('::');
    return idx >= 0 ? text.slice(idx + 2) : text;
  }

  function wrapProductSelect(builder) {
    if (!builder || typeof builder.like !== 'function') return builder;
    var originalLike = builder.like.bind(builder);
    builder.like = function (column, pattern) {
      if (column === 'name' && pattern === LEGACY_PATTERN) {
        return originalRpc('client_roster_rows');
      }
      return originalLike(column, pattern);
    };
    return builder;
  }

  function productRelation() {
    var relation = originalFrom('products');
    var originalSelect = relation.select.bind(relation);
    var originalInsert = relation.insert.bind(relation);
    var originalUpdate = relation.update.bind(relation);

    relation.select = function (columns, options) {
      return wrapProductSelect(originalSelect(columns, options));
    };

    relation.insert = function (values, options) {
      var rows = Array.isArray(values) ? values : [values];
      if (rows.length === 1 && rows[0] && isLegacyName(rows[0].name)) {
        var member = parseLegacy(rows[0].name);
        if (!member) return originalInsert(values, options);
        return originalFrom('user_profiles').insert({
          id: member.userId,
          email: member.email,
          full_name: member.name,
          display_name: member.name,
          brand_id: BRAND,
          role: 'pending',
          status: 'active'
        }, options);
      }
      return originalInsert(values, options);
    };

    relation.update = function (values, options) {
      if (values && isLegacyName(values.name)) {
        var member = parseLegacy(values.name);
        if (!member) return originalUpdate(values, options);
        return originalFrom('user_profiles').update({
          role: member.role,
          email: member.email,
          full_name: member.name,
          display_name: member.name
        }, options);
      }
      return originalUpdate(values, options);
    };

    return relation;
  }

  function profileRelation() {
    var relation = originalFrom('user_profiles');
    var originalUpsert = relation.upsert.bind(relation);
    relation.upsert = function (values, options) {
      if (!Array.isArray(values) && values && values.id && typeof values.display_name === 'string' && values.display_name.indexOf('::') >= 0 && values.role == null && values.status == null && values.brand_id == null) {
        var cleanName = cleanLegacyDisplayName(values.display_name);
        return originalFrom('user_profiles').update({
          display_name: cleanName,
          full_name: cleanName
        }, options).eq('id', values.id);
      }
      return originalUpsert(values, options);
    };
    return relation;
  }

  db.from = function (table) {
    if (table === 'products') return productRelation();
    if (table === 'user_profiles') return profileRelation();
    return originalFrom(table);
  };

  db.__hasnariaProfileAuthorityBridge = true;
  window.__HASNARIA_PROFILE_AUTHORITY = 'user_profiles';
})();
