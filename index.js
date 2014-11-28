var extend = require('extend');

function defaultURLSlugGeneration(text, separator) {
  var slug = text.toLowerCase().replace(/([^a-z0-9\-\_]+)/g, separator).replace(new RegExp(separator + '{2,}', 'g'), separator);
  if (slug.substr(-1) == separator) {
    slug = slug.substr(0, slug.length-1);
  }
  return slug;
}

var defaultOptions = {
  field: 'slug',
  addField: true,
  generator: defaultURLSlugGeneration,
  separator: '-',
  update: false,
  index: true,
  index_type: String,
  index_default: '',
  index_trim: true,
  index_unique: true,
  index_required: false,
  index_sparse: false,
  max_slug_length: null
};

module.exports = function(slugFields, options) {
  options = extend(true, defaultOptions, options);

  if (slugFields.indexOf(' ') > -1) {
    slugFields = slugFields.split(' ');
  }

  return (function (schema) {
    if (options.addField) {
      var schemaField = {};
      schemaField[options.field] = {type: options.index_type, default: options.index_default, trim: options.index_trim, index: options.index, unique: options.index_unique, required: options.index_required, sparse: options.index_sparse};
      schema.add(schemaField);
    }

    schema.methods.ensureUniqueSlug = function (slug, cb) {
      if (!options.index_unique) return cb(null, true, slug);
      var doc = this;
      var model = doc.constructor;
      var q = {};
      q[options.field] = new RegExp('^' + slug);
      q['_id'] = {$ne: doc._id};
      var fields = {};
      fields[options.field] = 1;
      model.find(q, fields).exec(function (e, docs) {
        if (e) return cb(e);
        else if (!docs.length) cb(null, true, slug);
        else {
          var max = docs.reduce(function (max, doc) {
            var docSlug = doc.get(options.field, String);
            var count = 1;
            if (docSlug != slug) {
              count = docSlug.match(new RegExp(slug + options.separator + '([0-9]+)$'));
              count = ((count instanceof Array)? parseInt(count[1]) : 0) + 1;
            }
            return (count > max)? count : max;
          }, 0);

          if (!max) return cb(null, false, slug);
          if (max == 1) max++ // avoid slug-1, rather do slug-2

          var suffix = options.separator + max

          if (options.max_slug_length) {
            cb(null, false, slug.substr(0, options.max_slug_length - suffix.length) + suffix);
          } else {
            return cb(null, false, slug + suffix)
          }
        }
      });
    };

    schema.statics.findBySlug = function (slug, fields, additionalOptions, cb) {
      var q = {};
      q[options.field] = slug;
      return this.findOne(q, fields, additionalOptions, cb);
    };

    schema.pre('validate', function (next) {
      var doc = this;
      var currentSlug = doc.get(options.field, String);
      if (!doc.isNew && !options.update && currentSlug) return next();

      var slugFieldsModified = doc.isNew? true : false;
      var toSlugify = '';
      if (slugFields instanceof Array) {
        for (var i = 0; i < slugFields.length; i++) {
          var slugField = slugFields[i];
          if (doc.isModified(slugField)) slugFieldsModified = true;
          var slugPart = doc.get(slugField, String);
          if (slugPart) toSlugify +=  slugPart + ' ';
        }
        toSlugify = toSlugify.substr(0, toSlugify.length-1);
      } else {
        if (doc.isModified(slugFields)) slugFieldsModified = true;
        toSlugify = doc.get(slugFields, String);
      }

      if (!slugFieldsModified) return next();

      var newSlug = options.generator(toSlugify, options.separator);

      if (options.max_slug_length) {
        newSlug = newSlug.substr(0, options.max_slug_length)
      }

      doc.ensureUniqueSlug(newSlug, function (e, exists, finalSlug) {
        if (e) return next(e);
        doc.set(options.field, finalSlug);
        doc.markModified(options.field, finalSlug); // sometimes required :)
        next();
      });

    });
  });
};