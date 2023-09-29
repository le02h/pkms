/*\
title: $:/plugins/tiddlywiki/filesystem/filesystemadaptor.js
type: application/javascript
module-type: syncadaptor

A sync adaptor module for synchronising with the local filesystem via node.js APIs

\*/
(function () {
  /* jslint node: true, browser: true */
  /* global $tw: false */
  'use strict'

  // Get a reference to the file system
  const path = $tw.node ? require('path') : null
  const NeDB = $tw.node ? require('nedb') : null

  function toDocument (tiddler) {
    const doc = {}
    for (const k in tiddler.fields) {
      const v = tiddler.fields[k]
      // k = k.replace('.', '/');
      doc[k] = v
    }
    return doc
  }

  function toTiddlerFields (doc) {
    const fields = {}
    for (const k in doc) {
      if (k === '_id') continue

      const v = doc[k]
      // k = k.replace('/', '.');
      fields[k] = v
    }
    return fields
  }

  function shouldSaveToFile (tiddler) {
    // check any item in the array is true
    const type = tiddler.fields.type || ''
    const patterns = [
      // any imates
      /^image\/.*$/,
      // json and javascript
      /^application\/(json|javascript)$/
    ]
    return patterns.reduce((pred, pattern) => pred || pattern.test(type), false)
  }

  function shouldSaveInMemory (tiddler) {
    return [
      (fields) => !!fields['draft.of'],
      (fields) => fields.title === '$:/Import',
      (fields) => fields.title === '$:/StoryList'
    ].reduce((a, f) => a || f(tiddler.fields), false)
  }

  function FileSystemAdaptor (options) {
    const self = this
    this.wiki = options.wiki
    this.boot = options.boot || $tw.boot
    this.logger = new $tw.utils.Logger('filesystem', { colour: 'green' })
    // Create the <wiki>/tiddlers folder if it doesn't exist
    $tw.utils.createDirectory(this.boot.wikiTiddlersPath)

    const wikiDir = this.boot.wikiTiddlersPath
    // <wiki>/tiddlers.db stores general tiddlers
    this.tiddlers_db = new NeDB({
      filename: path.join(wikiDir, '..', 'tiddlers.db'),
      autoload: true
    })
    this.tiddlers_db.ensureIndex({ fieldName: 'title' }, function (err) {
      if (err) self.logger.log(err)
    })
    // compact the db every 5 minutes
    this.tiddlers_db.persistence.setAutocompactionInterval(300 * 1000)
    // Draft tiddlers are stored in memory.
    this.memcache = {}
    // title -> _id
    this.tids = {}
  }

  FileSystemAdaptor.prototype.name = 'filesystem'

  FileSystemAdaptor.prototype.supportsLazyLoading = false

  FileSystemAdaptor.prototype.isReady = function () {
    // The file system adaptor is always ready
    return true
  }

  FileSystemAdaptor.prototype.getTiddlerInfo = function (tiddler) {
    // Returns the existing fileInfo for the tiddler. To regenerate, call getTiddlerFileInfo().
    const title = tiddler.fields.title
    const fileInfo = this.boot.files[title]
    const tid = this.tids[title]
    if (tid) {
      return { _id: tid }
    }
    return fileInfo || {}
  }

  /*
Return a fileInfo object for a tiddler, creating it if necessary:
  filepath: the absolute path to the file containing the tiddler
  type: the type of the tiddler file (NOT the type of the tiddler -- see below)
  hasMetaFile: true if the file also has a companion .meta file

The boot process populates this.boot.files for each of the tiddler files that it loads.
The type is found by looking up the extension in $tw.config.fileExtensionInfo (eg "application/x-tiddler" for ".tid" files).

It is the responsibility of the filesystem adaptor to update this.boot.files for new files that are created.
*/
  FileSystemAdaptor.prototype.getTiddlerFileInfo = function (tiddler, callback) {
    // Always generate a fileInfo object when this fuction is called
    const title = tiddler.fields.title
    let pathFilters, extFilters
    const fileInfo = this.boot.files[title]
    if (this.wiki.tiddlerExists('$:/config/FileSystemPaths')) {
      pathFilters = this.wiki.getTiddlerText('$:/config/FileSystemPaths', '').split('\n')
    }
    if (this.wiki.tiddlerExists('$:/config/FileSystemExtensions')) {
      extFilters = this.wiki.getTiddlerText('$:/config/FileSystemExtensions', '').split('\n')
    }
    const newInfo = $tw.utils.generateTiddlerFileInfo(tiddler, {
      directory: this.boot.wikiTiddlersPath,
      pathFilters,
      extFilters,
      wiki: this.wiki,
      fileInfo
    })
    callback(null, newInfo)
  }

  FileSystemAdaptor.prototype.getUpdatedTiddlers = function (syncer, callback) {
    const self = this
    this.tiddlers_db.find({ }, { _id: 1, title: 1 }, function (err, docs) {
      if (err) return callback(err)

      const deletions = []
      const modifications = []
      docs.forEach(function (doc) {
        if (!self.wiki.tiddlerExists(doc.title)) {
          modifications.push(doc.title)
          self.tids[doc.title] = doc._id
        }
      })
      callback(null, { modifications, deletions })
    })
  }

  /**
 * Save a tiddler.
 *  There are 4  types:
 *
 * 1. General tiddler are stored in tiddlers.db
 * 2. Tiddler title starts with `$:/` are stored in system.db
 * 3. images or any other type with .meta files are stored in <wiki>/tiddlers/ as files.
 * 4. draft tiddlers are stored in memory.
 */
  FileSystemAdaptor.prototype.saveTiddler = function (tiddler, callback, options) {
    const title = tiddler.fields.title
    if (shouldSaveInMemory(tiddler)) {
      // Draft tiddler saved in memory.
      this.memcache[title] = Object.assign({}, tiddler.fields)
      callback(null)
    } else if ($tw.boot.files[title] || shouldSaveToFile(tiddler)) {
      this.saveTiddlerToFile(tiddler, callback, options)
    } else {
      this.saveTiddlerToNeDB(tiddler, this.tiddlers_db, callback)
    }
  }

  FileSystemAdaptor.prototype.saveTiddlerToNeDB = function (tiddler, db, callback) {
    const title = tiddler.fields.title
    const doc = toDocument(tiddler)
    db.update({ title }, doc, { upsert: true }, function (err, numReplaced) {
      if (err) return callback(err)
      callback(null)
    })
  }

  FileSystemAdaptor.prototype.saveTiddlerToFile = function (tiddler, callback, options) {
    const self = this
    const title = tiddler.fields.title
    const syncerInfo = options.tiddlerInfo || {}
    this.getTiddlerFileInfo(tiddler, function (err, fileInfo) {
      if (err) {
        return callback(err)
      }
      $tw.utils.saveTiddlerToFile(tiddler, fileInfo, function (err, fileInfo) {
        if (err) {
          if ((err.code === 'EPERM' || err.code === 'EACCES') && err.syscall === 'open') {
            fileInfo = fileInfo || self.boot.files[title]
            fileInfo.writeError = true
            self.boot.files[title] = fileInfo
            $tw.syncer.logger.log(`Sync failed for "${title}" and will be retried with encoded filepath`, encodeURIComponent(fileInfo.filepath))
            return callback(err)
          } else {
            return callback(err)
          }
        }
        // Store new boot info only after successful writes
        self.boot.files[title] = fileInfo
        // Cleanup duplicates if the file moved or changed extensions
        const options = {
          adaptorInfo: syncerInfo.adaptorInfo || {},
          bootInfo: fileInfo || {},
          title: tiddler.fields.title
        }
        $tw.utils.cleanupTiddlerFiles(options, function (err, fileInfo) {
          if (err) {
            return callback(err)
          }
          return callback(null, fileInfo)
        })
      })
    })
  }

  /*
Load a tiddler and invoke the callback with (err,tiddlerFields)

We don't need to implement loading for the file system adaptor, because all the tiddler files will have been loaded during the boot process.
*/
  FileSystemAdaptor.prototype.loadTiddler = function (title, callback) {
    const self = this
    if (self.memcache[title]) {
      callback(null, self.memcache[title])
    } else {
      this.loadTiddlerFromNeDB(title, this.tiddlers_db, callback)
    }
  }

  FileSystemAdaptor.prototype.loadTiddlerFromNeDB = function (title, db, callback) {
    const self = this
    const tid = this.tids[title]
    const query = tid ? { _id: tid } : { title }
    db.findOne(query, function (err, doc) {
      if (err) return callback(err)
      if (!tid) {
        self.tids[title] = tid
      }
      callback(null, toTiddlerFields(doc))
    })
  }

  /*
Delete a tiddler and invoke the callback with (err)
*/
  FileSystemAdaptor.prototype.deleteTiddler = function (title, callback, options) {
    const self = this

    if (this.memcache[title]) {
      delete self.memcache[title]
      callback(null, null)
    } else if ($tw.wiki.isSystemTiddler(title)) {
      this.system_db.remove({ title }, {}, function (err) {
        callback(err, null)
      })
    } else if (this.boot.files[title]) {
      this.deleteTiddlerFile(title, callback)
    } else {
      this.tiddlers_db.remove({ title }, { multi: false }, function (err) {
        callback(err, null)
      })
    }
  }

  FileSystemAdaptor.prototype.deleteTiddlerFile = function (title, callback) {
    const self = this
    const fileInfo = this.boot.files[title]
    // Only delete the tiddler if we have writable information for the file
    if (fileInfo) {
      $tw.utils.deleteTiddlerFile(fileInfo, function (err, fileInfo) {
        if (err) {
          if ((err.code === 'EPERM' || err.code === 'EACCES') && err.syscall === 'unlink') {
            // Error deleting the file on disk, should fail gracefully
            $tw.syncer.displayError(`Server desynchronized. Error deleting file for deleted tiddler "${title}"`, err)
            return callback(null, fileInfo)
          } else {
            return callback(err)
          }
        }
        // Remove the tiddler from self.boot.files & return null adaptorInfo
        self.removeTiddlerFileInfo(title)
        return callback(null, null)
      })
    } else {
      callback(null, null)
    }
  }

  /*
Delete a tiddler in cache, without modifying file system.
*/
  FileSystemAdaptor.prototype.removeTiddlerFileInfo = function (title) {
    // Only delete the tiddler info if we have writable information for the file
    if (this.boot.files[title]) {
      delete this.boot.files[title]
    };
  }

  if ($tw.node) {
    exports.adaptorClass = FileSystemAdaptor
  }
})()
